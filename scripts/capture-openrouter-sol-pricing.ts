import {writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
// Public metadata only. Never load .env or attach an API key; never call inference.
const modelId="openai/gpt-5.6-sol";
const catalogUrl="https://openrouter.ai/api/v1/models";
async function read(url:string){
  const parsed=new URL(url);
  if(parsed.origin!=="https://openrouter.ai"||!parsed.pathname.startsWith("/api/v1/models")||parsed.search||parsed.username||parsed.password)throw new Error("Unexpected public metadata URL");
  const response=await fetch(url,{redirect:"error",signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`Metadata HTTP ${response.status}`);
  const text=await response.text();return {value:JSON.parse(text),sha256:createHash("sha256").update(text).digest("hex")};
}
const catalog=await read(catalogUrl);
const model=catalog.value.data.find((item:{id:string})=>item.id===modelId);
if(!model?.links?.details)throw new Error("Exact model or endpoint link missing");
const endpointUrl=new URL(model.links.details,"https://openrouter.ai").toString();
const endpoints=await read(endpointUrl);
if(endpoints.value.data.id!==modelId||!Array.isArray(endpoints.value.data.endpoints)||!endpoints.value.data.endpoints.length)throw new Error("Endpoint identity mismatch");
const snapshot={capturedAt:new Date().toISOString(),status:"evidence-only-not-an-admitted-tariff",modelId,
  sources:[{url:catalogUrl,sha256:catalog.sha256},{url:endpointUrl,sha256:endpoints.sha256}],
  model:{canonicalSlug:model.canonical_slug,contextLength:model.context_length,pricing:model.pricing},
  endpoints:endpoints.value.data.endpoints.map((item:Record<string,unknown>)=>({tag:item.tag,providerName:item.provider_name,
    contextLength:item.context_length,maxPromptTokens:item.max_prompt_tokens,maxCompletionTokens:item.max_completion_tokens,
    pricing:item.pricing,supportedParameters:item.supported_parameters,supportsImplicitCaching:item.supports_implicit_caching})),
  exclusions:["No inference or account configuration read","No rate automatically admitted","No inference of BYOK status or bill completeness"],
};
if(process.argv.includes("--write"))await writeFile("docs/OPENROUTER_SOL_ENDPOINT_EVIDENCE_2026-09-13.json",JSON.stringify(snapshot,null,2)+"\n","utf8");
console.log(JSON.stringify({modelId,endpointCount:snapshot.endpoints.length,
  endpointTags:snapshot.endpoints.map((item:{tag:unknown})=>item.tag),evidenceWritten:process.argv.includes("--write"),paidCalls:0}));
