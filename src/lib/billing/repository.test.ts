import {beforeEach,expect,it,vi} from "vitest";
const query=vi.hoisted(()=>vi.fn());
vi.mock("@/lib/rag/db",()=>({tenantQuery:vi.fn(),tenantTransaction:async(_u:string,run:(c:unknown)=>unknown)=>run({query})}));
import {reservePaidCall,settlePaidCall} from "./repository";
const input={operationId:"operation",stage:"score",tariffKey:"rule",tariffVersion:"v1",maximumChargeMicros:10,requestBytes:100};
beforeEach(()=>query.mockReset());
it("locks budget before reserving and refuses a concurrent caller's reduced remainder",async()=>{
  query.mockResolvedValueOnce({rows:[{limit_micros:"100",occupied_micros:"95",frozen:false}]});
  await expect(reservePaidCall("owner",input)).rejects.toThrow("budget-exhausted");expect(query).toHaveBeenCalledTimes(1);
  expect(query.mock.calls[0][0]).toContain("for update");
});
it("blocks a duplicate guarded request under the owner lock before creating a second reservation",async()=>{
  query.mockResolvedValueOnce({rows:[{limit_micros:"100",occupied_micros:"10",frozen:false}]}).mockResolvedValueOnce({rows:[{id:"existing"}]});
  await expect(reservePaidCall("owner",{...input,requestFingerprint:"a".repeat(64)})).rejects.toThrow("paid-request-already-recorded");
  expect(query).toHaveBeenCalledTimes(2);
  expect(query.mock.calls[1][1]).toEqual(["owner","operation","score","a".repeat(64)]);
  expect(query.mock.calls.some(([sql])=>String(sql).includes("insert into"))).toBe(false);
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
