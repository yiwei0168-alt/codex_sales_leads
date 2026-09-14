import {createHash} from "node:crypto";
import {foreignReservationMicros,PRODUCTION_FX_MAX_AGE_MS,type ForeignCostBound} from "./fx-policy";

export const ECB_REFERENCE_URL="https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
export const ECB_SOURCE_KEY="ecb-cny-usd-reference-v1";
export const MAX_REFERENCE_BYTES=65536;
export class StaleEcbReferenceError extends Error {
  constructor(){super("Official FX reference is past the weekly validity window");this.name="StaleEcbReferenceError";}
}

/** Date-only source: UTC midnight is deliberately conservative for the weekly limit. */
export function parseEcbCnyReference(xml:string,retrievedAt=new Date().toISOString()){
  if(Buffer.byteLength(xml)>MAX_REFERENCE_BYTES||/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error("Invalid reference envelope");
  const dates=[...xml.matchAll(/<Cube\b[^>]*\btime=['"]([^'"]+)['"][^>]*>/g)].map(match=>match[1]);
  if(dates.length!==1||!/^\d{4}-\d{2}-\d{2}$/.test(dates[0]))throw new Error("Ambiguous reference date");
  const asOf=`${dates[0]}T00:00:00.000Z`;
  if(!Number.isFinite(Date.parse(asOf))||new Date(asOf).toISOString()!==asOf)throw new Error("Invalid reference date");
  const rows=[...xml.matchAll(/<Cube\b([^>]+)\/?\s*>/g)].map(match=>match[1]);
  const rate=(currency:string)=>{
    const matched=rows.filter(row=>new RegExp(`\\bcurrency=['"]${currency}['"]`).test(row));
    if(matched.length!==1)throw new Error("Missing or duplicate currency");
    const value=matched[0].match(/\brate=['"]([0-9]+(?:\.[0-9]+)?)['"]/);
    if(!value||!/^\d{1,8}(\.\d{1,6})?$/.test(value[1]))throw new Error("Invalid reference rate");
    const [whole,part=""]=value[1].split(".");
    const scaled=BigInt(whole)*BigInt(1000000)+BigInt(part.padEnd(6,"0"));
    if(scaled<=BigInt(0))throw new Error("Non-positive reference rate");
    return scaled;
  };
  const usd=rate("USD"),cny=rate("CNY");
  const fx:ForeignCostBound["fx"]={usdNumerator:usd.toString(),nativeDenominator:cny.toString(),asOf,retrievedAt,
    reference:ECB_REFERENCE_URL,version:`ecb-cny-usd-${dates[0]}`};
  if(Date.parse(retrievedAt)-Date.parse(asOf)>=PRODUCTION_FX_MAX_AGE_MS)throw new StaleEcbReferenceError();
  foreignReservationMicros({currency:"CNY",maximumNativeMicros:0,fx},Date.parse(retrievedAt));
  return {currency:"CNY" as const,sourceHash:createHash("sha256").update(xml).digest("hex"),referenceDate:dates[0],fx};
}

export async function fetchEcbCnyReference(transport:typeof fetch=fetch,now=Date.now()){
  const response=await transport(ECB_REFERENCE_URL,{redirect:"error",signal:AbortSignal.timeout(15000)});
  if(!response.ok||!response.body)throw new Error("Reference fetch failed");
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let bytes=0;
  try{
    while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;
      if(bytes>MAX_REFERENCE_BYTES){await reader.cancel();throw new Error("Reference response oversized");}
      chunks.push(part.value);
    }
  }finally{reader.releaseLock();}
  return {...parseEcbCnyReference(Buffer.concat(chunks).toString("utf8"),new Date(now).toISOString()),bytes};
}
