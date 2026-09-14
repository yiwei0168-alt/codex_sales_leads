import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({sql:vi.fn(),read:vi.fn()}));
vi.mock("@/lib/rag/db",()=>({transaction:async(run:(client:{query:typeof mocks.sql})=>unknown)=>run({query:mocks.sql}),query:mocks.read}));
import {refreshBillingFxReference,readCurrentCnyFxReference,readBillingReferenceStatus} from "./fx-reference-repository";
import {parseEcbCnyReference} from "./ecb-reference";
import {withSpendContext} from "./context";
const time=Date.parse("2026-09-13T05:00:00Z");
const xml="<Cube><Cube time='2026-09-11'><Cube currency='USD' rate='1.1592'/><Cube currency='CNY' rate='7.7762'/></Cube></Cube>";
beforeEach(()=>{mocks.sql.mockReset().mockImplementation(async(text:string)=>({rows:text.includes("pg_try_advisory")?[{locked:true}]:[]}));mocks.read.mockReset();});
it("observes reference failures as unknown without a refresh or snapshot mutation",async()=>{
  mocks.read.mockRejectedValue(new Error("database unavailable"));
  expect((await readBillingReferenceStatus(time)).fx).toMatchObject({status:"unavailable",effectiveExpiresAt:null});
  mocks.read.mockResolvedValue([]);
  expect((await readBillingReferenceStatus(time)).fx.status).toBe("missing");
  expect(mocks.sql).not.toHaveBeenCalled();
});
it("stores a valid public reference with zero paid cost and defers the next successful refresh by one week",async()=>{
  const result=await refreshBillingFxReference(vi.fn().mockResolvedValue(new Response(xml)),time);
  expect(result).toMatchObject({status:"validated",httpCalls:1,nextAttemptAt:"2026-09-20T05:00:00.000Z"});
  expect(mocks.sql.mock.calls.some(call=>call[0].includes("insert into billing_fx_reference_snapshot"))).toBe(true);
  const log=mocks.sql.mock.calls.find(call=>call[0].includes("insert into billing_reference_refresh_observation"))!;
  expect(JSON.parse(log[1][3])).toMatchObject({costUsd:0,apiCredits:0,inputTokens:0,outputTokens:0,freeHttpRequests:1,validOutputItems:1});
});
it.each(["another-process","not-due"])("does not fetch again when %s",async state=>{
  mocks.sql.mockImplementation(async(text:string)=>({rows:text.includes("pg_try_advisory")?[{locked:state!=="another-process"}]:[{next_attempt_at:new Date(time+10000)}]}));
  const transport=vi.fn();expect((await refreshBillingFxReference(transport,time)).httpCalls).toBe(0);
  expect(transport).not.toHaveBeenCalled();
});
it("retains old snapshots on failure, bounds recovery frequency and does not log the raw error",async()=>{
  const result=await refreshBillingFxReference(vi.fn().mockRejectedValue(new Error("private-raw-error")),time);
  expect(result).toMatchObject({status:"unavailable",nextAttemptAt:"2026-09-13T06:00:00.000Z"});
  expect(mocks.sql.mock.calls.some(call=>/insert into billing_fx_reference_snapshot|delete from|update billing_fx_reference_snapshot/.test(call[0]))).toBe(false);
  expect(JSON.stringify(mocks.sql.mock.calls)).not.toContain("private-raw-error");
  const observation=mocks.sql.mock.calls.find(call=>call[0].includes("insert into billing_reference_refresh_observation"))!;
  expect(JSON.parse(observation[1][3]).discardedReasonCounts).toEqual({unavailableOrInvalidReference:1});
});
it("records an expired official response separately from transport failure without renewing the FX snapshot",async()=>{
  const staleAt=Date.parse("2026-09-18T08:49:24Z");
  const result=await refreshBillingFxReference(vi.fn().mockResolvedValue(new Response(xml)),staleAt);
  expect(result).toMatchObject({status:"unavailable",failureClass:"staleOfficialReference",httpCalls:1,nextAttemptAt:"2026-09-18T09:49:24.000Z"});
  expect(mocks.sql.mock.calls.some(call=>call[0].includes("insert into billing_fx_reference_snapshot"))).toBe(false);
  const observation=mocks.sql.mock.calls.find(call=>call[0].includes("insert into billing_reference_refresh_observation"))!;
  expect(JSON.parse(observation[1][3]).discardedReasonCounts).toEqual({staleOfficialReference:1});
});
it("rejects expired or foreign-source stored references without deleting historical data",async()=>{
  const reference=parseEcbCnyReference(xml,new Date(time).toISOString());
  mocks.read.mockResolvedValue([{fx:reference.fx}]);
  expect(await readCurrentCnyFxReference(time)).toEqual(reference.fx);
  expect(await readCurrentCnyFxReference(Date.parse("2026-09-18T00:00:00Z"))).toBeNull();
  mocks.read.mockResolvedValue([{fx:{...reference.fx,reference:"https://unreviewed.test"}}]);
  expect(await readCurrentCnyFxReference(time)).toBeNull();
});
it("reads only the pinned official acceptance version without imposing a calendar expiry",async()=>{
  const reference=parseEcbCnyReference(xml,new Date(time).toISOString());
  mocks.read.mockResolvedValue([{fx:reference.fx}]);
  const later=Date.parse("2026-10-20T00:00:00Z");
  expect(await readCurrentCnyFxReference(later)).toBeNull();
  const pinned=await withSpendContext({userId:"acceptance",operationId:"fixture",stage:"validation",
    fixedFxReferenceVersion:reference.fx.version},()=>readCurrentCnyFxReference(later));
  expect(pinned).toEqual(reference.fx);
  expect(mocks.read.mock.lastCall?.[1]).toEqual(["ecb-cny-usd-reference-v1",reference.fx.version]);
});
