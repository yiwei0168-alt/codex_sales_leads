import {expect,it} from "vitest";
import {providerUsageObservation} from "./provider-usage";

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
