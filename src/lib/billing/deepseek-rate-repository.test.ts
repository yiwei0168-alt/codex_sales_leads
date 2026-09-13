import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({sql:vi.fn(),read:vi.fn(),evidence:vi.fn()}));
vi.mock("@/lib/rag/db",()=>({transaction:async(run:(client:{query:typeof mocks.sql})=>unknown)=>run({query:mocks.sql}),query:mocks.read}));
vi.mock("./deepseek-rate-reference",()=>({
  DEEPSEEK_RATE_SOURCES:[
    {sourceKey:"deepseek-flash-public-pricing-v1",tariffKey:"deepseek-flash-v41-text-json",model:"deepseek-flash"},
    {sourceKey:"deepseek-pro-public-pricing-v1",tariffKey:"deepseek-pro-0813-nonthinking-text",model:"deepseek-v4-pro"}],
  fetchDeepSeekRateEvidence:mocks.evidence}));
import {refreshDeepSeekRateEvidence,readDeepSeekRateStatuses} from "./deepseek-rate-repository";
const now=Date.parse("2026-09-14T00:00:00Z");
const evidence={sourceHash:"a".repeat(64),bytes:100,paidCalls:0,tariffAdmitted:false,items:[
  {sourceKey:"deepseek-flash-public-pricing-v1",tariffKey:"deepseek-flash-v41-text-json",status:"validated",evidence:{model:"flash"}},
  {sourceKey:"deepseek-pro-public-pricing-v1",tariffKey:"deepseek-pro-0813-nonthinking-text",status:"validated",evidence:{model:"pro"}}]};
beforeEach(()=>{
  mocks.sql.mockReset().mockImplementation(async(text:string)=>({rows:text.includes("pg_try_advisory")?[{locked:true}]:[]}));
  mocks.read.mockReset();mocks.evidence.mockReset().mockResolvedValue(evidence);
});
it("uses one public read for two static rules and conserves shared metrics",async()=>{
  const transport=vi.fn(async()=>new Response());
  mocks.evidence.mockImplementationOnce(async(get:typeof fetch)=>{await get("https://api-docs.deepseek.com/quick_start/pricing/");return evidence;});
  const result=await refreshDeepSeekRateEvidence(transport as typeof fetch,now);
  expect(result).toMatchObject({status:"checked",httpCalls:1,
    states:[{status:"validated",hold:false,nextAttemptAt:"2026-09-15T00:00:00.000Z"},
      {status:"validated",hold:false,nextAttemptAt:"2026-09-15T00:00:00.000Z"}]});
  expect(mocks.evidence).toHaveBeenCalledOnce();
  const observations=mocks.sql.mock.calls.filter(call=>call[0].includes("insert into billing_tariff_refresh_observation"))
    .map(call=>JSON.parse(call[1][3]));
  expect(observations.map(item=>item.freeHttpRequests)).toEqual([1,0]);
  expect(observations.map(item=>item.outputBytes)).toEqual([100,0]);
  expect(mocks.sql.mock.calls.some(call=>/update paid_call|update user_spend_budget|insert into paid_rule_hold/.test(call[0]))).toBe(false);
});
it("keeps a drift hold sticky when the next public page is unchanged or unavailable",async()=>{
  mocks.evidence.mockResolvedValueOnce({...evidence,items:[{...evidence.items[0],status:"review-required"},evidence.items[1]]});
  expect((await refreshDeepSeekRateEvidence(vi.fn(),now)).states.map(item=>item.hold)).toEqual([true,false]);
  mocks.sql.mockClear().mockImplementation(async(text:string)=>({rows:text.includes("pg_try_advisory")?[{locked:true}]
    :text.includes("select source_key,next_attempt_at")?[{source_key:"deepseek-flash-public-pricing-v1",next_attempt_at:new Date(now-1),hold:true}]:[]}));
  expect((await refreshDeepSeekRateEvidence(vi.fn(),now)).states[0].hold).toBe(true);
  mocks.evidence.mockRejectedValueOnce(new Error("private transport detail"));
  mocks.sql.mockClear();
  expect((await refreshDeepSeekRateEvidence(vi.fn(),now)).states[0].hold).toBe(true);
  expect(JSON.stringify(mocks.sql.mock.calls)).not.toContain("private transport detail");
});
it.each(["lock","not-due"])("skips source GET when %s blocks refresh",async condition=>{
  mocks.sql.mockImplementation(async(text:string)=>({rows:text.includes("pg_try_advisory")?[{locked:condition!=="lock"}]
    :[{source_key:"deepseek-flash-public-pricing-v1",next_attempt_at:new Date(now+1000),hold:false},
      {source_key:"deepseek-pro-public-pricing-v1",next_attempt_at:new Date(now+1000),hold:false}]}));
  expect((await refreshDeepSeekRateEvidence(vi.fn(),now)).httpCalls).toBe(0);
  expect(mocks.evidence).not.toHaveBeenCalled();
});
it("returns explicit missing states for the read-only status surface",async()=>{
  mocks.read.mockResolvedValueOnce([]);
  expect((await readDeepSeekRateStatuses()).map(item=>item.status)).toEqual(["missing","missing"]);
});
