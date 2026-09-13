import {createHash} from "node:crypto";

// Official usage accounting + OpenAPI ChatUsage, verified 2026-09-13.
// No generic gateway, BYOK or historical-report completeness is inferred.
export const OPENROUTER_COST_REPORT_SOURCE = {
  version: "openrouter-inline-credits-report-20260913-v1",
  reference: "https://openrouter.ai/docs/cookbook/administration/usage-accounting",
  schemaReference: "https://openrouter.ai/openapi.json",
  currencyReference: "https://openrouter.ai/docs/faq",
  verifiedAt: "2026-09-13T00:00:00.000Z",
  expiresAt: "2026-09-20T00:00:00.000Z",
} as const;

function object(value:unknown):Record<string,unknown>{
  return value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
}
function count(value:unknown):value is number{return typeof value==="number"&&Number.isSafeInteger(value)&&value>=0;}
function hash(value:string){return createHash("sha256").update(value).digest("hex");}

/** Round the provider's decimal dollar value upward once, avoiding binary *1e6 artifacts. */
export function reportedDollarsToMicros(value:unknown):number|null{
  if(typeof value!=="number"||!Number.isFinite(value)||value<0||value>1_000_000)return null;
  const match=/^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(String(value));
  if(!match)return null;
  const fraction=match[2]??"";
  const digits=BigInt(match[1]+fraction);
  const exponent=Number(match[3]??0)-fraction.length+6;
  const divisor=exponent<0?BigInt(10)**BigInt(-exponent):BigInt(1);
  const amount=exponent<0?(digits+divisor-BigInt(1))/divisor:digits*BigInt(10)**BigInt(exponent);
  return amount<=BigInt(1_000_000_000_000)?Number(amount):null;
}

/** Pure admission check for a response just received by our trusted HTTPS transport.
 * Never call this on model output, an HTTP client's supplied report, or a historical
 * JSON upload. Its hash must also uniquely match the stored reservation before release.
 * Financial completion is separate from usable model output (e.g. a length stop costs money).
 */
export function openRouterInlineCostReport(input:{url:URL;method:string;httpStatus:number;
  request:Record<string,unknown>;response:unknown;now?:number}){
  const now=input.now??Date.now();
  if(!Number.isFinite(now)||now<Date.parse(OPENROUTER_COST_REPORT_SOURCE.verifiedAt)
    ||now>=Date.parse(OPENROUTER_COST_REPORT_SOURCE.expiresAt))return null;
  if(input.url.origin!=="https://openrouter.ai"||input.url.pathname!=="/api/v1/chat/completions"
    ||input.url.search||input.url.username||input.url.password||input.method!=="POST"||input.httpStatus!==200)return null;
  const request=input.request;
  const allowed=new Set(["model","messages","max_tokens","max_completion_tokens","temperature","top_p",
    "stop","seed","response_format","reasoning","reasoning_effort","provider","stream","usage"]);
  if(Object.keys(request).some(key=>!allowed.has(key))||request.stream===true
    ||typeof request.model!=="string"||!request.model||request.model.includes(":"))return null;
  if(!Array.isArray(request.messages)||!request.messages.length||request.messages.some(value=>{
    const message=object(value);
    return !["system","user","assistant","developer"].includes(String(message.role))
      ||typeof message.content!=="string"||Object.keys(message).some(key=>!["role","content"].includes(key));
  }))return null;
  const response=object(input.response);
  const usage=object(response.usage);
  const amountMicros=reportedDollarsToMicros(usage.cost);
  const choices=Array.isArray(response.choices)?response.choices:[];
  if(response.object!=="chat.completion"||response.error!==undefined||response.model!==request.model
    ||typeof response.id!=="string"||!/^gen-[-a-zA-Z0-9_]{1,500}$/.test(response.id)
    ||choices.length!==1||!["stop","length","content_filter"].includes(String(object(choices[0]).finish_reason))
    ||usage.is_byok!==false||amountMicros===null
    ||!count(usage.prompt_tokens)||!count(usage.completion_tokens)||!count(usage.total_tokens)
    ||usage.total_tokens!==usage.prompt_tokens+usage.completion_tokens)return null;
  // is_byok=false is an explicit per-request provider assertion, not a deployment default.
  // usage.cost already includes cache/reasoning: do not add cost_details a second time.
  return {kind:"provider-report" as const,amountMicros,complete:true,
    providerRequestHash:hash(response.id),
    sourceReferenceHash:hash(`${OPENROUTER_COST_REPORT_SOURCE.version}:${response.id}`),
    sourceVersion:OPENROUTER_COST_REPORT_SOURCE.version};
}
