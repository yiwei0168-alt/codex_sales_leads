import {metricIdentifier} from "./model-attempt-context";
import {createHash} from "node:crypto";

/** Numeric/identifier allowlist only: never persist provider response bodies or arbitrary metadata. */
export const PROVIDER_USAGE_FIELDS = [
  "prompt_tokens", "input_tokens", "completion_tokens", "output_tokens", "total_tokens",
  "prompt_cache_hit_tokens", "prompt_cache_miss_tokens",
  "cache_read_input_tokens", "cache_creation_input_tokens",
  "prompt_tokens_details.cached_tokens", "completion_tokens_details.reasoning_tokens",
  "prompt_tokens_details.cache_write_tokens",
  "input_tokens_details.cached_tokens", "output_tokens_details.reasoning_tokens",
  "cache_creation.ephemeral_5m_input_tokens", "cache_creation.ephemeral_1h_input_tokens",
  "output_tokens_details.thinking_tokens",
] as const;

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function providerIdentifier(value:unknown):string|null{
  if(value==="OpenAI")return "openai";
  if(value==="Amazon Bedrock")return "amazon-bedrock";
  if(value==="Azure")return "azure";
  return metricIdentifier(value);
}

export function providerUsageObservation(result: unknown,input?:{httpStatus?:number;generationId?:string|null}) {
  const root=object(result);
  const choices=Array.isArray(root.choices)?root.choices:[];
  const stop=choices.length===1?object(choices[0]).finish_reason:root.stop_reason??root.status;
  const finishReason=typeof stop==="string"&&["stop","length","max_tokens","end_turn","stop_sequence","tool_calls","tool_use","content_filter","refusal","completed","incomplete","failed"].includes(stop)?stop:null;
  const usage = object(object(result).usage);
  const fields = Object.fromEntries(PROVIDER_USAGE_FIELDS.map(path => {
    const value = path.split(".").reduce<unknown>((part, key) => object(part)[key], usage);
    return [path, typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null];
  }));
  const router=object(root.openrouter_metadata);
  const rawAttempts=Array.isArray(router.attempts)?router.attempts.slice(0,8):[];
  const routerAttempts=rawAttempts.map(value=>{
    const item=object(value);const provider=providerIdentifier(item.provider);
    const status=typeof item.status==="number"&&Number.isInteger(item.status)&&item.status>=100&&item.status<=599?item.status:null;
    return provider&&status?{provider,status}:null;
  }).filter((value):value is {provider:string;status:number}=>value!==null);
  const errorCode=object(root.error).code;
  const requestId=typeof root.id==="string"?root.id:input?.generationId;
  return {
    version: "provider-usage-observation-v2",
    source: "http-response-usage",
    reportedModel: metricIdentifier(object(result).model),
    finishReason,
    httpStatus:typeof input?.httpStatus==="number"&&Number.isInteger(input.httpStatus)
      &&input.httpStatus>=100&&input.httpStatus<=599?input.httpStatus:null,
    errorCode:typeof errorCode==="number"&&Number.isInteger(errorCode)?errorCode:metricIdentifier(errorCode),
    routerAttempt:typeof router.attempt==="number"&&Number.isInteger(router.attempt)&&router.attempt>=0?router.attempt:null,
    routerAttempts,
    providerRequestHash: typeof requestId==="string"&&requestId.length>0&&requestId.length<=512
      ?createHash("sha256").update(requestId).digest("hex"):null,
    fields,
    observedFieldCount: Object.values(fields).filter(value => value !== null).length,
    // Input/cache semantics vary by gateway and protocol. No cross-protocol summation or inferred discounts.
    cacheHitRatio: null,
    localResultReuse: false,
    invoiceVerified: false,
  };
}

export type ProviderUsageObservation = ReturnType<typeof providerUsageObservation>;
