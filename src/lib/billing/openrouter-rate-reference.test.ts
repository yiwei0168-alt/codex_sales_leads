import {expect,it,vi} from "vitest";
import snapshot from "../../../docs/OPENROUTER_ROUTE_ENDPOINT_EVIDENCE_2026-09-14.json";
import {fetchOpenRouterSolRateEvidence} from "./openrouter-rate-reference";

const baseline=snapshot.models.find(item=>item.id==="openai/gpt-5.6-sol")!;
function transportWithPrice(price?:string){
  const endpoints=baseline.endpoints.map(item=>({tag:item.tag,context_length:item.contextLength,
    max_prompt_tokens:item.maxPromptTokens,max_completion_tokens:item.maxCompletionTokens,
    pricing:{...item.pricing,...item.tag==="azure"&&price?{prompt:price}:{}},
    supported_parameters:item.supportedParameters,supports_implicit_caching:item.supportsImplicitCaching}));
  return vi.fn(async(input:RequestInfo|URL)=>new Response(JSON.stringify(String(input).endsWith("/endpoints")
    ?{data:{id:baseline.id,endpoints}}
    :{data:[{id:baseline.id,canonical_slug:baseline.canonicalSlug,context_length:baseline.contextLength,
      pricing:baseline.catalogPricing,links:{details:baseline.endpointUrl}}]})));
}
it("validates exact public Sol endpoints without admitting or extending a tariff",async()=>{
  const transport=transportWithPrice();
  const result=await fetchOpenRouterSolRateEvidence(transport as typeof fetch);
  expect(result).toMatchObject({status:"validated",paidCalls:0,tariffAdmitted:false});
  expect(result.evidence.audit).toMatchObject({sourceUnchanged:true,currentMaximumMicros:27345252});
  expect(transport).toHaveBeenCalledTimes(2);
  expect(transport.mock.calls.map(call=>String(call[0]))).toEqual([
    "https://openrouter.ai/api/v1/models",baseline.endpointUrl]);
});
it("flags an endpoint price change for review without applying the new amount",async()=>{
  const result=await fetchOpenRouterSolRateEvidence(transportWithPrice("0.000099") as typeof fetch);
  expect(result.status).toBe("review-required");
  expect(result.evidence.audit.sourceUnchanged).toBe(false);
  expect(result.tariffAdmitted).toBe(false);
});
it("holds an endpoint identity mismatch before relying on its prices",async()=>{
  const transport=vi.fn(async()=>new Response(JSON.stringify({data:[{id:baseline.id,canonical_slug:baseline.canonicalSlug,
    context_length:baseline.contextLength,pricing:baseline.catalogPricing,links:{details:"https://unreviewed.test/endpoints"}}]})));
  expect(await fetchOpenRouterSolRateEvidence(transport as typeof fetch)).toMatchObject({
    status:"review-required",evidence:{audit:{reason:"endpoint-identity-changed"}}});
  expect(transport).toHaveBeenCalledTimes(1);
});
it("holds a public endpoint with a missing billable price field",async()=>{
  const transport=transportWithPrice();
  const original=transport.getMockImplementation()!;
  transport.mockImplementation(async(input:RequestInfo|URL)=>{
    const response=await original(input);
    const payload=await response.json();
    if(String(input).endsWith("/endpoints"))delete payload.data.endpoints[1].pricing.input_cache_write;
    return new Response(JSON.stringify(payload));
  });
  expect(await fetchOpenRouterSolRateEvidence(transport as typeof fetch)).toMatchObject({
    status:"review-required",evidence:{audit:{reason:"endpoint-contract-unverifiable"}}});
});
