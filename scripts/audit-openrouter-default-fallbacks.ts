import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";

// Credential-free catalog audit. It cannot change a route, tariff or budget.
type Endpoint={tag:string;contextLength:number;maxPromptTokens:number|null;maxCompletionTokens:number;
  pricing:Record<string,unknown>;supportedParameters:string[];supportsImplicitCaching:boolean};
type Model={id:string;canonicalSlug:string;contextLength:number;catalogPricing:Record<string,unknown>;
  endpointUrl:string;endpoints:Endpoint[]};
const ids=["openai/gpt-4o-mini","openai/gpt-4o","deepseek/deepseek-v4-flash","deepseek/deepseek-v4-pro"] as const;
const catalogUrl="https://openrouter.ai/api/v1/models";
const snapshot=JSON.parse(await readFile("docs/OPENROUTER_ROUTE_ENDPOINT_EVIDENCE_2026-09-14.json","utf8")) as
  {status:string;models:Model[]};
if(snapshot.status!=="public-evidence-only-no-tariff-admission")throw new Error("Unexpected baseline status");
async function publicGet(url:string){
  const parsed=new URL(url);
  if(parsed.origin!=="https://openrouter.ai"||!parsed.pathname.startsWith("/api/v1/models")
    ||parsed.search||parsed.username||parsed.password)throw new Error("Unexpected metadata URL");
  const response=await fetch(url,{method:"GET",redirect:"error",signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`Public metadata HTTP ${response.status}`);
  const raw=await response.text();
  if(Buffer.byteLength(raw,"utf8")>20_000_000)throw new Error("Public metadata too large");
  return {value:JSON.parse(raw),sha256:createHash("sha256").update(raw).digest("hex")};
}
function canonical(value:unknown):string{
  if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;
  if(value&&typeof value==="object")return `{${Object.entries(value as Record<string,unknown>)
    .sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
function projection(model:Model){return {id:model.id,canonicalSlug:model.canonicalSlug,
  contextLength:model.contextLength,catalogPricing:model.catalogPricing,endpointUrl:model.endpointUrl,
  endpoints:model.endpoints.map(item=>({...item,supportedParameters:[...item.supportedParameters].sort()}))
    .sort((a,b)=>canonical(a).localeCompare(canonical(b)))};}
const catalog=await publicGet(catalogUrl);
const reports=[];
for(const id of ids){
  const baseline=snapshot.models.find(item=>item.id===id);
  const listing=catalog.value.data?.find((item:{id:string})=>item.id===id);
  if(!baseline||!listing||typeof listing.links?.details!=="string")throw new Error(`Missing exact model: ${id}`);
  const endpointUrl=new URL(listing.links.details,"https://openrouter.ai").toString();
  if(endpointUrl!==baseline.endpointUrl)throw new Error(`Endpoint link changed: ${id}`);
  const detail=await publicGet(endpointUrl);
  if(detail.value.data?.id!==id||!Array.isArray(detail.value.data.endpoints))throw new Error(`Endpoint identity changed: ${id}`);
  const current:Model={id,canonicalSlug:listing.canonical_slug,contextLength:listing.context_length,
    catalogPricing:listing.pricing,endpointUrl,
    endpoints:detail.value.data.endpoints.map((item:Record<string,unknown>):Endpoint=>({
      tag:item.tag as string,contextLength:item.context_length as number,
      maxPromptTokens:item.max_prompt_tokens as number|null,maxCompletionTokens:item.max_completion_tokens as number,
      pricing:item.pricing as Record<string,unknown>,supportedParameters:item.supported_parameters as string[],
      supportsImplicitCaching:item.supports_implicit_caching as boolean}))};
  const openai=id.startsWith("openai/");
  const required=[openai?"max_completion_tokens":"max_tokens","temperature","response_format","structured_outputs",
    ...(openai?[]:["reasoning"])];
  const outputTokens=8192;
  const compatible=current.endpoints.filter(item=>required.every(parameter=>item.supportedParameters.includes(parameter))
    &&item.maxCompletionTokens>=outputTokens);
  const missing=compatible.map(item=>({tag:item.tag,fields:["prompt","completion","input_cache_read","input_cache_write"]
    .filter(field=>typeof item.pricing[field]!=="string"),overrideCount:Array.isArray(item.pricing.overrides)?item.pricing.overrides.length:0}));
  const priorSignatures=baseline.endpoints.map(canonical);
  const changedEndpointTags=current.endpoints.flatMap(item=>{
    const index=priorSignatures.indexOf(canonical(item));
    if(index<0)return [item.tag];
    priorSignatures.splice(index,1);
    return [];
  });
  const endpointChanges=changedEndpointTags.map(tag=>{
    const before=baseline.endpoints.find(item=>item.tag===tag);
    const after=current.endpoints.find(item=>item.tag===tag);
    return {tag,changedFields:after&&before?Object.keys(after).filter(field=>canonical(after[field as keyof Endpoint])!==canonical(before[field as keyof Endpoint])):["endpoint"]};
  });
  reports.push({id,source:{url:endpointUrl,sha256:detail.sha256},baselineUnchanged:canonical(projection(current))===canonical(projection(baseline)),
    catalogPricingChanged:canonical(current.catalogPricing)!==canonical(baseline.catalogPricing),endpointChanges,
    totalEndpoints:current.endpoints.length,compatibleEndpoints:compatible.length,
    incompatibleEndpoints:current.endpoints.length-compatible.length,duplicateTags:current.endpoints.length-new Set(current.endpoints.map(item=>item.tag)).size,
    compatibleEndpointMissingPrices:missing,requestOutputTokens:outputTokens,requiredParameters:required,
    tariffAdmitted:false,paidCalls:0});
}
console.log(JSON.stringify({checkedAt:new Date().toISOString(),catalog:{url:catalogUrl,sha256:catalog.sha256},reports}));
if(reports.some(item=>!item.baselineUnchanged))process.exitCode=2;
