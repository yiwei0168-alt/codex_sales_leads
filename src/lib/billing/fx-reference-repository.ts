import {transaction,query} from "@/lib/rag/db";
import {fetchEcbCnyReference,ECB_SOURCE_KEY,ECB_REFERENCE_URL,StaleEcbReferenceError} from "./ecb-reference";
import {foreignCostBoundSchema,foreignReservationMicros,PRODUCTION_FX_MAX_AGE_MS,type ForeignCostBound} from "./fx-policy";
import {fxReferenceStatus,dynamicTariffStatus,type BillingReferenceStatus} from "./reference-status";
import {currentSpendContext} from "./context";

/** Cross-process single refresh. No provider key, paid API, private knowledge or invoice access. */
export async function refreshBillingFxReference(transport:typeof fetch=fetch,now=Date.now()){
  return transaction(async client=>{
    const lock=await client.query("select pg_try_advisory_xact_lock(hashtextextended($1,0)) as locked",[ECB_SOURCE_KEY]);
    if(!lock.rows[0].locked)return {status:"refresh-in-progress",httpCalls:0};
    const prior=await client.query<{next_attempt_at:Date}>("select next_attempt_at from billing_reference_refresh_state where source_key=$1",[ECB_SOURCE_KEY]);
    if(prior.rows[0]&&new Date(prior.rows[0].next_attempt_at).getTime()>now)return {status:"cached-refresh-state",httpCalls:0};
    const started=Date.now();let result:Awaited<ReturnType<typeof fetchEcbCnyReference>>|undefined;
    let failureClass:"staleOfficialReference"|"unavailableOrInvalidReference"="unavailableOrInvalidReference";
    try{result=await fetchEcbCnyReference(transport,now);}catch(error){
      // Only classify the known public-date condition; never store a raw response/error or secrets.
      if(error instanceof StaleEcbReferenceError)failureClass="staleOfficialReference";
    }
    const status=result?"validated":"unavailable";
    if(result)await client.query(`insert into billing_fx_reference_snapshot(source_key,source_hash,native_currency,reference_date,retrieved_at,fx)
      values($1,$2,$3,$4,$5,$6) on conflict do nothing`,[ECB_SOURCE_KEY,result.sourceHash,result.currency,result.referenceDate,result.fx.retrievedAt,JSON.stringify(result.fx)]);
    // Re-fetch before the STORED snapshot expires. A duplicate official payload is not inserted
    // again, so scheduling from this fetch time alone could leave a gap in native-price admission.
    const stored=result?await client.query<{retrieved_at:string}>(`select fx->>'retrievedAt' as retrieved_at
      from billing_fx_reference_snapshot where source_key=$1 and source_hash=$2 limit 1`,
    [ECB_SOURCE_KEY,result.sourceHash]):null;
    const storedAt=stored?.rows[0]?.retrieved_at?Date.parse(stored.rows[0].retrieved_at):result?Date.parse(result.fx.retrievedAt):null;
    const successNext=storedAt===null?null:Math.min(now+PRODUCTION_FX_MAX_AGE_MS,
      Math.max(now+60*60*1000,storedAt+PRODUCTION_FX_MAX_AGE_MS-60*60*1000));
    // Failure never deletes/refreshes the date of a previous still-valid snapshot.
    const nextAttempt=new Date(result&&successNext!==null?successNext:now+60*60*1000).toISOString();
    await client.query(`insert into billing_reference_refresh_state(source_key,checked_at,next_attempt_at,status) values($1,$2,$3,$4)
      on conflict(source_key) do update set checked_at=excluded.checked_at,next_attempt_at=excluded.next_attempt_at,status=excluded.status`,[ECB_SOURCE_KEY,new Date(now).toISOString(),nextAttempt,status]);
    await client.query("insert into billing_reference_refresh_observation(source_key,checked_at,status,metrics) values($1,$2,$3,$4)",[
      ECB_SOURCE_KEY,new Date(now).toISOString(),status,JSON.stringify({inputItems:1,generatedOutputItems:result?1:0,validOutputItems:result?1:0,
        downstreamUsedItems:result?1:0,inputBytes:0,outputBytes:result?.bytes??null,inputTokens:0,outputTokens:0,apiCredits:0,costUsd:0,
        freeHttpRequests:1,latencyMs:Date.now()-started,retries:0,utilizationEfficiency:result?1:0,
        discardedReasonCounts:result?{}:{[failureClass]:1},usageBoundary:"public-fx-reference-validated-and-stored-not-invoice-or-paid-call-adoption",
        optimizationOpportunity:"Share one weekly source snapshot; avoid per-user or per-model reference fetches"})]);
    return {status,httpCalls:1,nextAttemptAt:nextAttempt,...(!result?{failureClass}:{})};
  });
}

/** Returns a reference only. A separate approved native-cost contract is still mandatory. */
export async function readCurrentCnyFxReference(now=Date.now()):Promise<ForeignCostBound["fx"]|null>{
  const fixedVersion=currentSpendContext()?.fixedFxReferenceVersion;
  const rows=await query<{fx:unknown}>(`select fx from billing_fx_reference_snapshot where source_key=$1
    and ($2::text is null or fx->>'version'=$2) order by reference_date desc,retrieved_at desc limit 1`,
  [ECB_SOURCE_KEY,fixedVersion??null]);
  if(!rows[0])return null;
  try{
    const bound=foreignCostBoundSchema.parse({currency:"CNY",maximumNativeMicros:0,fx:rows[0].fx});
    if(bound.fx.reference!==ECB_REFERENCE_URL)return null;
    foreignReservationMicros(bound,now);return bound.fx;
  }catch{return null;}
}

/** Read-only UI observation; no refresh or inference that a payable request is allowed. */
export async function readBillingReferenceStatus(now=Date.now()):Promise<BillingReferenceStatus>{
  const base={checkedAt:new Date(now).toISOString(),rules:dynamicTariffStatus(now)};
  try {
    const rows=await query<{fx:unknown}>("select fx from billing_fx_reference_snapshot where source_key=$1 order by reference_date desc,retrieved_at desc limit 1",[ECB_SOURCE_KEY]);
    return {...base,fx:fxReferenceStatus(rows[0]?.fx,now)};
  } catch {return {...base,fx:{status:"unavailable",asOf:null,retrievedAt:null,effectiveExpiresAt:null}};}
}
