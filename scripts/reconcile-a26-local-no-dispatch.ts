import nextEnv from "@next/env";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";

nextEnv.loadEnvConfig(process.cwd());
const {tenantTransaction,getPool}=await import("../src/lib/rag/db");
const {readSpendBudget}=await import("../src/lib/billing/repository");
const userId="cbee9803-3c43-4609-9228-66086b207012";
const operationId="local-a26-read-only-preview";
const amount=10_622_880;
const apply=process.argv.includes("--apply");
try{
  const result=await tenantTransaction(userId,async client=>{
    const identity=await client.query<{safe:boolean}>(`select (email='model-acceptance-20260912@fixture.invalid'
      and status='disabled' and password_hash is null) as safe from app_user where id=$1`,[userId]);
    assert.equal(identity.rows[0]?.safe,true);
    const budget=await client.query<{occupied_micros:string;limit_micros:string}>(
      "select occupied_micros::text,limit_micros::text from user_spend_budget where user_id=$1 for update",[userId]);
    assert.equal(budget.rows[0]?.limit_micros,"50000000");
    const rows=await client.query<{id:string;reserved_micros:string;status:string;reported_micros:string|null;
      settled_micros:string|null;occupied_micros:string|null;provider_request_hash:string|null;metrics:Record<string,unknown>}>(
      `select id,reserved_micros::text,status,reported_micros::text,settled_micros::text,
        occupied_micros::text,provider_request_hash,metrics from paid_call_reservation
        where user_id=$1 and operation_id=$2 for update`,[userId,operationId]);
    assert.equal(rows.rows.length,1,"Only the known local synthetic capture may be reconciled");
    const row=rows.rows[0];
    assert.equal(row.reserved_micros,String(amount));
    assert.equal(row.status,"unknown");
    assert.equal(row.reported_micros,null);
    assert.equal(row.provider_request_hash,null);
    assert.equal(row.metrics.validOutputItems,0);
    assert.equal(row.metrics.outputBytes,null);
    const prior=await client.query<{kind:string}>(
      "select kind from paid_cost_observation where user_id=$1 and reservation_id=$2 order by created_at",
      [userId,row.id]);
    assert.ok(prior.rows.every(item=>item.kind==="provider-report"));
    if(row.settled_micros==="0"&&row.occupied_micros==="0")return {status:"already-reconciled",reservationId:row.id};
    assert.equal(row.settled_micros,null);
    assert.ok(row.occupied_micros===null||row.occupied_micros===String(amount));
    assert.ok(BigInt(budget.rows[0].occupied_micros)>=BigInt(amount));
    if(!apply)return {status:"review-only",reservationId:row.id,occupiedUsd:Number(budget.rows[0].occupied_micros)/1e6};
    // The preview installed a synthetic global fetch which captured the SDK request and threw
    // before network dispatch. This one operation has one exact reservation and zero response.
    const sourceReferenceHash=createHash("sha256").update(`a26-local-no-dispatch:${operationId}:${row.id}`).digest("hex");
    await client.query(`insert into paid_cost_observation(user_id,reservation_id,kind,amount_micros,
      source_reference_hash,source_version,complete,uniquely_matched,provider_request_hash,
      occupied_before,occupied_after,metrics) values($1,$2,'verified-unbilled',0,$3,
      'a26-local-synthetic-transport-v1',true,true,null,$4,0,$5)`,
      [userId,row.id,sourceReferenceHash,amount,JSON.stringify({inputItems:1,validOutputItems:1,
        downstreamUsedItems:1,inputTokens:0,outputTokens:0,apiCredits:0,costUsd:0,retries:0,
        discardedReasonCounts:{syntheticPreviewAccidentalReservation:1},utilizationEfficiency:1,
        usageBoundary:"one-off-local-transport-proven-not-dispatched",optimizationOpportunity:
          "Keep synthetic wire capture outside the paid spend context"})]);
    await client.query(`update paid_call_reservation set settled_micros=0,settled_source='verified-unbilled',
      occupied_micros=0,updated_at=now() where user_id=$1 and id=$2`,[userId,row.id]);
    await client.query("update user_spend_budget set occupied_micros=occupied_micros-$2,updated_at=now() where user_id=$1",
      [userId,amount]);
    return {status:"reconciled-proven-no-dispatch",reservationId:row.id,releasedUsd:amount/1e6};
  });
  const after=await readSpendBudget(userId);
  console.log(JSON.stringify({...result,limitUsd:Number(after.budget?.limit_micros)/1e6,
    occupiedUsd:Number(after.budget?.occupied_micros)/1e6,newProviderCalls:0}));
}finally{await getPool().end();}
