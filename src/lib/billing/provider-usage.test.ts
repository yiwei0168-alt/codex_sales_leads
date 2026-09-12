import {expect,it} from "vitest";
import {providerUsageObservation} from "./provider-usage";
it("records only known finish reasons and leaves missing or ambiguous choices unknown",()=>{
  expect(providerUsageObservation({choices:[{finish_reason:"length"}]}).finishReason).toBe("length");
  expect(providerUsageObservation({stop_reason:"end_turn"}).finishReason).toBe("end_turn");
  expect(providerUsageObservation({choices:[{finish_reason:"stop"},{finish_reason:"length"}]}).finishReason).toBeNull();
  expect(providerUsageObservation({stop_reason:"private text"}).finishReason).toBeNull();
});
it("hashes provider request IDs without retaining the original identifier",()=>{
  const value=providerUsageObservation({id:"private-request-identifier"});
  expect(value.providerRequestHash).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(value)).not.toContain("private-request-identifier");
  expect(providerUsageObservation({}).providerRequestHash).toBeNull();
});

it("preserves distinct cache semantics and explicit zero without inventing missing values",()=>{
  const observed=providerUsageObservation({usage:{input_tokens:12,cache_read_input_tokens:90,cache_creation_input_tokens:0}});
  expect(observed.fields.input_tokens).toBe(12);
  expect(observed.fields.cache_read_input_tokens).toBe(90);
  expect(observed.fields.cache_creation_input_tokens).toBe(0);
  expect(observed.fields.prompt_tokens).toBeNull();
  expect(observed.cacheHitRatio).toBeNull();
  expect(observed.observedFieldCount).toBe(3);
});
it("records nested numeric source fields only and rejects malformed counts",()=>{
  const observed=providerUsageObservation({secret:"private",usage:{prompt_tokens:NaN,output_tokens:-1,total_tokens:"20",prompt_tokens_details:{cached_tokens:0,secret:"private"},completion_tokens_details:{reasoning_tokens:7}}});
  expect(observed.fields["prompt_tokens_details.cached_tokens"]).toBe(0);
  expect(observed.fields["completion_tokens_details.reasoning_tokens"]).toBe(7);
  expect(observed.observedFieldCount).toBe(2);
  expect(JSON.stringify(observed)).not.toContain("private");
});
it("missing and non-JSON-shaped usage is unknown, never free",()=>{
  for(const value of [null,{}, {usage:[]}, {usage:"invalid"}]){
    expect(providerUsageObservation(value).observedFieldCount).toBe(0);
    expect(providerUsageObservation(value).invoiceVerified).toBe(false);
  }
});
it("distinguishes reported model from the requested model without accepting arbitrary response text",()=>{
  expect(providerUsageObservation({model:"model-revision-2"}).reportedModel).toBe("model-revision-2");
  expect(providerUsageObservation({model:"private response content"}).reportedModel).toBeNull();
});
