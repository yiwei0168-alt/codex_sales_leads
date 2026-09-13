import {createHash} from "node:crypto";
import baselineEvidence from "../../../docs/OPENROUTER_ROUTE_ENDPOINT_EVIDENCE_2026-09-14.json";
import {auditPublicReviewBound,type PublicEndpoint,type PublicModel} from "./openrouter-public-audit";
import {billingPolicy} from "./policy";

export const OPENROUTER_SOL_RATE_SOURCE="openrouter-sol-standard-text-json-v1";
export const OPENROUTER_SOL_TARIFF_KEY="openrouter-sol-credits-standard-text-json";
const catalogUrl="https://openrouter.ai/api/v1/models";
const modelId="openai/gpt-5.6-sol";
function checkedContract(){
  const baseline=baselineEvidence.models.find(item=>item.id===modelId) as PublicModel|undefined;
  const rule=billingPolicy.rules.find(item=>item.key===OPENROUTER_SOL_TARIFF_KEY);
  if(!baseline||!rule||rule.model!==modelId||rule.reference!==baseline.endpointUrl
    ||rule.maximumOutputTokens!==4096)throw new Error("Sol rate baseline and active tariff differ");
  return {baseline,rule};
}
const {baseline,rule}=checkedContract();

async function publicGet(url:string,transport:typeof fetch){
  const parsed=new URL(url);
  if(parsed.origin!=="https://openrouter.ai"||!parsed.pathname.startsWith("/api/v1/models")
    ||parsed.search||parsed.username||parsed.password)throw new Error("Unexpected public metadata URL");
  const response=await transport(url,{method:"GET",redirect:"error",signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error("Public metadata unavailable");
  const raw=await response.text();
  if(Buffer.byteLength(raw,"utf8")>20_000_000)throw new Error("Public metadata too large");
  return {value:JSON.parse(raw),hash:createHash("sha256").update(raw).digest("hex"),bytes:Buffer.byteLength(raw,"utf8")};
}

/** An observation cannot extend the static rule's verification deadline or change its charge ceiling. */
export async function fetchOpenRouterSolRateEvidence(transport:typeof fetch=fetch){
  const catalog=await publicGet(catalogUrl,transport);
  const reviewRequired=(reason:string,details?:{hash:string;bytes:number},model?:PublicModel)=>({
    status:"review-required" as const,
    sourceHash:createHash("sha256").update(`${catalog.hash}:${details?.hash??"missing"}`).digest("hex"),
    bytes:catalog.bytes+(details?.bytes??0),
    evidence:{sources:[{url:catalogUrl,sha256:catalog.hash},...(details?[{url:baseline.endpointUrl,sha256:details.hash}]:[])],
      model:model??null,audit:{reason,sourceUnchanged:false,currentMaximumMicros:null,
        baselineMaximumMicros:null,proposedMaximumMicros:rule.maximumChargeMicros}},
    paidCalls:0,tariffAdmitted:false});
  const listings=Array.isArray(catalog.value.data)?catalog.value.data:[];
  const listing=listings.find((item:{id:string})=>item.id===modelId);
  if(!listing||typeof listing.links?.details!=="string")return reviewRequired("model-identity-changed");
  let endpointUrl:string;
  try{endpointUrl=new URL(listing.links.details,"https://openrouter.ai").toString();}
  catch{return reviewRequired("endpoint-identity-changed");}
  if(endpointUrl!==baseline.endpointUrl)return reviewRequired("endpoint-identity-changed");
  const details=await publicGet(endpointUrl,transport);
  if(details.value.data?.id!==modelId||!Array.isArray(details.value.data.endpoints))
    return reviewRequired("endpoint-record-changed",details);
  let current:PublicModel;
  let audit:ReturnType<typeof auditPublicReviewBound>;
  try{
    current={id:listing.id,canonicalSlug:listing.canonical_slug,
      contextLength:listing.context_length,catalogPricing:listing.pricing,endpointUrl,
      endpoints:details.value.data.endpoints.map((item:Record<string,unknown>):PublicEndpoint=>({
        tag:item.tag as string,contextLength:item.context_length as number,
        maxPromptTokens:item.max_prompt_tokens as number|null,maxCompletionTokens:item.max_completion_tokens as number,
        pricing:item.pricing as Record<string,unknown>,supportedParameters:item.supported_parameters as string[],
        supportsImplicitCaching:item.supports_implicit_caching as boolean}))};
    audit=auditPublicReviewBound(baseline,current,rule.maximumOutputTokens,rule.maximumChargeMicros);
  }catch{return reviewRequired("endpoint-contract-unverifiable",details);}
  const sourceHash=createHash("sha256").update(`${catalog.hash}:${details.hash}`).digest("hex");
  return {status:audit.status==="unchanged-proposal-only"?"validated" as const:"review-required" as const,
    sourceHash,bytes:catalog.bytes+details.bytes,evidence:{sources:[{url:catalogUrl,sha256:catalog.hash},{url:endpointUrl,sha256:details.hash}],
      model:current,audit:{sourceUnchanged:audit.sourceUnchanged,currentMaximumMicros:audit.currentMaximumMicros,
        baselineMaximumMicros:audit.baselineMaximumMicros,proposedMaximumMicros:audit.proposedMaximumMicros}},
    paidCalls:0,tariffAdmitted:false};
}
