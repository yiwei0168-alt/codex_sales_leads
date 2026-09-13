import {createHash} from "node:crypto";
import baseline from "../../../docs/SEARCH_PUBLIC_RATE_BASELINE_2026-09-14.json";
import {billingPolicy} from "./policy";

export const SEARCH_RATE_SOURCES=[
  {sourceKey:"brave-search-public-pricing-v1",tariffKey:"brave-standard-web-search",kind:"brave"},
  {sourceKey:"tavily-search-public-pricing-v1",tariffKey:"tavily-standard-search",kind:"tavily"},
  {sourceKey:"exa-search-public-pricing-v1",tariffKey:"exa-company-auto-text-search",kind:"exa"},
  {sourceKey:"google-places-text-enterprise-public-pricing-v1",tariffKey:"google-places-text-search-enterprise",kind:"places"},
] as const;
export type SearchRateSource=typeof SEARCH_RATE_SOURCES[number];
type BraveRate={plan:string;currency:string;usdPer1000Requests:number};
type TavilyRate={usdPerCredit:number;basicCredits:number;advancedCredits:number};
type ExaRate={searchUsdPer1000Requests:number;additionalResultUsdPer1000:number;
  summaryUsdPer1000Pages:number;contentsUsdPer1000Pages:number};
type PlacesRate={sku:string;usdPer1000Events:number};

function configuredSource(source:SearchRateSource){
  const rule=billingPolicy.rules.find(item=>item.key===source.tariffKey);
  const expected=baseline[source.kind];
  const requestContract={brave:"brave-web-search-v1",tavily:"tavily-search-v1",
    exa:"exa-company-auto-text-v1",places:"google-places-text-enterprise-v1"}[source.kind];
  const endpoint={brave:["https://api.search.brave.com","/res/v1/web/search"],
    tavily:["https://api.tavily.com","/search"],exa:["https://api.exa.ai","/search"],
    places:["https://places.googleapis.com","/v1/places:searchText"]}[source.kind];
  if(!rule||rule.reference!==expected.canonicalReference||rule.requestContract!==requestContract
    ||rule.origin!==endpoint[0]||rule.pathname!==endpoint[1]
    ||rule.model!==""||rule.maximumRequestBytes!==16384||rule.maximumOutputTokens!==0
    ||rule.maximumChargeMicros!==expected.maximumChargeMicros
    ||(source.kind==="brave"&&rule.maximumChargeMicros!==Math.ceil(baseline.brave.usdPer1000Requests*1000))
    ||(source.kind==="tavily"&&rule.maximumChargeMicros!==Math.ceil(
      baseline.tavily.usdPerCredit*baseline.tavily.advancedCredits*1_000_000))
    ||(source.kind==="places"&&rule.maximumChargeMicros!==baseline.places.usdPer1000Events*1000))
    throw new Error("Public search baseline and active tariff differ");
  return expected;
}
SEARCH_RATE_SOURCES.forEach(configuredSource);

