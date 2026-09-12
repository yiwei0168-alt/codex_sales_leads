import {tenantQuery} from "@/lib/rag/db";
import {PROVIDER_USAGE_FIELDS} from "./provider-usage";
import type {ProviderUsageSummary} from "./usage-summary-types";
import {verifiedCacheRatio} from "./cache-ratio";

// Field names are compiled from the numeric allowlist, never user-controlled SQL.
const fieldAggregates=PROVIDER_USAGE_FIELDS.flatMap((field,index)=>{
  const json=`metrics->'providerUsage'->'fields'->'${field}'`;
  const value=`metrics->'providerUsage'->'fields'->>'${field}'`;
  const valid=`jsonb_typeof(${json})='number' and ${value} ~ '^[0-9]{1,16}$'`;
  return [`count(*) filter(where ${valid})::int as f${index}_coverage`,
    `sum(case when ${valid} then (${value})::numeric else null end)::text as f${index}_total`];
}).join(",\n");
const cacheFields=["prompt_tokens","prompt_cache_hit_tokens","prompt_cache_miss_tokens"];
const cacheValid=cacheFields.map(field=>`jsonb_typeof(metrics->'providerUsage'->'fields'->'${field}')='number' and metrics->'providerUsage'->'fields'->>'${field}' ~ '^[0-9]{1,16}$'`).join(" and ");
const [cacheTotal,cacheHit,cacheMiss]=cacheFields.map(field=>`(metrics->'providerUsage'->'fields'->>'${field}')::numeric`);

export async function readProviderUsageSummary(userId:string,operationId?:string):Promise<ProviderUsageSummary[]>{
  const rows=await tenantQuery<Record<string,unknown>>(userId,`select stage,
    metrics->'modelAttempt'->>'provider' as provider,
    metrics->'modelAttempt'->>'requestedModel' as requested_model,
    metrics->'providerUsage'->>'reportedModel' as reported_model,
    metrics->'modelAttempt'->>'promptVersion' as prompt_version,
    metrics->'modelAttempt'->>'gatewayHost' as gateway_host,
    metrics->'modelAttempt'->>'endpointKind' as endpoint_kind,
    metrics->'modelAttempt'->>'scoringVersion' as scoring_version,
    metrics->'providerUsage'->>'finishReason' as finish_reason,
    count(*)::int as attempts,${fieldAggregates},
    count(*) filter(where case when ${cacheValid} then ${cacheHit}+${cacheMiss}=${cacheTotal} else false end)::int as cache_consistent_attempts
    from paid_call_reservation where user_id=$1 and ($2::text is null or operation_id=$2)
    group by 1,2,3,4,5,6,7,8,9 order by 1,2,3,4,5,6,7,8,9`,[userId,operationId??null]);
  const identifier=(value:unknown)=>typeof value==="string"?value:null;
  return rows.map(row=>{const group:ProviderUsageSummary={stage:String(row.stage),provider:identifier(row.provider),requestedModel:identifier(row.requested_model),
    reportedModel:identifier(row.reported_model),promptVersion:identifier(row.prompt_version),
    scoringVersion:identifier(row.scoring_version),finishReason:identifier(row.finish_reason),
    gatewayHost:identifier(row.gateway_host),endpointKind:identifier(row.endpoint_kind),attempts:Number(row.attempts),
    fields:PROVIDER_USAGE_FIELDS.map((field,index)=>({field,reportedAttempts:Number(row[`f${index}_coverage`]),total:identifier(row[`f${index}_total`])})),
  };return {...group,cacheInputHitRate:verifiedCacheRatio(group,Number(row.cache_consistent_attempts))};});
}
