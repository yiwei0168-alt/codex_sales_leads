import {tenantTransaction} from "@/lib/rag/db";
import {planCostReconciliation,type CostObservationKind} from "./reconciliation-policy";

interface VerifiedObservationInput {
  kind:CostObservationKind;
  amountMicros:number|null;
  complete:boolean;
  sourceReferenceHash:string;
  sourceVersion:string;
  providerRequestHash?:string;
}
/** Internal trusted-adapter boundary; do NOT expose complete/source claims directly to an HTTP client or model.
 * Matching is verified against the stored request and must be unique within its provider tariff.
 * This accepts already-converted micro-USD only; FX/source verification belongs to the admitted adapter.
 */
export async function recordVerifiedCostObservation(userId:string,reservationId:string,input:VerifiedObservationInput){
  const started=Date.now();
  if(!/^[a-f0-9]{64}$/.test(input.sourceReferenceHash)||!/^[-a-zA-Z0-9_.:/]{1,200}$/.test(input.sourceVersion)
    ||(input.providerRequestHash!==undefined&&!/^[a-f0-9]{64}$/.test(input.providerRequestHash)))throw new Error("Invalid observation provenance");
  if(!["usage-estimate","provider-report","invoice","verified-unbilled"].includes(input.kind))throw new Error("Invalid observation kind");
  return tenantTransaction(userId,async client=>{
    const budget=await client.query("select user_id from user_spend_budget where user_id=$1 for update",[userId]);
    if(!budget.rows.length)throw new Error("Budget owner missing");
    const rows=await client.query<{reserved_micros:string;occupied_micros:string|null;settled_micros:string|null;settled_source:CostObservationKind|null;provider_request_hash:string|null;tariff_key:string;tariff_version:string}>(
      "select reserved_micros::text,occupied_micros::text,settled_micros::text,settled_source,provider_request_hash,tariff_key,tariff_version from paid_call_reservation where user_id=$1 and id=$2 for update",[userId,reservationId]);
    const row=rows.rows[0];if(!row)throw new Error("Reservation not owned or missing");
    const previous=await client.query<{amount_micros:string|null;source_version:string;complete:boolean;provider_request_hash:string|null}>("select amount_micros::text,source_version,complete,provider_request_hash from paid_cost_observation where user_id=$1 and reservation_id=$2 and kind=$3 and source_reference_hash=$4",[userId,reservationId,input.kind,input.sourceReferenceHash]);
    if(previous.rows.length){
      const old=previous.rows[0];
      if(old.amount_micros!==(input.amountMicros===null?null:String(input.amountMicros))||old.source_version!==input.sourceVersion||old.complete!==input.complete||old.provider_request_hash!==(input.providerRequestHash??null))throw new Error("Observation reference conflict; append a distinct verified correction");
      return {duplicate:true,releasedMicros:0};
    }
    let uniquelyMatched=false;
    if(input.providerRequestHash&&input.providerRequestHash===row.provider_request_hash){
      const match=await client.query<{n:number}>("select count(*)::int as n from paid_call_reservation where user_id=$1 and tariff_key=$2 and provider_request_hash=$3",[userId,row.tariff_key,input.providerRequestHash]);
      uniquelyMatched=match.rows[0].n===1;
    }
    const plan=planCostReconciliation({reservedMicros:Number(row.reserved_micros),occupiedMicros:row.occupied_micros===null?undefined:Number(row.occupied_micros),settledMicros:row.settled_micros===null?null:Number(row.settled_micros),settledSource:row.settled_source},{kind:input.kind,amountMicros:input.amountMicros,complete:input.complete,uniquelyMatched});
    await client.query(`insert into paid_cost_observation(user_id,reservation_id,kind,amount_micros,source_reference_hash,source_version,complete,uniquely_matched,provider_request_hash,occupied_before,occupied_after,metrics)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[userId,reservationId,input.kind,input.amountMicros,input.sourceReferenceHash,input.sourceVersion,input.complete,uniquelyMatched,input.providerRequestHash??null,plan.occupiedBefore,plan.occupiedAfter,JSON.stringify({inputItems:1,validOutputItems:1,downstreamUsedItems:plan.canSettle?1:0,inputTokens:0,outputTokens:0,apiCredits:0,costUsd:0,latencyMs:Date.now()-started,retries:0,utilizationEfficiency:plan.canSettle?1:0,discardedReasonCounts:plan.canSettle?{}:{retainedWithoutSettlement:1},usageBoundary:"verified-cost-observation-not-new-spend",optimizationOpportunity:"Match complete provider statements before releasing unused reservations"})]);
    await client.query(`update paid_call_reservation set
      estimated_micros=case when $3='usage-estimate' then $4::bigint else estimated_micros end,
      reported_micros=case when $3='provider-report' then $4::bigint else reported_micros end,
      invoice_micros=case when $3='invoice' and $8 then $4::bigint else invoice_micros end,
      settled_micros=$5,settled_source=$6,occupied_micros=$7,updated_at=now() where user_id=$1 and id=$2`,
      [userId,reservationId,input.kind,input.amountMicros,plan.settledMicros,plan.settledSource,plan.occupiedAfter,plan.canSettle]);
    if(plan.occupiedDelta!==0)await client.query("update user_spend_budget set occupied_micros=occupied_micros+$2,updated_at=now() where user_id=$1",[userId,plan.occupiedDelta]);
    if(plan.suspendRule)await client.query("insert into paid_rule_hold(user_id,tariff_key,tariff_version,reason) values($1,$2,$3,'reported-charge-above-bound') on conflict do nothing",[userId,row.tariff_key,row.tariff_version]);
    return {duplicate:false,...plan};
  });
}
