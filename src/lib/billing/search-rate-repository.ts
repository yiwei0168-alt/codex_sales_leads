import {transaction,query} from "@/lib/rag/db";
import {SEARCH_RATE_SOURCES,fetchSearchRateEvidence} from "./search-rate-reference";

const refreshLock="brave-tavily-public-search-pricing-v1";

/** Daily public checks are independent; failure of one source cannot validate the other. */
export async function refreshSearchRateEvidence(transport:typeof fetch=fetch,now=Date.now()){
  return transaction(async client=>{
    const lock=await client.query<{locked:boolean}>(
      "select pg_try_advisory_xact_lock(hashtextextended($1,0)) as locked",[refreshLock]);
    if(!lock.rows[0]?.locked)return {status:"refresh-in-progress" as const,httpCalls:0,states:[]};
    const rows=await client.query<{source_key:string;next_attempt_at:Date;hold:boolean}>(
      "select source_key,next_attempt_at,hold from billing_tariff_refresh_state where source_key=any($1::text[])",
      [SEARCH_RATE_SOURCES.map(item=>item.sourceKey)]);
    const previous=new Map(rows.rows.map(row=>[row.source_key,row]));
    const due=SEARCH_RATE_SOURCES.filter(source=>{
      const row=previous.get(source.sourceKey);
      return !row||new Date(row.next_attempt_at).getTime()<=now;
    });
    if(!due.length)return {status:"cached-refresh-state" as const,httpCalls:0,states:[]};
    const states=[];let httpCalls=0;
    for(const source of due){
      const started=Date.now();let sourceCalls=0;
      const countedFetch:typeof fetch=(input,init)=>{sourceCalls++;httpCalls++;return transport(input,init);};
      let evidence:Awaited<ReturnType<typeof fetchSearchRateEvidence>>|undefined;
      try{evidence=await fetchSearchRateEvidence(source,countedFetch);}catch{/* Keep transport details out of the public ledger. */}
      const prior=previous.get(source.sourceKey);
      const hold=Boolean(prior?.hold||evidence?.status==="review-required");
      const status=!evidence?"unavailable" as const:hold?"review-required" as const:"validated" as const;
      const validOutputItems=evidence?.status==="validated"?1:0;
      const downstreamUsedItems=validOutputItems&&!hold?1:0;
      if(evidence)await client.query(`insert into billing_tariff_evidence_snapshot(source_key,source_hash,tariff_key,observed_at,evidence)
        values($1,$2,$3,$4,$5) on conflict do nothing`,[
        source.sourceKey,evidence.sourceHash,source.tariffKey,new Date(now).toISOString(),JSON.stringify(evidence.evidence)]);
      const nextAttemptAt=new Date(now+(evidence?24:1)*60*60*1000).toISOString();
      await client.query(`insert into billing_tariff_refresh_state(source_key,tariff_key,checked_at,next_attempt_at,status,hold)
        values($1,$2,$3,$4,$5,$6) on conflict(source_key) do update set
        checked_at=excluded.checked_at,next_attempt_at=excluded.next_attempt_at,status=excluded.status,hold=excluded.hold`,[
        source.sourceKey,source.tariffKey,new Date(now).toISOString(),nextAttemptAt,status,hold]);
      await client.query(`insert into billing_tariff_refresh_observation(source_key,checked_at,status,metrics) values($1,$2,$3,$4)`,[
        source.sourceKey,new Date(now).toISOString(),status,JSON.stringify({inputItems:1,
          generatedOutputItems:evidence?1:0,validOutputItems,
          downstreamUsedItems,inputBytes:0,outputBytes:evidence?.bytes??null,
          inputTokens:0,outputTokens:0,apiCredits:0,costUsd:0,freeHttpRequests:sourceCalls,
          latencyMs:Date.now()-started,retries:0,
          utilizationEfficiency:downstreamUsedItems,
          discardedReasonCounts:!evidence?{publicRateEvidenceUnavailable:1}
            :evidence.status==="review-required"?{publicSearchTariffChangedOrUnverifiable:1}
            :hold?{priorTariffHoldAwaitingReview:1}:{},
          usageBoundary:"public-search-rate-review-only-not-tariff-admission-or-payment",
          optimizationOpportunity:"Refresh each public Search price once per day and hold drift before reservation"})]);
      states.push({sourceKey:source.sourceKey,status,hold,nextAttemptAt});
    }
    return {status:"checked" as const,httpCalls,states};
  });
}

export async function readSearchRateStatuses(){
  const rows=await query<{source_key:string;checked_at:Date;next_attempt_at:Date;status:string;hold:boolean}>(
    "select source_key,checked_at,next_attempt_at,status,hold from billing_tariff_refresh_state where source_key=any($1::text[])",
    [SEARCH_RATE_SOURCES.map(item=>item.sourceKey)]);
  const byKey=new Map(rows.map(row=>[row.source_key,row]));
  return SEARCH_RATE_SOURCES.map(source=>{
    const row=byKey.get(source.sourceKey);
    return {sourceKey:source.sourceKey,tariffKey:source.tariffKey,
      checkedAt:row?new Date(row.checked_at).toISOString():null,
      nextAttemptAt:row?new Date(row.next_attempt_at).toISOString():null,
      status:row?.status??"missing",hold:row?.hold??null};
  });
}
