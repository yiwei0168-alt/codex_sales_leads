import {afterEach,beforeEach,expect,it,vi} from "vitest";
const query=vi.hoisted(()=>vi.fn());
vi.mock("@/lib/rag/db",()=>({tenantQuery:vi.fn(),tenantTransaction:async(_u:string,run:(c:unknown)=>unknown)=>run({query})}));
import {reservePaidCall,settlePaidCall,assertProcessingRecoveryCostsKnown,assertUncheckpointedQualificationResponsesAbsent,setTaskSpendBudget} from "./repository";
import {tenantQuery} from "@/lib/rag/db";
const input={operationId:"operation",stage:"score",tariffKey:"rule",tariffVersion:"v1",maximumChargeMicros:10,requestBytes:100};
beforeEach(()=>query.mockReset());
afterEach(()=>vi.unstubAllEnvs());
it("blocks repair batch changes while any operation request is unknown and keeps tenant ownership", async () => {
  vi.mocked(tenantQuery).mockResolvedValueOnce([{ id: "unknown" }]).mockResolvedValueOnce([]);
  await expect(assertProcessingRecoveryCostsKnown("owner", "operation")).rejects.toThrow("paid-request-already-recorded");
  await expect(assertProcessingRecoveryCostsKnown("other", "operation")).resolves.toBeUndefined();
  expect(tenantQuery).toHaveBeenLastCalledWith("other", expect.stringContaining("user_id=$1 and operation_id=$2"), ["other", "operation", false]);
});
it("blocks only an uncheckpointed paid score for the missing company and keeps the tenant scope", async()=>{
  const key="a".repeat(64),checkpoint="2026-09-14T00:00:00.000Z";
  vi.mocked(tenantQuery).mockResolvedValueOnce([{id:"lost-output"}]).mockResolvedValueOnce([]);
  await expect(assertUncheckpointedQualificationResponsesAbsent("owner","action",checkpoint,[key]))
    .rejects.toThrow("paid-request-already-recorded");
  await expect(assertUncheckpointedQualificationResponsesAbsent("other","action",checkpoint,[key]))
    .resolves.toBeUndefined();
  expect(tenantQuery).toHaveBeenLastCalledWith("other",expect.stringContaining("created_at >= $3::timestamptz"),
    ["other","action",checkpoint,[key]]);
  expect(vi.mocked(tenantQuery).mock.calls.at(-1)?.[1]).toContain("metrics->'costAttribution'->'companyKeys' ?|");
});
it("locks budget before reserving and refuses a concurrent caller's reduced remainder",async()=>{
  query.mockResolvedValueOnce({rows:[{limit_micros:"100",occupied_micros:"95",frozen:false}]});
  await expect(reservePaidCall("owner",input)).rejects.toThrow("budget-exhausted");expect(query).toHaveBeenCalledTimes(1);
  expect(query.mock.calls[0][0]).toContain("for update");
});
it("blocks a duplicate guarded request under the owner lock before creating a second reservation",async()=>{
  query.mockResolvedValueOnce({rows:[{limit_micros:"100",occupied_micros:"10",frozen:false}]}).mockResolvedValueOnce({rows:[{id:"existing"}]});
  await expect(reservePaidCall("owner",{...input,requestFingerprint:"a".repeat(64)})).rejects.toThrow("paid-request-already-recorded");
  expect(query).toHaveBeenCalledTimes(2);
  expect(query.mock.calls[1][1]).toEqual(["owner","operation","score","a".repeat(64),false]);
  expect(query.mock.calls.some(([sql])=>String(sql).includes("insert into"))).toBe(false);
});
it("audits A29 while allowing owner-scoped unknown replay and budget overage",async()=>{
  vi.stubEnv("PAID_CALL_STAGE_OVERRIDE","A29");
  vi.stubEnv("PAID_CALL_STAGE_OVERRIDE_USER_ID","owner");
  query.mockResolvedValueOnce({rows:[{limit_micros:"100",occupied_micros:"95",frozen:false}]})
    .mockResolvedValueOnce({rows:[]})
    .mockResolvedValueOnce({rows:[{action_id:"parent",limit_micros:"96",occupied_micros:"95",blocking_prior_request:true,blocking_non_replayable_request:false}]})
    .mockResolvedValueOnce({rows:[{id:"override-reserve"}]})
    .mockResolvedValueOnce({rows:[]});
  expect(await reservePaidCall("owner",{...input,requestFingerprint:"a".repeat(64)})).toBe("override-reserve");
  expect(query.mock.calls[1][1]).toEqual(["owner","operation","score","a".repeat(64),true]);
  expect(JSON.parse(query.mock.calls[3][1][6]).admissionOverride).toEqual({ruleId:"A29",allowBudgetOverage:true,allowUnknownReplay:true});
});
it("rejects malformed request fingerprints without writing",async()=>{
  query.mockResolvedValueOnce({rows:[{limit_micros:"100",occupied_micros:"10",frozen:false}]});
  await expect(reservePaidCall("owner",{...input,requestFingerprint:"raw private request"})).rejects.toThrow("request-out-of-bounds");
  expect(query).toHaveBeenCalledTimes(1);
});
it("atomically records the reservation before increasing occupied amount",async()=>{
  query.mockResolvedValueOnce({rows:[{limit_micros:"100",occupied_micros:"90",frozen:false}]}).mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[{id:"reserve"}]}).mockResolvedValue({rows:[]});
  expect(await reservePaidCall("owner",input)).toBe("reserve");expect(query.mock.calls[3][1]).toEqual(["owner",10]);
});
it("stores separate reservation allocation with attribution and increases spend only once",async()=>{
  query.mockResolvedValueOnce({rows:[{limit_micros:"100",occupied_micros:"0",frozen:false}]}).mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[{id:"reserve"}]}).mockResolvedValue({rows:[]});
  await reservePaidCall("owner",{...input,costAttribution:{version:"company-cost-attribution-v1",kind:"company-inputs",roundKey:null,companyKeys:["a".repeat(64),"b".repeat(64)]}});
  const metrics=JSON.parse(query.mock.calls[2][1][6]);
  expect(metrics.reservationAllocation).toMatchObject({basis:"reservation",sourceAmountMicros:10,additionalSpendMicros:0});
  expect(metrics.reservationAllocation.shares.map((row:{amountMicros:number})=>row.amountMicros)).toEqual([5,5]);
  expect(query.mock.calls.filter(([sql])=>sql.includes("update user_spend_budget"))).toHaveLength(1);
});
it("preserves native reservation and the versioned FX source in the same reservation record",async()=>{
  query.mockResolvedValueOnce({rows:[{limit_micros:"100",occupied_micros:"0",frozen:false}]}).mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[{id:"reserve"}]}).mockResolvedValue({rows:[]});
  const foreignCostBound={currency:"CNY",maximumNativeMicros:50,fx:{usdNumerator:"1",nativeDenominator:"7",asOf:"2026-09-13T00:00:00Z",retrievedAt:"2026-09-13T00:00:00Z",reference:"https://example.test/fx",version:"synthetic"}};
  await reservePaidCall("owner",{...input,foreignCostBound});
  expect(JSON.parse(query.mock.calls[2][1][6])).toMatchObject({foreignCostBound,fxReservationBufferPercent:5});
});
it("enforces the task cap even when the owner has spare budget",async()=>{
  query.mockResolvedValueOnce({rows:[{limit_micros:"1000",occupied_micros:"20",frozen:false}]}).mockResolvedValueOnce({rows:[{limit_micros:"25",occupied_micros:"20"}]});
  await expect(reservePaidCall("owner",input)).rejects.toThrow("task-budget-exhausted");expect(query).toHaveBeenCalledTimes(2);
});
it.each(["parent","child"])("enforces the %s cap for linked recovery",async limiting=>{
  query.mockResolvedValueOnce({rows:[{limit_micros:"1000",occupied_micros:"20",frozen:false}]})
    .mockResolvedValueOnce({rows:["parent","child"].map(action_id=>({action_id,limit_micros:action_id===limiting?"25":"100",occupied_micros:"20",blocking_prior_request:false}))});
  await expect(reservePaidCall("owner",input)).rejects.toThrow("task-budget-exhausted");
  expect(query).toHaveBeenCalledTimes(2);
});
it("blocks unknown ancestor fees even without a task cap",async()=>{
  query.mockResolvedValueOnce({rows:[{limit_micros:"1000",occupied_micros:"20",frozen:false}]})
    .mockResolvedValueOnce({rows:[{action_id:"parent",limit_micros:null,occupied_micros:"20",blocking_prior_request:true}]});
  await expect(reservePaidCall("owner",input)).rejects.toThrow("paid-request-already-recorded");
  expect(query).toHaveBeenCalledTimes(2);
});
it("refuses lowering a parent cap below its recovery family occupancy",async()=>{
  query.mockResolvedValueOnce({rowCount:1,rows:[{id:"parent"}]})
    .mockResolvedValueOnce({rowCount:1,rows:[{user_id:"owner"}]})
    .mockResolvedValueOnce({rows:[{action_id:"parent",limit_micros:"100",occupied_micros:"30",blocking_prior_request:false}]});
  await expect(setTaskSpendBudget("owner","parent",25)).rejects.toThrow("任务预算不能低于已占用预留");
  expect(query).toHaveBeenCalledTimes(3);
  expect(query.mock.calls[1][0]).toContain("for update");
});
it("retains unknown charges and suspends only the affected tariff if reported charge violates bound",async()=>{
  query.mockResolvedValue({rows:[{reserved_micros:"10",tariff_key:"rule",tariff_version:"v1"}]});
  await settlePaidCall("owner","id",{reportedMicros:null,latencyMs:1,responseBytes:null,inputTokens:null,outputTokens:null,succeeded:false});
  expect(query).toHaveBeenCalledTimes(3);
  await settlePaidCall("owner","id",{reportedMicros:11,latencyMs:1,responseBytes:5,inputTokens:1,outputTokens:1,succeeded:true});
  expect(query.mock.calls.at(-1)?.[0]).toContain("insert into paid_rule_hold");
  expect(query.mock.calls.at(-1)?.[1]).toEqual(["owner","rule","v1"]);
  expect(query.mock.calls.some(([sql])=>String(sql).includes("frozen=true"))).toBe(false);
  expect(query.mock.calls.some(([sql,values])=>String(sql).includes("occupied_micros=occupied_micros+$2")&&values[1]===1)).toBe(true);
  expect(query.mock.calls.some(([sql])=>String(sql).includes("occupied_micros-"))).toBe(false);
});
it("refuses only the tariff held by a prior overrun",async()=>{
  query.mockResolvedValueOnce({rows:[{limit_micros:"100",occupied_micros:"10",frozen:false,rule_held:true}]});
  await expect(reservePaidCall("owner",input)).rejects.toThrow("tariff-suspended");
  expect(query).toHaveBeenCalledTimes(1);
});
it("blocks a globally held public-rate contract before reserving any user's spend",async()=>{
  query.mockResolvedValueOnce({rows:[{limit_micros:"100",occupied_micros:"10",frozen:false,rate_review_held:true}]});
  await expect(reservePaidCall("owner",input)).rejects.toThrow("tariff-suspended");
  expect(query).toHaveBeenCalledTimes(1);
  expect(query.mock.calls[0][0]).toContain("billing_tariff_refresh_state where tariff_key=any($4::text[]) and hold");
  expect(query.mock.calls[0][1][3]).toEqual(["rule"]);
});
it("shares a held public Sol rate with the S01 playbook tariff",async()=>{
  query.mockResolvedValueOnce({rows:[{limit_micros:"30000000",occupied_micros:"0",frozen:false,rate_review_held:true}]});
  await expect(reservePaidCall("owner",{...input,tariffKey:"openrouter-sol-openai-playbook-credits"}))
    .rejects.toThrow("tariff-suspended");
  expect(query.mock.calls[0][1][3]).toEqual(["openrouter-sol-openai-playbook-credits","openrouter-sol-credits-standard-text-json"]);
  expect(query).toHaveBeenCalledTimes(1);
});
