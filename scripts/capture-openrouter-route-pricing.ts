import {createHash} from "node:crypto";
import {writeFile} from "node:fs/promises";

// Public metadata only. This script never loads application credentials or calls inference.
const modelIds=["openai/gpt-5.6-terra","openai/gpt-5.6-sol","openai/gpt-4o-mini","openai/gpt-4o",
  "deepseek/deepseek-v4-flash","deepseek/deepseek-v4-pro"] as const;
const catalogUrl="https://openrouter.ai/api/v1/models";
async function read(url:string){
  const parsed=new URL(url);
  if(parsed.origin!=="https://openrouter.ai"||!parsed.pathname.startsWith("/api/v1/models")
    ||parsed.search||parsed.username||parsed.password)throw new Error("Unexpected public metadata URL");
  const response=await fetch(url,{redirect:"error",signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`Public metadata HTTP ${response.status}`);
  const body=await response.text();
  return {value:JSON.parse(body),sha256:createHash("sha256").update(body).digest("hex")};
}
const catalog=await read(catalogUrl);
const models=[];
for(const id of modelIds){
  const model=catalog.value.data.find((item:{id:string})=>item.id===id);
  if(!model?.links?.details)throw new Error(`Exact model missing: ${id}`);
  const endpointUrl=new URL(model.links.details,"https://openrouter.ai").toString();
  const endpoints=await read(endpointUrl);
  if(endpoints.value.data.id!==id||!Array.isArray(endpoints.value.data.endpoints)
    ||!endpoints.value.data.endpoints.length)throw new Error(`Endpoint identity mismatch: ${id}`);
  models.push({id,canonicalSlug:model.canonical_slug,contextLength:model.context_length,
    catalogPricing:model.pricing,endpointUrl,endpointSha256:endpoints.sha256,
    endpoints:endpoints.value.data.endpoints.map((item:Record<string,unknown>)=>({tag:item.tag,
      contextLength:item.context_length,maxPromptTokens:item.max_prompt_tokens,
      maxCompletionTokens:item.max_completion_tokens,pricing:item.pricing,
      supportedParameters:item.supported_parameters,supportsImplicitCaching:item.supports_implicit_caching}))});
}
const snapshot={capturedAt:new Date().toISOString(),status:"public-evidence-only-no-tariff-admission",
  catalog:{url:catalogUrl,sha256:catalog.sha256},models,
  limitations:["No account or BYOK read","No inference or charge","No route/request contract proven",
    "Catalog price is not a maximum across endpoints","Provider availability and prices can change"]};
if(process.argv.includes("--write"))await writeFile("docs/OPENROUTER_ROUTE_ENDPOINT_EVIDENCE_2026-09-14.json",
  JSON.stringify(snapshot,null,2)+"\n","utf8");
console.log(JSON.stringify({models:models.map(model=>({id:model.id,endpointCount:model.endpoints.length,
  endpointTags:model.endpoints.map((item:{tag:unknown})=>item.tag)})),paidCalls:0,
  written:process.argv.includes("--write")}));
