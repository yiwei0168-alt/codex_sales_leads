import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({sql:vi.fn(),read:vi.fn(),evidence:vi.fn()}));
vi.mock("@/lib/rag/db",()=>({transaction:async(run:(client:{query:typeof mocks.sql})=>unknown)=>run({query:mocks.sql}),query:mocks.read}));
vi.mock("./search-rate-reference",()=>({SEARCH_RATE_SOURCES:[
  {sourceKey:"brave-search-public-pricing-v1",tariffKey:"brave-standard-web-search",kind:"brave"},
  {sourceKey:"tavily-search-public-pricing-v1",tariffKey:"tavily-standard-search",kind:"tavily"},
  {sourceKey:"exa-search-public-pricing-v1",tariffKey:"exa-company-auto-text-search",kind:"exa"},
  {sourceKey:"google-places-text-enterprise-public-pricing-v1",tariffKey:"google-places-text-search-enterprise",kind:"places"}],
  fetchSearchRateEvidence:mocks.evidence}));
import {refreshSearchRateEvidence,readSearchRateStatuses} from "./search-rate-repository";
const now=Date.parse("2026-09-14T00:00:00Z");
const sourceKeys=["brave-search-public-pricing-v1","tavily-search-public-pricing-v1",
  "exa-search-public-pricing-v1","google-places-text-enterprise-public-pricing-v1"];
beforeEach(()=>{
  mocks.sql.mockReset().mockImplementation(async(text:string)=>({rows:text.includes("pg_try_advisory")?[{locked:true}]:[]}));
  mocks.read.mockReset();mocks.evidence.mockReset().mockImplementation(async(source:{sourceKey:string;tariffKey:string},get:typeof fetch)=>{
    await get(`https://example.test/${source.sourceKey}`);
    return {sourceKey:source.sourceKey,tariffKey:source.tariffKey,sourceHash:"a".repeat(64),bytes:100,
      status:"validated",evidence:{observed:{price:5}},paidCalls:0,tariffAdmitted:false};
  });
});
it("checks four independent official pages once and does not touch paid accounting",async()=>{
  const transport=vi.fn(async()=>new Response());
  const result=await refreshSearchRateEvidence(transport as typeof fetch,now);
  expect(result).toMatchObject({status:"checked",httpCalls:4,
    states:[{status:"validated",hold:false,nextAttemptAt:"2026-09-15T00:00:00.000Z"},
      {status:"validated",hold:false,nextAttemptAt:"2026-09-15T00:00:00.000Z"},
      {status:"validated",hold:false,nextAttemptAt:"2026-09-15T00:00:00.000Z"},
      {status:"validated",hold:false,nextAttemptAt:"2026-09-15T00:00:00.000Z"}]});
  expect(mocks.evidence).toHaveBeenCalledTimes(4);expect(transport).toHaveBeenCalledTimes(4);
  const observations=mocks.sql.mock.calls.filter(call=>call[0].includes("insert into billing_tariff_refresh_observation"))
    .map(call=>JSON.parse(call[1][3]));
  expect(observations.map(item=>item.freeHttpRequests)).toEqual([1,1,1,1]);
  expect(observations.map(item=>item.validOutputItems)).toEqual([1,1,1,1]);
  expect(observations.map(item=>item.downstreamUsedItems)).toEqual([1,1,1,1]);
  expect(mocks.sql.mock.calls.some(call=>/update paid_call|update user_spend_budget|insert into paid_rule_hold/.test(call[0]))).toBe(false);
});
it("holds only the changed source and keeps its hold on later outages",async()=>{
  mocks.evidence.mockImplementation(async(source:{sourceKey:string;tariffKey:string},get:typeof fetch)=>{
    await get(`https://example.test/${source.sourceKey}`);
    return {sourceKey:source.sourceKey,tariffKey:source.tariffKey,sourceHash:"a".repeat(64),bytes:100,
      status:source.sourceKey===sourceKeys[0]?"review-required":"validated",evidence:{observed:null}};
  });
  expect((await refreshSearchRateEvidence(vi.fn(async()=>new Response()) as typeof fetch,now)).states.map(item=>item.hold))
    .toEqual([true,false,false,false]);
  let observations=mocks.sql.mock.calls.filter(call=>call[0].includes("insert into billing_tariff_refresh_observation"))
    .map(call=>JSON.parse(call[1][3]));
  expect(observations.map(item=>[item.validOutputItems,item.downstreamUsedItems])).toEqual([[0,0],[1,1],[1,1],[1,1]]);
  mocks.sql.mockClear().mockImplementation(async(text:string)=>({rows:text.includes("pg_try_advisory")?[{locked:true}]
    :text.includes("select source_key,next_attempt_at")?[{source_key:sourceKeys[0],next_attempt_at:new Date(now-1),hold:true}]:[]}));
  mocks.evidence.mockReset().mockImplementation(async(source:{sourceKey:string;tariffKey:string})=>({
    sourceKey:source.sourceKey,tariffKey:source.tariffKey,sourceHash:"b".repeat(64),bytes:100,
    status:"validated",evidence:{observed:{price:5}}}));
  expect((await refreshSearchRateEvidence(vi.fn(),now)).states[0]).toMatchObject({status:"review-required",hold:true});
  observations=mocks.sql.mock.calls.filter(call=>call[0].includes("insert into billing_tariff_refresh_observation"))
    .map(call=>JSON.parse(call[1][3]));
  expect(observations[0]).toMatchObject({generatedOutputItems:1,validOutputItems:1,
    downstreamUsedItems:0,utilizationEfficiency:0,discardedReasonCounts:{priorTariffHoldAwaitingReview:1}});
  mocks.sql.mockClear();
  mocks.evidence.mockRejectedValue(new Error("private transport detail"));
  const result=await refreshSearchRateEvidence(vi.fn(),now);
  expect(result.states.map(item=>[item.status,item.hold])).toEqual([
    ["unavailable",true],["unavailable",false],["unavailable",false],["unavailable",false]]);
  expect(JSON.stringify(mocks.sql.mock.calls)).not.toContain("private transport detail");
});
it.each(["lock","not-due"])("skips public GET when %s blocks refresh",async condition=>{
  mocks.sql.mockImplementation(async(text:string)=>({rows:text.includes("pg_try_advisory")?[{locked:condition!=="lock"}]
    :sourceKeys.map(source_key=>({source_key,next_attempt_at:new Date(now+1000),hold:false}))}));
  expect((await refreshSearchRateEvidence(vi.fn(),now)).httpCalls).toBe(0);
  expect(mocks.evidence).not.toHaveBeenCalled();
});
it("returns explicit missing states for all Search entries",async()=>{
  mocks.read.mockResolvedValueOnce([]);
  expect((await readSearchRateStatuses()).map(item=>item.status)).toEqual(["missing","missing","missing","missing"]);
});
