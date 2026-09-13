/** Public endpoint evidence only. This module cannot admit or refresh a paid tariff. */
export interface PublicEndpoint {
  tag:string;contextLength:number;maxPromptTokens:number|null;maxCompletionTokens:number;
  pricing:Record<string,unknown>;supportedParameters:string[];supportsImplicitCaching:boolean;
}
export interface PublicModel {
  id:string;canonicalSlug:string;contextLength:number;catalogPricing:Record<string,unknown>;
  endpointUrl:string;endpoints:PublicEndpoint[];
}
const pico=BigInt(1_000_000_000_000);
const fields=["prompt","input_cache_read","input_cache_write","completion"] as const;
const requiredParameters=["max_completion_tokens","reasoning","response_format","structured_outputs"];
function exactPrice(value:unknown):bigint{
  if(typeof value!=="string"||!/^\d+(?:\.\d{1,12})?$/.test(value))throw new Error("Unverifiable endpoint price");
  const [whole,fraction=""]=value.split(".");
  return BigInt(whole)*pico+BigInt(fraction.padEnd(12,"0"));
}
function ceil(value:bigint,divisor:bigint){return (value+divisor-BigInt(1))/divisor;}
function stable(value:unknown):string{
  if(Array.isArray(value))return `[${value.map(stable).join(",")}]`;
  if(value&&typeof value==="object")return `{${Object.entries(value as Record<string,unknown>)
    .sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
function contractProjection(model:PublicModel){
  return {id:model.id,canonicalSlug:model.canonicalSlug,contextLength:model.contextLength,
    catalogPricing:model.catalogPricing,endpointUrl:model.endpointUrl,
    endpoints:model.endpoints.map(endpoint=>({...endpoint,
      supportedParameters:[...endpoint.supportedParameters].sort()})).sort((a,b)=>a.tag.localeCompare(b.tag))};
}
/** Overcounts the entire model context for each input SKU and all output tokens separately. */
export function conservativeStandardBoundMicros(model:PublicModel,outputTokens:number){
  if(!Number.isSafeInteger(model.contextLength)||model.contextLength<=0
    ||!Number.isSafeInteger(outputTokens)||outputTokens<=0)throw new Error("Unverifiable model limits");
  const tags=model.endpoints.map(item=>item.tag);
  if(new Set(tags).size!==tags.length)throw new Error("Ambiguous endpoint tags");
  const excluded=model.endpoints.filter(item=>["openai/flex","openai/fast"].includes(item.tag));
  if(excluded.some(item=>requiredParameters.every(parameter=>item.supportedParameters.includes(parameter))))
    throw new Error("Excluded endpoint can serve the review request");
  const standard=model.endpoints.filter(item=>!["openai/flex","openai/fast"].includes(item.tag));
  if(!standard.length||standard.some(item=>!Number.isSafeInteger(item.contextLength)||item.contextLength<model.contextLength
    ||!Number.isSafeInteger(item.maxCompletionTokens)||item.maxCompletionTokens<outputTokens))
    throw new Error("Unverifiable standard endpoint limits");
  if(!standard.some(item=>requiredParameters.every(parameter=>item.supportedParameters.includes(parameter))))
    throw new Error("Review request has no compatible standard endpoint");
  const maxima=Object.fromEntries(fields.map(field=>[field,BigInt(0)])) as Record<(typeof fields)[number],bigint>;
  for(const endpoint of standard){
    const pricing=endpoint.pricing;
    const discount=pricing.discount??0;
    if(typeof discount!=="number"||!Number.isSafeInteger(discount*1_000_000)||discount<0||discount>=1)
      throw new Error("Unverifiable endpoint discount");
    const denominator=BigInt(Math.round((1-discount)*1_000_000));
    const overrides=pricing.overrides;
    if(overrides!==undefined&&!Array.isArray(overrides))throw new Error("Unverifiable price overrides");
    for(const tier of [pricing,...(overrides??[])] as Record<string,unknown>[])for(const field of fields){
      const amount=ceil(exactPrice(tier[field])*BigInt(1_000_000),denominator);
      if(amount>maxima[field])maxima[field]=amount;
    }
  }
  const amount=(maxima.prompt+maxima.input_cache_read+maxima.input_cache_write)*BigInt(model.contextLength)
    +maxima.completion*BigInt(outputTokens);
  const micros=ceil(amount,BigInt(1_000_000));
  if(micros>BigInt(Number.MAX_SAFE_INTEGER))throw new Error("Unverifiable charge ceiling");
  return Number(micros);
}
export function auditPublicReviewBound(baseline:PublicModel,current:PublicModel,outputTokens:number,
  proposedMaximumMicros:number){
  if(baseline.id!==current.id||baseline.endpointUrl!==current.endpointUrl
    ||!Number.isSafeInteger(proposedMaximumMicros)||proposedMaximumMicros<=0)throw new Error("Wrong model or proposal");
  const currentMaximumMicros=conservativeStandardBoundMicros(current,outputTokens);
  const baselineMaximumMicros=conservativeStandardBoundMicros(baseline,outputTokens);
  const sourceUnchanged=stable(contractProjection(current))===stable(contractProjection(baseline));
  return {status:!sourceUnchanged?"review-required" as const:currentMaximumMicros>proposedMaximumMicros
    ?"bound-insufficient" as const:"unchanged-proposal-only" as const,
    sourceUnchanged,currentMaximumMicros,baselineMaximumMicros,proposedMaximumMicros,
    paidCalls:0,tariffAdmitted:false};
}