/** The official page publishes a structured Search Plan offer distinct from Answers. */
export function parseBraveSearchRate(html:string):BraveRate{
  const products=[...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .flatMap(match=>{try{const value:unknown=JSON.parse(match[1]);return Array.isArray(value)?value:[value];}
      catch{return [];}}).filter((value):value is Record<string,unknown>=>Boolean(value&&typeof value==="object"));
  const matches=products.filter(item=>item.name==="Brave Search API"&&item.url===baseline.brave.sourceUrl);
  if(matches.length!==1||!Array.isArray(matches[0].offers))throw new Error("Brave Search product offer unavailable");
  const offers=(matches[0].offers as unknown[]).filter((value):value is Record<string,unknown>=>
    Boolean(value&&typeof value==="object"));
  const search=offers.filter(item=>item.name===baseline.brave.plan);
  if(search.length!==1||search[0].priceCurrency!=="USD"||typeof search[0].description!=="string")
    throw new Error("Brave Search plan is missing or ambiguous");
  const price=/^\$([0-9]+(?:\.[0-9]{1,6})?) per 1,000 requests(?:\.|$)/.exec(search[0].description);
  if(!price)throw new Error("Brave Search unit price cannot be verified");
  const plans=html.split('<section id="plans">');
  if(plans.length!==2)throw new Error("Brave visible plans are missing or ambiguous");
  const searchStart=plans[1].indexOf(">Search</h3>");
  const answersStart=plans[1].indexOf(">Answers</h3>");
  if(searchStart<0||answersStart<=searchStart)throw new Error("Brave visible Search plan unavailable");
  const visible=plans[1].slice(searchStart,answersStart).replace(/<[^>]*>/g," ").replace(/\s+/g," ");
  const visiblePrices=[...visible.matchAll(/\$([0-9]+(?:\.[0-9]{1,6})?) per 1,000 requests/g)];
  if(visiblePrices.length!==1||Number(visiblePrices[0][1])!==Number(price[1]))
    throw new Error("Brave structured and visible Search prices disagree");
  return {plan:baseline.brave.plan,currency:"USD",usdPer1000Requests:Number(price[1])};
}

/** Parse only the Search credit table, keeping Extract and Research prices out of scope. */
export function parseTavilySearchRate(markdown:string):TavilyRate{
  const normalized=markdown.replace(/\\\$/g,"$");
  const pricing=normalized.split("## Pricing Overview")[1]?.split("## API Credits Costs")[0];
  const search=normalized.split("### Tavily Search")[1]?.split("### Tavily Extract")[0];
  if(!pricing||!search)throw new Error("Tavily Search pricing section unavailable");
  const price=[...pricing.matchAll(/\* \*\*Pay-as-you-go\*\*:\s*\$([0-9]+(?:\.[0-9]{1,6})?) per credit/g)];
  const table=[...pricing.matchAll(/^\|\s*\*\*Pay as you go\*\*\s*\|\s*Per usage\s*\|\s*\$([0-9]+(?:\.[0-9]{1,6})?) \/ Credit\s*\|\s*\$([0-9]+(?:\.[0-9]{1,6})?)\s*\|$/gm)];
  const basic=[...search.matchAll(/\* \*\*Basic Search \(`basic`\):\*\*\s*Each request costs \*\*([0-9]+) API credit\*\*/g)];
  const advanced=[...search.matchAll(/\* \*\*Advanced Search \(`advanced`\):\*\*\s*Each request costs \*\*([0-9]+) API credits\*\*/g)];
  if(price.length!==1||table.length!==1||table[0][1]!==price[0][1]||table[0][2]!==price[0][1]
    ||basic.length!==1||advanced.length!==1)throw new Error("Tavily Search credit price is ambiguous");
  return {usdPerCredit:Number(price[0][1]),basicCredits:Number(basic[0][1]),advancedCredits:Number(advanced[0][1])};
}

function visibleText(html:string){return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]*>/g," ")
  .replace(/&nbsp;|&#160;/gi," ").replace(/\s+/g," ").trim();}

/** The Search column is separate from Deep Search, Agent, and standalone Contents. */
export function parseExaSearchRate(html:string):ExaRate{
  const section=visibleText(html).split("Endpoint pricing")[1]?.split("Agent pricing")[0];
  if(!section||!section.includes("Endpoint Search Deep Search Deep-Reasoning Search Contents Monitors Answer"))
    throw new Error("Exa endpoint table unavailable");
  const base=/Base price, with up to 10 results \(per 1k requests\) \$([0-9]+) \$[0-9]+ \$[0-9]+ \$([0-9]+) \(per 1k pages\)/.exec(section);
  const extra=/Cost per additional result above 10 \(per 1k requests\) \$([0-9]+) /.exec(section);
  const summary=/AI page summaries \(per 1k pages\) \$([0-9]+) /.exec(section);
  if(!base||!extra||!summary)throw new Error("Exa Search units unavailable");
  return {searchUsdPer1000Requests:Number(base[1]),additionalResultUsdPer1000:Number(extra[1]),
    summaryUsdPer1000Pages:Number(summary[1]),contentsUsdPer1000Pages:Number(base[2])};
}

/** Match the exact Enterprise SKU, excluding the separate Atmosphere SKU and volume discounts. */
export function parseGooglePlacesRate(html:string):PlacesRate{
  const text=visibleText(html);
  const row=new RegExp(`Places API Text Search Enterprise ${baseline.places.sku} 1,000 \\$([0-9]+(?:\\.[0-9]+)?)`).exec(text);
  if(!row)throw new Error("Google Places Enterprise SKU unavailable");
  return {sku:baseline.places.sku,usdPer1000Events:Number(row[1])};
}

/** A public response is evidence, never approval to change an admitted request bound. */
export async function fetchSearchRateEvidence(source:SearchRateSource,transport:typeof fetch=fetch){
  const expected=configuredSource(source);
  const response=await transport(expected.sourceUrl,{method:"GET",redirect:"manual",signal:AbortSignal.timeout(30_000)});
  if(response.status===0||response.status===429||response.status>=500)
    throw new Error("Official public search price unavailable");
  const body=await response.text();
  const bytes=Buffer.byteLength(body,"utf8");
  const sourceHash=createHash("sha256").update(body).digest("hex");
  let observed:BraveRate|TavilyRate|ExaRate|PlacesRate|null=null;
  try{if(response.status===200&&bytes<=1_000_000&&response.headers.get("content-type")?.toLowerCase()
    .includes(source.kind==="tavily"?"text/markdown":"text/html"))
    observed=source.kind==="brave"?parseBraveSearchRate(body):source.kind==="tavily"
      ?parseTavilySearchRate(body):source.kind==="exa"?parseExaSearchRate(body):parseGooglePlacesRate(body);
  }catch{/* An ambiguous public page must hold the existing rule for review. */}
  const baselineRate=source.kind==="brave"
    ?{plan:baseline.brave.plan,currency:baseline.brave.currency,
      usdPer1000Requests:baseline.brave.usdPer1000Requests}
    :source.kind==="tavily"?{usdPerCredit:baseline.tavily.usdPerCredit,basicCredits:baseline.tavily.basicCredits,
      advancedCredits:baseline.tavily.advancedCredits}
    :source.kind==="exa"?{searchUsdPer1000Requests:baseline.exa.searchUsdPer1000Requests,
      additionalResultUsdPer1000:baseline.exa.additionalResultUsdPer1000,
      summaryUsdPer1000Pages:baseline.exa.summaryUsdPer1000Pages,
      contentsUsdPer1000Pages:baseline.exa.contentsUsdPer1000Pages}
    :{sku:baseline.places.sku,usdPer1000Events:baseline.places.usdPer1000Events};
  const unchanged=observed!==null&&JSON.stringify(observed)===JSON.stringify(baselineRate);
  return {sourceKey:source.sourceKey,tariffKey:source.tariffKey,sourceHash,bytes,
    status:unchanged?"validated" as const:"review-required" as const,
    evidence:{source:{url:expected.sourceUrl,sha256:sourceHash},observed,
      baseline:baselineRate,audit:{sourceUnchanged:unchanged,tariffAdmitted:false,
        reason:observed?unchanged?"unchanged":"public-contract-changed":"public-contract-unverifiable"}},
    paidCalls:0,tariffAdmitted:false};
}
