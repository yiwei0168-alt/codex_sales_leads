import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({sql:vi.fn(),read:vi.fn(),evidence:vi.fn()}));
vi.mock("@/lib/rag/db",()=>({transaction:async(run:(client:{query:typeof mocks.sql})=>unknown)=>run({query:mocks.sql}),query:mocks.read}));
vi.mock("./openrouter-rate-reference",()=>({OPENROUTER_SOL_RATE_SOURCE:"openrouter-sol-standard-text-json-v1",
  OPENROUTER_SOL_TARIFF_KEY:"openrouter-sol-credits-standard-text-json",fetchOpenRouterSolRateEvidence:mocks.evidence}));
import {refreshOpenRouterSolRateEvidence,readOpenRouterSolRateStatus} from "./openrouter-rate-repository";
const now=Date.parse("2026-09-14T00:00:00Z");
const evidence={status:"validated",sourceHash:"a".repeat(64),bytes:100,evidence:{sources:[],model:{},audit:{}},paidCalls:0,tariffAdmitted:false};
beforeEach(()=>{
  mocks.sql.mockReset().mockImplementation(async(text:string)=>({rows:text.includes("pg_try_advisory")?[{locked:true}]:[]}));
  mocks.read.mockReset();mocks.evidence.mockReset().mockResolvedValue(evidence);
});
it("shares a seven-day public snapshot and never changes the static tariff",async()=>{
  const result=await refreshOpenRouterSolRateEvidence(vi.fn(),now);
  expect(result).toMatchObject({status:"validated",nextAttemptAt:"2026-09-21T00:00:00.000Z",hold:false});
  expect(mocks.sql.mock.calls.some(call=>call[0].includes("insert into billing_tariff_evidence_snapshot"))).toBe(true);
  expect(mocks.sql.mock.calls.some(call=>/update paid_call|update user_spend_budget|insert into paid_rule_hold/.test(call[0]))).toBe(false);
  const observation=mocks.sql.mock.calls.find(call=>call[0].includes("insert into billing_tariff_refresh_observation"))!;
  expect(JSON.parse(observation[1][3])).toMatchObject({costUsd:0,apiCredits:0,inputTokens:0,outputTokens:0,retries:0});
});
it("makes review holds sticky across a later unchanged read and an outage",async()=>{
  mocks.evidence.mockResolvedValueOnce({...evidence,status:"review-required"});
  expect((await refreshOpenRouterSolRateEvidence(vi.fn(),now)).hold).toBe(true);
  let state=mocks.sql.mock.calls.find(call=>call[0].includes("insert into billing_tariff_refresh_state"))!;
  expect(state[1].at(-1)).toBe(true);
  mocks.sql.mockClear().mockImplementation(async(text:string)=>({rows:text.includes("pg_try_advisory")?[{locked:true}]
    :text.includes("select next_attempt_at")?[{next_attempt_at:new Date(now-1),hold:true}]:[]}));
  expect((await refreshOpenRouterSolRateEvidence(vi.fn(),now)).status).toBe("review-required");
  mocks.evidence.mockRejectedValueOnce(new Error("raw private transport detail"));
  mocks.sql.mockClear();
  expect((await refreshOpenRouterSolRateEvidence(vi.fn(),now)).status).toBe("unavailable");
  state=mocks.sql.mock.calls.find(call=>call[0].includes("insert into billing_tariff_refresh_state"))!;
  expect(state[1].at(-1)).toBe(true);
  expect(JSON.stringify(mocks.sql.mock.calls)).not.toContain("raw private transport detail");
  expect(mocks.sql.mock.calls.some(call=>call[0].includes("insert into billing_tariff_evidence_snapshot"))).toBe(false);
});
it.each(["locked","not-due"])("does not fetch again when %s",async condition=>{
  mocks.sql.mockImplementation(async(text:string)=>({rows:text.includes("pg_try_advisory")?[{locked:condition!=="locked"}]
    :[{next_attempt_at:new Date(now+1000),hold:false}]}));
  expect((await refreshOpenRouterSolRateEvidence(vi.fn(),now)).httpCalls).toBe(0);
  expect(mocks.evidence).not.toHaveBeenCalled();
});
it("reports missing public evidence as unknown without refreshing or claiming adoption",async()=>{
  mocks.read.mockResolvedValueOnce([]);
  expect(await readOpenRouterSolRateStatus()).toEqual({checkedAt:null,nextAttemptAt:null,status:"missing",hold:false});
  expect(mocks.sql).not.toHaveBeenCalled();
});
