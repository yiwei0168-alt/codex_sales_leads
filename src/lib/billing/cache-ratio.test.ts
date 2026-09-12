import {expect,it} from "vitest";
import {verifiedCacheRatio} from "./cache-ratio";
import type {ProviderUsageSummary} from "./usage-summary-types";
const group:ProviderUsageSummary={stage:"score",provider:"deepseek",requestedModel:"flash",reportedModel:"flash",promptVersion:"v1",gatewayHost:"api.deepseek.com",endpointKind:"chat-completions",attempts:2,fields:[{field:"prompt_tokens",reportedAttempts:2,total:"100"},{field:"prompt_cache_hit_tokens",reportedAttempts:2,total:"60"},{field:"prompt_cache_miss_tokens",reportedAttempts:2,total:"40"}]};
it("computes only fully covered internally consistent direct DeepSeek chat groups",()=>{
  expect(verifiedCacheRatio(group,2)).toBe(.6);
  expect(verifiedCacheRatio(group,1)).toBeNull();
  expect(verifiedCacheRatio({...group,gatewayHost:"gateway.example"},2)).toBeNull();
  expect(verifiedCacheRatio({...group,endpointKind:"messages"},2)).toBeNull();
  expect(verifiedCacheRatio({...group,fields:group.fields.map(item=>({...item,reportedAttempts:1}))},2)).toBeNull();
});
it("never divides by zero or masks inconsistent counts with a plausible ratio",()=>{
  expect(verifiedCacheRatio({...group,fields:group.fields.map(item=>({...item,total:"0"}))},2)).toBeNull();
  expect(verifiedCacheRatio({...group,fields:group.fields.map(item=>item.field==="prompt_cache_miss_tokens"?{...item,total:"41"}:item)},2)).toBeNull();
});
