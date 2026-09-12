import nextEnv from "@next/env";
import {randomUUID,randomBytes,createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {Pool} from "pg";
import assert from "node:assert/strict";
import {databaseConnectionString,databaseSslConfiguration} from "../src/lib/rag/database-ssl";
nextEnv.loadEnvConfig(process.cwd());
const application=process.env.DATABASE_URL,migration=process.env.DATABASE_MIGRATION_URL;
if(!application||!migration)throw new Error("Both database connections required");
const a=new URL(application),m=new URL(migration);
if(a.hostname!==m.hostname||(a.port||"5432")!==(m.port||"5432")||a.pathname!==m.pathname)throw new Error("Database target mismatch");
const admin=new Pool({connectionString:databaseConnectionString(migration),ssl:databaseSslConfiguration(migration)});
const {getPool,tenantQuery}=await import("../src/lib/rag/db");
const {hashPassword}=await import("../src/lib/auth/password");
const {reservePaidCall,settlePaidCall,setSpendBudget,readSpendBudget}=await import("../src/lib/billing/repository");
const {recordVerifiedCostObservation}=await import("../src/lib/billing/reconciliation");
const {providerUsageObservation}=await import("../src/lib/billing/provider-usage");
const userId=randomUUID(),email=`billing-cost-${userId}@example.invalid`;let created=false;
const hash=(text:string)=>createHash("sha256").update(text).digest("hex");
try{
  const client=await admin.connect();
  try{
    await client.query("begin");
    await client.query(await readFile(new URL("../db/migrations/052_paid_cost_reconciliation.sql",import.meta.url),"utf8"));
    await client.query("commit");
  }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  await admin.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Cost reconciliation fixture',$3,'member','active')",[userId,email,hashPassword(randomBytes(24).toString("hex"))]);created=true;
  await setSpendBudget(userId,1000);
  const request={operationId:randomUUID(),stage:"synthetic-cost",tariffKey:"synthetic-rule",tariffVersion:"fixture-v1",maximumChargeMicros:100,requestBytes:10};
  const id=await reservePaidCall(userId,request);
  const providerId=`synthetic-provider-${randomUUID()}`;
  await settlePaidCall(userId,id,{reportedMicros:30,latencyMs:1,responseBytes:10,inputTokens:9,outputTokens:1,succeeded:true,providerUsage:providerUsageObservation({id:providerId,usage:{prompt_tokens:9,completion_tokens:1}})});
  const read=async()=>{
    const rows=await tenantQuery<{occupied:string;reserved:string;estimate:string|null;reported:string|null;invoice:string|null;settled:string|null}>(userId,`select b.occupied_micros::text as occupied,r.reserved_micros::text as reserved,r.estimated_micros::text as estimate,r.reported_micros::text as reported,r.invoice_micros::text as invoice,r.settled_micros::text as settled
      from user_spend_budget b join paid_call_reservation r on r.user_id=b.user_id where b.user_id=$1 and r.id=$2`,[userId,id]);return rows[0];
  };
  assert.equal((await read()).occupied,"100");
  const base={amountMicros:30,complete:true,sourceVersion:"synthetic-verified-v1",providerRequestHash:hash(providerId)};
  await recordVerifiedCostObservation(userId,id,{...base,kind:"usage-estimate",amountMicros:20,sourceReferenceHash:hash("estimate")});
  assert.equal((await read()).occupied,"100");
  await recordVerifiedCostObservation(userId,id,{...base,kind:"provider-report",sourceReferenceHash:hash("wrong-match"),providerRequestHash:hash("different-request")});
  assert.equal((await read()).occupied,"100");
  const report={...base,kind:"provider-report" as const,sourceReferenceHash:hash("report")};
  const releases=await Promise.all([recordVerifiedCostObservation(userId,id,report),recordVerifiedCostObservation(userId,id,report)]);
  assert.equal(releases.filter(item=>item.duplicate).length,1);
  assert.equal((await read()).occupied,"30");
  await assert.rejects(recordVerifiedCostObservation(userId,id,{...report,amountMicros:10}),/reference conflict/);
  await recordVerifiedCostObservation(userId,id,{...base,kind:"invoice",amountMicros:40,sourceReferenceHash:hash("invoice")});
  await recordVerifiedCostObservation(userId,id,{...base,kind:"provider-report",amountMicros:10,sourceReferenceHash:hash("late-report")});
  assert.deepEqual(await read(),{occupied:"40",reserved:"100",estimate:"20",reported:"10",invoice:"40",settled:"40"});
  const summary=await readSpendBudget(userId);
  assert.equal(summary.stages[0].reserved_micros,"100");
  assert.equal(summary.stages[0].occupied_micros,"40");
  assert.equal(summary.stages[0].estimated_micros,"20");
  assert.equal(summary.stages[0].invoice_micros,"40");
  assert.equal(summary.stages[0].invoice_calls,1);
  assert.equal(summary.stages[0].unreconciled_calls,0);
  const observations=await tenantQuery<{n:number}>(userId,"select count(*)::int as n from paid_cost_observation where user_id=$1 and reservation_id=$2",[userId,id]);
  assert.equal(observations[0].n,6);
  await assert.rejects(tenantQuery(userId,"update paid_cost_observation set amount_micros=0 where user_id=$1",[userId]),/permission denied/i);
  const overrun=await reservePaidCall(userId,{...request,tariffKey:"overrun-rule"});
  await settlePaidCall(userId,overrun,{reportedMicros:150,latencyMs:1,responseBytes:1,inputTokens:null,outputTokens:null,succeeded:false});
  assert.equal((await read()).occupied,"190");
  await assert.rejects(reservePaidCall(userId,{...request,tariffKey:"overrun-rule"}),/tariff-suspended/);
  await reservePaidCall(userId,{...request,tariffKey:"unaffected-rule"});
  console.log(JSON.stringify({migration:"052",estimateRetained:true,ambiguousMatchRetained:true,concurrentReleaseOnce:true,invoicePriority:true,appendOnlyHistory:true,overrunRuleOnly:true,originalReservationPreserved:true,realProviderCalls:0,actualModelCostUsd:0,fixturesOnly:true}));
}finally{
  if(created){
    const client=await admin.connect();
    try{
      await client.query("begin");
      const owner=await client.query("select id from app_user where id=$1 and email=$2 for update",[userId,email]);
      if(owner.rowCount!==1)throw new Error("Fixture mismatch; refusing cleanup");
      await client.query("delete from paid_cost_observation where user_id=$1",[userId]);
      await client.query("delete from paid_rule_hold where user_id=$1",[userId]);
      await client.query("delete from paid_call_reservation where user_id=$1",[userId]);
      await client.query("delete from spend_budget_change where user_id=$1",[userId]);
      await client.query("delete from user_spend_budget where user_id=$1",[userId]);
      await client.query("delete from app_user where id=$1",[userId]);
      await client.query("commit");console.log("Synthetic cost fixture removed; no customer charges changed.");
    }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  }
  await admin.end();await getPool().end();
}
