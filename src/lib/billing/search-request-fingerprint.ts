import {createHash} from "node:crypto";
import type {RequestBound} from "./policy";

const contracts=new Set<RequestBound["requestContract"]>(["brave-web-search-v1","tavily-search-v1","tavily-basic-extract-v1","exa-company-auto-text-v1",
  "google-places-text-enterprise-v1","searchapi-google-bing-v1"]);
function canonical(value:unknown):unknown{
  if(Array.isArray(value))return value.map(canonical);
  if(value!==null&&typeof value==="object")return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)]));
  return value;
}
/** Only admitted synchronous search contracts; polling and unrelated forms remain unaffected. */
export function searchRequestFingerprint(rule:RequestBound,request:Request,body:Record<string,unknown>):string|undefined{
  if(!contracts.has(rule.requestContract))return undefined;
  const url=new URL(request.url),query=new URLSearchParams(url.search);
  query.delete("api_key");query.sort();
  const publicBody={...body};delete publicBody.api_key;
  const fieldMask=request.headers.get("x-goog-fieldmask")?.split(",").map(value=>value.trim()).sort().join(",")??null;
  return createHash("sha256").update(JSON.stringify({version:"paid-search-replay-v1",contract:rule.requestContract,
    method:request.method,origin:url.origin,pathname:url.pathname,query:query.toString(),body:canonical(publicBody),fieldMask})).digest("hex");
}
