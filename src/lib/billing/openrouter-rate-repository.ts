import {transaction,query} from "@/lib/rag/db";
import {fetchOpenRouterSolRateEvidence,OPENROUTER_SOL_RATE_SOURCE,OPENROUTER_SOL_TARIFF_KEY} from "./openrouter-rate-reference";

/** Public GETs only, serialized across processes. This never admits or extends a payable tariff. */
export async function refreshOpenRouterSolRateEvidence(transport:typeof fetch=fetch,now=Date.now()){
  return transaction(async client=>{
    const lock=await client.query<{locked:boolean}>("select pg_try_advisory_xact_lock(hashtextextended($1,0)) as locked",[OPENROUTER_SOL_RATE_SOURCE]);
    if(!lock.rows[0]?.locked)return {status:"refresh-in-progress" as const,httpCalls:0};
    const prior=await client.query<{next_attempt_at:Date;hold:boolean}>(
      "select next_attempt_at,hold from billing_tariff_refresh_state where source_key=$1",[OPENROUTER_SOL_RATE_SOURCE]);
    const previous=prior.rows[0];
    if(previous&&new Date(previous.next_attempt_at).getTime()>now)return {status:"cached-refresh-state" as const,httpCalls:0};
    const started=Date.now();
    let httpCalls=0;
    const countedFetch:typeof fetch=(input,init)=>{httpCalls++;return transport(input,init);};
    let evidence:Awaited<ReturnType<typeof fetchOpenRouterSolRateEvidence>>|undefined;
    try{evidence=await fetchOpenRouterSolRateEvidence(countedFetch);}catch{/* No raw public response or transport error in logs. */}
    const hold=Boolean(previous?.hold||evidence?.status==="review-required");
    const status=!evidence?"unavailable" as const:hold?"review-required" as const:"validated" as const;
    if(evidence)await client.query(`insert into billing_tariff_evidence_snapshot(source_key,source_hash,tariff_key,observed_at,evidence)
      values($1,$2,$3,$4,$5) on conflict do nothing`,[
      OPENROUTER_SOL_RATE_SOURCE,evidence.sourceHash,OPENROUTER_SOL_TARIFF_KEY,new Date(now).toISOString(),JSON.stringify(evidence.evidence)]);
    const nextAttemptAt=new Date(now+(evidence?7*24:1)*60*60*1000).toISOString();
    await client.query(`insert into billing_tariff_refresh_state(source_key,tariff_key,checked_at,next_attempt_at,status,hold)
      values($1,$2,$3,$4,$5,$6) on conflict(source_key) do update set
      checked_at=excluded.checked_at,next_attempt_at=excluded.next_attempt_at,status=excluded.status,hold=excluded.hold`,[
      OPENROUTER_SOL_RATE_SOURCE,OPENROUTER_SOL_TARIFF_KEY,new Date(now).toISOString(),nextAttemptAt,status,hold]);
    await client.query(`insert into billing_tariff_refresh_observation(source_key,checked_at,status,metrics) values($1,$2,$3,$4)`,[
      OPENROUTER_SOL_RATE_SOURCE,new Date(now).toISOString(),status,JSON.stringify({inputItems:1,
        generatedOutputItems:evidence?1:0,validOutputItems:evidence?1:0,downstreamUsedItems:evidence?1:0,
        inputBytes:0,outputBytes:evidence?.bytes??null,inputTokens:0,outputTokens:0,apiCredits:0,costUsd:0,
        freeHttpRequests:httpCalls,latencyMs:Date.now()-started,retries:0,
        utilizationEfficiency:evidence?1:0,discardedReasonCounts:evidence?{}:{publicRateEvidenceUnavailable:1},
        usageBoundary:"public-rate-evidence-only-never-tariff-admission-or-payment",
        optimizationOpportunity:"Share one seven-day public snapshot; review contract drift before any new reservation"})]);
    return {status,httpCalls,nextAttemptAt,hold};
  });
}

/** Read-only status for a review screen; a missing observation never extends a static tariff. */
export async function readOpenRouterSolRateStatus(){
  const rows=await query<{checked_at:Date;next_attempt_at:Date;status:string;hold:boolean}>(
    "select checked_at,next_attempt_at,status,hold from billing_tariff_refresh_state where source_key=$1",[OPENROUTER_SOL_RATE_SOURCE]);
  const row=rows[0];
  return row?{checkedAt:new Date(row.checked_at).toISOString(),nextAttemptAt:new Date(row.next_attempt_at).toISOString(),status:row.status,hold:row.hold}
    :{checkedAt:null,nextAttemptAt:null,status:"missing",hold:false};
}
