import type {ProviderUsageSummary} from "./usage-summary-types";
/** DeepSeek's documented chat usage: prompt_tokens = cache_hit + cache_miss.
 * No inference from Anthropic-compatible or third-party gateway field names.
 */
export function verifiedCacheRatio(group:ProviderUsageSummary,consistentAttempts:number):number|null{
  if(group.gatewayHost!=="api.deepseek.com"||group.endpointKind!=="chat-completions"
    ||group.attempts<=0||consistentAttempts!==group.attempts)return null;
  const names=["prompt_tokens","prompt_cache_hit_tokens","prompt_cache_miss_tokens"];
  const values=names.map(name=>group.fields.find(field=>field.field===name));
  if(values.some(field=>!field||field.reportedAttempts!==group.attempts||field.total===null||!/^\d+$/.test(field.total)))return null;
  const [total,hit,miss]=values.map(field=>BigInt(field!.total!));
  if(total<=BigInt(0)||hit+miss!==total)return null;
  return Number(hit)/Number(total);
}
