import {beforeEach,expect,it,vi} from "vitest";
vi.mock("@/lib/billing/denial-metrics",()=>({recordBudgetDenial:vi.fn().mockResolvedValue(undefined)}));
const mocks=vi.hoisted(()=>({reserve:vi.fn(),settle:vi.fn(),quote:vi.fn()}));
vi.mock("./repository",()=>({reservePaidCall:mocks.reserve,settlePaidCall:mocks.settle}));
vi.mock("./policy",async original=>({...await original<typeof import("./policy")>(),quoteRequest:mocks.quote}));
import {budgetedFetch} from "./paid-fetch";
import {withSpendContext} from "./context";
import {BudgetDeniedError,PaidCallOutcomeUnknownError} from "./policy";
import {DeepSeekProvider} from "@/providers/deepseek";
import {ResilientAiProvider} from "@/providers/resilient-ai";
import {recordBudgetDenial} from "./denial-metrics";
import {withModelAttempt} from "./model-attempt-context";
const scope={userId:"user",operationId:"action",stage:"score"};
const init={method:"POST",headers:{authorization:"Bearer fixture-secret"},body:JSON.stringify({model:"test",max_tokens:100,messages:[{content:"private company input"}]})};
it("attributes model attempts before network without persisting the raw endpoint or query",async()=>{
  await withSpendContext(scope,()=>withModelAttempt({invocationId:"call-1",provider:"test-provider",task:"score",promptVersion:"v2",attempt:2},()=>budgetedFetch(vi.fn().mockResolvedValue(Response.json({})))("https://example.test/private-path?key=hidden",init)));
  expect(mocks.reserve.mock.calls[0][1].modelAttempt).toEqual({invocationId:"call-1",provider:"test-provider",task:"score",promptVersion:"v2",attempt:2,requestedModel:"test",gatewayHost:"example.test",endpointKind:"other"});
  expect(mocks.reserve.mock.calls[0][1].requestFingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(mocks.reserve.mock.calls)).not.toMatch(/private-path|hidden|fixture-secret/);
});
it("rejects obsolete K3 output caps before reserving or sending",async()=>{
  const transport=vi.fn();
  await expect(withSpendContext(scope,()=>budgetedFetch(transport)("https://api.moonshot.cn/v1/chat/completions",{...init,body:JSON.stringify({model:"kimi-k3",max_tokens:100})}))).rejects.toThrow("request-out-of-bounds");
  expect(transport).not.toHaveBeenCalled();expect(mocks.reserve).not.toHaveBeenCalled();
});
beforeEach(()=>{vi.resetAllMocks();mocks.quote.mockReturnValue({key:"fixture",maximumChargeMicros:100});mocks.reserve.mockResolvedValue("reservation");mocks.settle.mockResolvedValue(undefined);});
it("attributes isolated reviewed tariffs to the reservation",async()=>{
  const tariffPolicy={version:"acceptance-only",rules:[]};
  await withSpendContext({...scope,tariffPolicy},()=>budgetedFetch(vi.fn().mockResolvedValue(Response.json({})))("https://example.test/chat",init));
  expect(mocks.quote).toHaveBeenCalledWith(expect.any(Object),tariffPolicy.rules);
  expect(mocks.reserve.mock.calls[0][1].tariffVersion).toBe("acceptance-only");
  expect(mocks.reserve.mock.calls[0][1].modelAttempt).toMatchObject({requestedModel:"test",gatewayHost:"example.test",attempt:null,promptVersion:null,provider:null});
});
it("bounds form requests without recording their fields",async()=>{
  const transport=vi.fn().mockResolvedValue(Response.json({}));
  await withSpendContext(scope,()=>budgetedFetch(transport)("https://example.test/start",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({domain:"private-company.test"})}));
  expect(mocks.quote).toHaveBeenCalledWith(expect.objectContaining({model:"",requestBytes:expect.any(Number)}));
  expect(JSON.stringify(mocks.reserve.mock.calls)).not.toContain("private-company");
  expect(mocks.reserve.mock.calls[0][1].requestFingerprint).toBeUndefined();
});
it("missing prices or budget block the transport entirely",async()=>{
  const transport=vi.fn();mocks.quote.mockImplementation(()=>{throw new BudgetDeniedError("missing-tariff");});
  await expect(withSpendContext(scope,()=>budgetedFetch(transport)("https://example.test/chat",init))).rejects.toThrow("missing-tariff");expect(transport).not.toHaveBeenCalled();
});
it("reserves before sending and persists no credentials or raw content",async()=>{
  const transport=vi.fn(async()=>{expect(mocks.reserve).toHaveBeenCalledOnce();return Response.json({usage:{cost:0.00001,prompt_tokens:5,completion_tokens:2}});});
  await withSpendContext(scope,()=>budgetedFetch(transport)("https://example.test/chat",init));
  expect(mocks.settle.mock.calls[0][2]).toMatchObject({reportedMicros:10,succeeded:true});
  expect(JSON.stringify([...mocks.reserve.mock.calls,...mocks.settle.mock.calls])).not.toMatch(/fixture-secret|private company input/);
});
it("unknown transport outcome retains reservation, never releases or automatically repeats",async()=>{
  const transport=vi.fn().mockRejectedValue(new Error("timeout"));
  await expect(withSpendContext(scope,()=>budgetedFetch(transport)("https://example.test/chat",init))).rejects.toBeInstanceOf(PaidCallOutcomeUnknownError);
  expect(transport).toHaveBeenCalledOnce();expect(mocks.settle.mock.calls[0][2]).toMatchObject({reportedMicros:null,succeeded:false});
});
it("unknown paid transport outcome prevents actual provider retries and fallback and is not recorded as a free denial",async()=>{
  const transport=vi.fn().mockRejectedValue(new Error("timeout"));
  const fallback={id:"fallback",execute:vi.fn()};
  const provider=new ResilientAiProvider(new DeepSeekProvider({apiKey:"fixture",fetchImplementation:transport,maxAttempts:3}),{fallbacks:[{provider:fallback,routineModel:"peer",approvedDataClassifications:["public"]}]});
  await expect(withSpendContext(scope,()=>provider.execute({task:"lead-qualification",modelVersion:"deepseek-v4-flash",promptVersion:"fixture",input:{},evidenceIds:[]}))).rejects.toBeInstanceOf(PaidCallOutcomeUnknownError);
  expect(transport).toHaveBeenCalledTimes(1);expect(mocks.reserve).toHaveBeenCalledTimes(1);
  expect(fallback.execute).not.toHaveBeenCalled();expect(recordBudgetDenial).not.toHaveBeenCalled();
  expect(mocks.settle.mock.calls[0][2]).toMatchObject({reportedMicros:null,inputTokens:null,outputTokens:null});
});
it("settlement failure does not turn a successful paid response into a retry",async()=>{
  mocks.settle.mockRejectedValue(new Error("database unavailable"));const transport=vi.fn().mockResolvedValue(Response.json({ok:true}));
  expect((await withSpendContext(scope,()=>budgetedFetch(transport)("https://example.test/chat",init))).ok).toBe(true);expect(transport).toHaveBeenCalledOnce();
});
it("a broken response stream is unknown paid work, not a settlement-only failure or a free denial",async()=>{
  const transport=vi.fn().mockResolvedValue(new Response(new ReadableStream({start(controller){controller.error(new Error("connection lost"));}})));
  await expect(withSpendContext(scope,()=>budgetedFetch(transport)("https://example.test/chat",init))).rejects.toBeInstanceOf(PaidCallOutcomeUnknownError);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(mocks.settle.mock.calls[0][2]).toMatchObject({reportedMicros:null,responseBytes:null,succeeded:false});
  expect(recordBudgetDenial).not.toHaveBeenCalled();
});
it("separately scoped concurrent users cannot mix reservations",async()=>{
  await Promise.all(["a","b"].map(userId=>withSpendContext({...scope,userId},()=>budgetedFetch(vi.fn().mockResolvedValue(Response.json({})))("https://example.test/chat",init))));
  expect(mocks.reserve.mock.calls.map(call=>call[0]).sort()).toEqual(["a","b"]);
});
it("records each failed and successful HTTP attempt separately including cache source fields",async()=>{
  const transport=vi.fn()
    .mockResolvedValueOnce(Response.json({usage:{prompt_cache_miss_tokens:9}},{status:503}))
    .mockResolvedValueOnce(Response.json({usage:{prompt_tokens:12,prompt_cache_hit_tokens:10,prompt_cache_miss_tokens:2}}));
  const send=budgetedFetch(transport);
  await withSpendContext(scope,async()=>{
    await send("https://example.test/chat",init);
    await send("https://example.test/chat",init);
  });
  expect(mocks.reserve).toHaveBeenCalledTimes(2);
  expect(mocks.settle).toHaveBeenCalledTimes(2);
  expect(mocks.settle.mock.calls[0][2]).toMatchObject({succeeded:false,providerUsage:{fields:{prompt_cache_miss_tokens:9,prompt_cache_hit_tokens:null}}});
  expect(mocks.settle.mock.calls[1][2]).toMatchObject({succeeded:true,providerUsage:{fields:{prompt_cache_hit_tokens:10,prompt_cache_miss_tokens:2}}});
});
