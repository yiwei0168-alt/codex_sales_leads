import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {auditPublicReviewBound,type PublicEndpoint,type PublicModel} from "../src/lib/billing/openrouter-public-audit";

// Credential-free public GETs only. Never changes the active tariff, budget or route.
const modelId="openai/gpt-5.6-terra";
const catalogUrl="https://openrouter.ai/api/v1/models";
const snapshot=JSON.parse(await readFile("docs/OPENROUTER_ROUTE_ENDPOINT_EVIDENCE_2026-09-14.json","utf8"));
if(snapshot.status!=="public-evidence-only-no-tariff-admission")throw new Error("Unexpected baseline status");
const baseline=snapshot.models.find((item:{id:string})=>item.id===modelId) as PublicModel|undefined;
if(!baseline||baseline.contextLength!==1050000)throw new Error("Missing exact Terra baseline");
async function read(url:string){
  const parsed=new URL(url);
  if(parsed.origin!=="https://openrouter.ai"||!parsed.pathname.startsWith("/api/v1/models")
    ||parsed.search||parsed.username||parsed.password)throw new Error("Unexpected public metadata URL");
  const response=await fetch(url,{method:"GET",redirect:"error",signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`Public metadata HTTP ${response.status}`);
  const body=await response.text();
  if(Buffer.byteLength(body,"utf8")>20_000_000)throw new Error("Public metadata too large");
  return {value:JSON.parse(body),sha256:createHash("sha256").update(body).digest("hex")};
}
const catalog=await read(catalogUrl);
const model=catalog.value.data?.find((item:{id:string})=>item.id===modelId);
if(!model||typeof model.links?.details!=="string")throw new Error("Exact public model missing");
const endpointUrl=new URL(model.links.details,"https://openrouter.ai").toString();
if(endpointUrl!==baseline.endpointUrl)throw new Error("Endpoint link changed; review required");
const details=await read(endpointUrl);
if(details.value.data?.id!==modelId||!Array.isArray(details.value.data.endpoints))
  throw new Error("Endpoint identity changed; review required");
const current:PublicModel={id:model.id,canonicalSlug:model.canonical_slug,contextLength:model.context_length,
  catalogPricing:model.pricing,endpointUrl,
  endpoints:details.value.data.endpoints.map((item:Record<string,unknown>):PublicEndpoint=>({
    tag:item.tag as string,contextLength:item.context_length as number,
    maxPromptTokens:item.max_prompt_tokens as number|null,maxCompletionTokens:item.max_completion_tokens as number,
    pricing:item.pricing as Record<string,unknown>,supportedParameters:item.supported_parameters as string[],
    supportsImplicitCaching:item.supports_implicit_caching as boolean}))};
const audit=auditPublicReviewBound(baseline,current,8192,11019202);
console.log(JSON.stringify({checkedAt:new Date().toISOString(),modelId,
  sources:[{url:catalogUrl,sha256:catalog.sha256},{url:endpointUrl,sha256:details.sha256}],
  endpointTags:current.endpoints.map(item=>item.tag),...audit}));
if(audit.status!=="unchanged-proposal-only")process.exitCode=2;
