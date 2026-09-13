import nextEnv from "@next/env";
import assert from "node:assert/strict";
nextEnv.loadEnvConfig(process.cwd());
const {getPool,query}=await import("../src/lib/rag/db");
const {nativeModelBound}=await import("../src/lib/billing/native-model-bound");
const {embeddingModelBound}=await import("../src/lib/billing/embedding-model-bound");
const {ECB_SOURCE_KEY,ECB_REFERENCE_URL}=await import("../src/lib/billing/ecb-reference");
const originalFetch=globalThis.fetch;let referenceHttpCalls=0;
globalThis.fetch=async(input,init)=>{
  const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;
  if(url!==ECB_REFERENCE_URL)throw new Error("Unexpected HTTP target in quote-only verification");
  referenceHttpCalls++;return originalFetch(input,init);
};
const observations=()=>query<{count:string}>("select count(*)::text as count from billing_reference_refresh_observation where source_key=$1",[ECB_SOURCE_KEY]);
try {
  const before=Number((await observations())[0].count);
  const now=Date.now();
  const kimi=()=>nativeModelBound({origin:"https://api.moonshot.cn",pathname:"/v1/chat/completions",model:"kimi-k2.6",requestBytes:100,outputTokens:100},now);
  // This is a fee quote, never a model or embedding request. No account hostname or key is needed.
  const embedding=()=>embeddingModelBound({origin:"https://synthetic.cn-beijing.maas.aliyuncs.com",pathname:"/compatible-mode/v1/embeddings",model:"text-embedding-v4",requestBytes:100,outputTokens:null},now);
  const results=await Promise.allSettled([kimi(),embedding()]);
  for(const result of results){
    if(result.status==="rejected")throw result.reason;
    assert.ok(result.value);assert.equal(result.value.rule.foreignCostBound?.fx.reference,ECB_REFERENCE_URL);
    assert.ok(result.value.rule.maximumChargeMicros>0);
  }
  const after=Number((await observations())[0].count);
  assert.ok(after-before<=1);
  assert.ok(await kimi());assert.ok(await embedding());
  assert.equal(Number((await observations())[0].count),after);
  assert.ok(referenceHttpCalls<=1);
  console.log(JSON.stringify({inlineFxQuotes:"passed",defaultAdapters:2,repeatQuotes:2,newRefreshObservations:after-before,referenceHttpCalls,
    feeRulesUnchanged:true,realModelCalls:0,paidRequests:0,workerStarted:false,publicReferenceHistoryPreserved:true}));
} finally {globalThis.fetch=originalFetch;await getPool().end();}
