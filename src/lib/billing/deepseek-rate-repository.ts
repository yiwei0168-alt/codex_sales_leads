import {transaction,query} from "@/lib/rag/db";
import {DEEPSEEK_RATE_SOURCES,fetchDeepSeekRateEvidence} from "./deepseek-rate-reference";

const refreshLock="deepseek-official-pricing-v1";

/** One official public GET reviews both static rules without admitting or extending either tariff. */
export async function refreshDeepSeekRateEvidence(transport:typeof fetch=fetch,now=Date.now()){
  return transaction(async client=>{
    const lock=await client.query<{locked:boolean}>(
      "select pg_try_advisory_xact_lock(hashtextextended($1,0)) as locked",[refreshLock]);
    if(!lock.rows[0]?.locked)return {status:"refresh-in-progress" as const,httpCalls:0,states:[]};
    const rows=await client.query<{source_key:string;next_attempt_at:Date;hold:boolean}>(
      "select source_key,next_attempt_at,hold from billing_tariff_refresh_state where source_key=any($1::text[])",
      [DEEPSEEK_RATE_SOURCES.map(item=>item.sourceKey)]);
    const previous=new Map(rows.rows.map(row=>[row.source_key,row]));
    const due=DEEPSEEK_RATE_SOURCES.filter(source=>{
      const row=previous.get(source.sourceKey);
      return !row||new Date(row.next_attempt_at).getTime()<=now;
    });
    if(!due.length)return {status:"cached-refresh-state" as const,httpCalls:0,states:[]};
    const started=Date.now();let httpCalls=0;
    const countedFetch:typeof fetch=(input,init)=>{httpCalls++;return transport(input,init);};
    let fetched:Awaited<ReturnType<typeof fetchDeepSeekRateEvidence>>|undefined;
    try{fetched=await fetchDeepSeekRateEvidence(countedFetch);}catch{/* Transport detail is not logged. */}
    const states=[];
    for(const [index,source] of due.entries()){
      const evidence=fetched?.items.find(item=>item.sourceKey===source.sourceKey);
      const prior=previous.get(source.sourceKey);
      const hold=Boolean(prior?.hold||(fetched&&!evidence)||evidence?.status==="review-required");
      const status=!fetched?"unavailable" as const:hold?"review-required" as const:"validated" as const;
      if(evidence)await client.query(`insert into billing_tariff_evidence_snapshot(source_key,source_hash,tariff_key,observed_at,evidence)
        values($1,$2,$3,$4,$5) on conflict do nothing`,[
        source.sourceKey,fetched!.sourceHash,source.tariffKey,new Date(now).toISOString(),JSON.stringify(evidence.evidence)]);
      const nextAttemptAt=new Date(now+(fetched?24:1)*60*60*1000).toISOString();
      await client.query(`insert into billing_tariff_refresh_state(source_key,tariff_key,checked_at,next_attempt_at,status,hold)
        values($1,$2,$3,$4,$5,$6) on conflict(source_key) do update set
        checked_at=excluded.checked_at,next_attempt_at=excluded.next_attempt_at,status=excluded.status,hold=excluded.hold`,[
        source.sourceKey,source.tariffKey,new Date(now).toISOString(),nextAttemptAt,status,hold]);
      await client.query(`insert into billing_tariff_refresh_observation(source_key,checked_at,status,metrics) values($1,$2,$3,$4)`,[
        source.sourceKey,new Date(now).toISOString(),status,JSON.stringify({inputItems:1,
          generatedOutputItems:evidence?1:0,validOutputItems:evidence?1:0,downstreamUsedItems:evidence?1:0,
          inputBytes:0,outputBytes:index===0?fetched?.bytes??null:0,inputTokens:0,outputTokens:0,apiCredits:0,costUsd:0,
          freeHttpRequests:index===0?httpCalls:0,sharedPageReuse:index>0,
          latencyMs:index===0?Date.now()-started:0,retries:0,
          utilizationEfficiency:evidence?1:0,discardedReasonCounts:evidence?{}:{publicRateEvidenceUnavailable:1},
          usageBoundary:"public-rate-review-only-not-tariff-admission-or-payment",
          optimizationOpportunity:"Share one DeepSeek pricing-page read across both models; hold contract drift before new reservation"})]);
      states.push({sourceKey:source.sourceKey,status,hold,nextAttemptAt});
    }
    return {status:"checked" as const,httpCalls,states};
  });
}

/** Public rate status only; budget UI may display missing as unknown. */
export async function readDeepSeekRateStatuses(){
  const rows=await query<{source_key:string;checked_at:Date;next_attempt_at:Date;status:string;hold:boolean}>(
    "select source_key,checked_at,next_attempt_at,status,hold from billing_tariff_refresh_state where source_key=any($1::text[])",
    [DEEPSEEK_RATE_SOURCES.map(item=>item.sourceKey)]);
  const byKey=new Map(rows.map(row=>[row.source_key,row]));
  return DEEPSEEK_RATE_SOURCES.map(source=>{
    const row=byKey.get(source.sourceKey);
    return {sourceKey:source.sourceKey,tariffKey:source.tariffKey,
      checkedAt:row?new Date(row.checked_at).toISOString():null,
      nextAttemptAt:row?new Date(row.next_attempt_at).toISOString():null,
      status:row?.status??"missing",hold:row?.hold??null};
  });
}
