import {createHash} from "node:crypto";
import baseline from "../../../docs/DEEPSEEK_PUBLIC_RATE_BASELINE_2026-09-14.json";
import {billingPolicy} from "./policy";

export const DEEPSEEK_RATE_SOURCES = [
  {sourceKey:"deepseek-flash-public-pricing-v1",tariffKey:"deepseek-flash-v41-text-json",model:"deepseek-flash"},
  {sourceKey:"deepseek-pro-public-pricing-v1",tariffKey:"deepseek-pro-0813-nonthinking-text",model:"deepseek-v4-pro"},
] as const;
const sourceUrl=baseline.source;
type RatePair={offPeak:number;peak:number};
type ModelRate={id:string;version:string;cacheHit:RatePair;cacheMiss:RatePair;output:RatePair};
type ParsedRates={contextLength:string;maximumOutput:string;models:ModelRate[]};

function checkedRules(){
  return DEEPSEEK_RATE_SOURCES.map(source=>{
    const rule=billingPolicy.rules.find(item=>item.key===source.tariffKey);
    const model=baseline.models.find(item=>item.id===source.model);
    if(!rule||!model||rule.model!==source.model||rule.reference!==sourceUrl
      ||rule.maximumOutputTokens!==8192
      ||rule.maximumChargeMicros!==Math.ceil(1048576*model.cacheMiss.peak+8192*model.output.peak))
      throw new Error("DeepSeek public baseline and active tariff differ");
    return {source,rule,model};
  });
}
const checked=checkedRules();

function cells(row:string){
  return [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(match=>match[1]
    .replace(/<br\s*\/?\s*>/gi," ").replace(/<[^>]*>/g," ")
    .replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/\s+/g," ").trim());
}
function price(value:string){
  if(!/^\$(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value))throw new Error("Unverifiable price cell");
  return Number(value.slice(1));
}
function uniqueRow(rows:string[][],label:string){
  const matches=rows.map((row,index)=>({row,index})).filter(item=>item.row.includes(label));
  if(matches.length!==1)throw new Error("Missing or duplicate public pricing row");
  return matches[0];
}
function pricePair(rows:string[][],label:string):[RatePair,RatePair]{
  const {row,index}=uniqueRow(rows,label);
  const peak=rows[index+1];
  if(![4,5].includes(row.length)||row.at(-3)!=="OFF-PEAK"||!peak||peak.length!==3||peak[0]!=="PEAK")
    throw new Error("Public peak/off-peak pricing shape changed");
  return [{offPeak:price(row.at(-2)!),peak:price(peak[1])},
    {offPeak:price(row.at(-1)!),peak:price(peak[2])}];
}

/** Strictly parses the official two-model price table; ambiguous HTML is never admitted as unchanged. */
export function parseDeepSeekPublicRates(html:string):ParsedRates{
  const tables=[...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)]
    .map(match=>match[0]).filter(table=>table.includes("deepseek-flash")&&table.includes("deepseek-v4-pro"));
  if(tables.length!==1)throw new Error("Public model table missing or ambiguous");
  const rows=[...tables[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(match=>cells(match[1]));
  const names=uniqueRow(rows,"MODEL").row.map(value=>value.replace(/\s*\(\d+\)$/,""));
  const versions=uniqueRow(rows,"MODEL VERSION").row;
  const context=uniqueRow(rows,"CONTEXT LENGTH").row;
  const maximum=uniqueRow(rows,"MAX OUTPUT").row;
  if(names.length!==3||names[0]!=="MODEL"||names[1]!=="deepseek-flash"||names[2]!=="deepseek-v4-pro"
    ||versions.length!==3||versions[0]!=="MODEL VERSION"
    ||context.length!==2||maximum.length!==2)throw new Error("Public model identity or capability shape changed");
  const [flashHit,proHit]=pricePair(rows,"1M INPUT TOKENS (CACHE HIT)");
  const [flashMiss,proMiss]=pricePair(rows,"1M INPUT TOKENS (CACHE MISS)");
  const [flashOutput,proOutput]=pricePair(rows,"1M OUTPUT TOKENS");
  return {contextLength:context[1],maximumOutput:maximum[1],models:[
    {id:names[1],version:versions[1],cacheHit:flashHit,cacheMiss:flashMiss,output:flashOutput},
    {id:names[2],version:versions[2],cacheHit:proHit,cacheMiss:proMiss,output:proOutput},
  ]};
}

/** One public GET checks both static tariffs; no tariff, expiry or spending authorization is changed. */
export async function fetchDeepSeekRateEvidence(transport:typeof fetch=fetch){
  const response=await transport(sourceUrl,{method:"GET",redirect:"error",signal:AbortSignal.timeout(30000)});
  if(!response.ok||!response.headers.get("content-type")?.toLowerCase().includes("text/html"))
    throw new Error("Official public pricing page unavailable");
  const html=await response.text();
  const bytes=Buffer.byteLength(html,"utf8");
  if(bytes>1_000_000)throw new Error("Official public pricing page too large");
  const sourceHash=createHash("sha256").update(html).digest("hex");
  let current:ParsedRates|null=null;
  try{current=parseDeepSeekPublicRates(html);}catch{/* Ambiguous page is review-required, not a cache miss. */}
  const items=checked.map(({source,rule,model})=>{
    const observed=current?.models.find(item=>item.id===source.model);
    const unchanged=Boolean(observed&&current?.contextLength===baseline.contextLength
      &&current.maximumOutput===baseline.maximumOutput
      &&JSON.stringify(observed)===JSON.stringify(model));
    return {sourceKey:source.sourceKey,tariffKey:source.tariffKey,
      status:unchanged?"validated" as const:"review-required" as const,
      evidence:{source:{url:sourceUrl,sha256:sourceHash},observed:observed??null,
        contextLength:current?.contextLength??null,maximumOutput:current?.maximumOutput??null,
        audit:{sourceUnchanged:unchanged,currentMaximumMicros:observed
          ?Math.ceil(1048576*observed.cacheMiss.peak+8192*observed.output.peak):null,
        baselineMaximumMicros:rule.maximumChargeMicros,tariffAdmitted:false,
        reason:current?unchanged?"unchanged":"public-contract-changed":"public-contract-unverifiable"}}};
  });
  return {sourceHash,bytes,items,paidCalls:0,tariffAdmitted:false};
}
