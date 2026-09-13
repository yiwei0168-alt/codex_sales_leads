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
const {getPool,tenantQuery,tenantTransaction}=await import("../src/lib/rag/db");
const {completeTaskCostAllocation}=await import("../src/lib/billing/task-cost-completion");
const {readCompanyCosts}=await import("../src/lib/billing/company-cost-repository");
const {hashPassword}=await import("../src/lib/auth/password");
const {reservePaidCall,settlePaidCall,setSpendBudget,readSpendBudget,assertProcessingRecoveryCostsKnown}=await import("../src/lib/billing/repository");
const {recordVerifiedCostObservation}=await import("../src/lib/billing/reconciliation");
const {providerUsageObservation}=await import("../src/lib/billing/provider-usage");
const {budgetedFetch}=await import("../src/lib/billing/paid-fetch");
const {withSpendContext}=await import("../src/lib/billing/context");
const {openRouterInlineCostReport}=await import("../src/lib/billing/openrouter-cost-report");
const userId=randomUUID(),email=`billing-cost-${userId}@example.invalid`;let created=false;
const hash=(text:string)=>createHash("sha256").update(text).digest("hex");
try{
  if(!process.argv.includes("--skip-migration")){
  const client=await admin.connect();
  try{
    await client.query("begin");
    await client.query(await readFile(new URL("../db/migrations/052_paid_cost_reconciliation.sql",import.meta.url),"utf8"));
    await client.query("commit");
  }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  }
  await admin.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Cost reconciliation fixture',$3,'member','active')",[userId,email,hashPassword(randomBytes(24).toString("hex"))]);created=true;
  await setSpendBudget(userId,1000);
  const request={operationId:randomUUID(),stage:"synthetic-cost",tariffKey:"synthetic-rule",tariffVersion:"fixture-v1",maximumChargeMicros:100,requestBytes:10,
    costAttribution:{version:"company-cost-attribution-v1" as const,kind:"company-inputs" as const,companyKeys:[hash("company-one"),hash("company-two")].sort(),roundKey:hash("round-one")}};
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
  const allocations=await tenantQuery<{kind:string;amount_micros:string;occupied_before:string;occupied_after:string;metrics:{costAllocation:{observation:{basis:string;sourceAmountMicros:number;shares:Array<{companyKey:string;amountMicros:number}>;additionalSpendMicros:number};occupiedBefore:{sourceAmountMicros:number};occupiedAfter:{sourceAmountMicros:number}}}}>(userId,"select kind,amount_micros::text,occupied_before::text,occupied_after::text,metrics from paid_cost_observation where user_id=$1 and reservation_id=$2",[userId,id]);
  assert.equal(allocations.length,6);
  for(const record of allocations){
    const allocation=record.metrics.costAllocation;
    assert.equal(allocation.observation.basis,record.kind==="usage-estimate"?"estimate":record.kind);
    assert.equal(allocation.observation.sourceAmountMicros,Number(record.amount_micros));
    assert.equal(allocation.observation.shares.reduce((sum,row)=>sum+row.amountMicros,0),Number(record.amount_micros));
    assert.deepEqual(allocation.observation.shares.map(row=>row.companyKey),request.costAttribution.companyKeys);
    assert.equal(allocation.observation.additionalSpendMicros,0);
    assert.equal(allocation.occupiedBefore.sourceAmountMicros,Number(record.occupied_before));
    assert.equal(allocation.occupiedAfter.sourceAmountMicros,Number(record.occupied_after));
  }
  await assert.rejects(tenantQuery(userId,"update paid_cost_observation set amount_micros=0 where user_id=$1",[userId]),/permission denied/i);
  const overrun=await reservePaidCall(userId,{...request,tariffKey:"overrun-rule"});
  await settlePaidCall(userId,overrun,{reportedMicros:150,latencyMs:1,responseBytes:1,inputTokens:null,outputTokens:null,succeeded:false});
  assert.equal((await read()).occupied,"190");
  await assert.rejects(reservePaidCall(userId,{...request,tariffKey:"overrun-rule"}),/tariff-suspended/);
  await reservePaidCall(userId,{...request,tariffKey:"unaffected-rule"});
  // Actual production fetch -> settlement -> trusted adapter -> SQL, with an
  // injected in-memory response. This transport cannot make a provider request.
  const operationId=randomUUID();
  const wire={model:"openai/synthetic",max_completion_tokens:10,messages:[{role:"user",content:"synthetic"}]};
  const body={id:`gen-${randomUUID()}`,model:wire.model,object:"chat.completion",choices:[{finish_reason:"stop"}],
    usage:{cost:0.000007,is_byok:false,prompt_tokens:2,completion_tokens:1,total_tokens:3}};
  let syntheticTransportCalls=0;
  const transport:typeof fetch=async()=>{syntheticTransportCalls++;return Response.json(body);};
  const bound={key:"synthetic-openrouter-report",origin:"https://openrouter.ai",pathname:"/api/v1/chat/completions",model:wire.model,
    maximumChargeMicros:100,maximumRequestBytes:4096,maximumOutputTokens:10,
    boundDescription:"Synthetic transport only, never a real provider tariff or authorization.",reference:"https://openrouter.ai/docs/cookbook/administration/usage-accounting",
    verifiedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()};
  const scope={userId,operationId,stage:"synthetic-openrouter-inline-report",tariffPolicy:{version:"synthetic-inline-v1",rules:[bound]},costAttribution:request.costAttribution};
  await withSpendContext(scope,()=>budgetedFetch(transport)(`${bound.origin}${bound.pathname}`,{method:"POST",body:JSON.stringify(wire)}));
  assert.equal(syntheticTransportCalls,1);
  const inline=await tenantQuery<{id:string;occupied:string;settled_source:string}>(userId,
    "select id,occupied_micros::text as occupied,settled_source from paid_call_reservation where user_id=$1 and operation_id=$2",[userId,operationId]);
  assert.equal(inline.length,1);assert.equal(inline[0].occupied,"7");assert.equal(inline[0].settled_source,"provider-report");
  const trusted=openRouterInlineCostReport({url:new URL(`${bound.origin}${bound.pathname}`),method:"POST",httpStatus:200,request:wire,response:body});
  assert.ok(trusted);
  assert.equal((await recordVerifiedCostObservation(userId,inline[0].id,trusted)).duplicate,true);
  const inlineObservations=await tenantQuery<{complete:boolean;uniquely_matched:boolean;amount:string}>(userId,
    "select complete,uniquely_matched,amount_micros::text as amount from paid_cost_observation where user_id=$1 and reservation_id=$2 order by complete",[userId,inline[0].id]);
  assert.deepEqual(inlineObservations,[{complete:false,uniquely_matched:false,amount:"7"},{complete:true,uniquely_matched:true,amount:"7"}]);
  const duplicateId=await reservePaidCall(userId,{...request,operationId:randomUUID(),tariffKey:bound.key});
  await settlePaidCall(userId,duplicateId,{reportedMicros:7,latencyMs:0,responseBytes:1,inputTokens:2,outputTokens:1,succeeded:true,providerUsage:providerUsageObservation(body)});
  const unmatched=await recordVerifiedCostObservation(userId,duplicateId,trusted);
  assert.equal(unmatched.releasedMicros,0);
  await assert.rejects(recordVerifiedCostObservation(randomUUID(),inline[0].id,trusted),/Budget owner missing/);
  const unknownOperation=randomUUID();
  await withSpendContext({...scope,operationId:unknownOperation},()=>budgetedFetch(async()=>Response.json({...body,id:`gen-${randomUUID()}`,
    usage:{...body.usage,is_byok:true}}))(`${bound.origin}${bound.pathname}`,{method:"POST",body:JSON.stringify(wire)}));
  const retained=await tenantQuery<{occupied:string}>(userId,"select occupied_micros::text as occupied from paid_call_reservation where user_id=$1 and operation_id=$2",[userId,unknownOperation]);
  assert.equal(retained[0].occupied,null); // null => full original reservation, not zero
  console.log(JSON.stringify({inlineReportAdapterToSql:true,perRequestByokRequired:true,duplicateGenerationRetained:true,
    duplicateReportIdempotent:true,unmatchedOwnerRejected:true,realProviderCalls:0}));
  const recoveryOperation=randomUUID();
  const recoveryRequest={...request,operationId:recoveryOperation,stage:"synthetic-recovery",requestFingerprint:hash("recovery-request")};
  const recoveryId=await reservePaidCall(userId,recoveryRequest);
  await assert.rejects(assertProcessingRecoveryCostsKnown(userId,recoveryOperation),/paid-request-already-recorded/);
  const recoveryProviderId=`synthetic-recovery-${randomUUID()}`;
  await settlePaidCall(userId,recoveryId,{reportedMicros:null,latencyMs:0,responseBytes:1,inputTokens:1,outputTokens:0,
    succeeded:false,providerUsage:providerUsageObservation({id:recoveryProviderId})});
  await assert.rejects(assertProcessingRecoveryCostsKnown(userId,recoveryOperation),/paid-request-already-recorded/);
  await assert.rejects(reservePaidCall(userId,recoveryRequest),/paid-request-already-recorded/);
  await recordVerifiedCostObservation(userId,recoveryId,{kind:"provider-report",amountMicros:3,complete:true,
    sourceVersion:"synthetic-recovery-v1",sourceReferenceHash:hash(recoveryProviderId),providerRequestHash:hash(recoveryProviderId)});
  await assertProcessingRecoveryCostsKnown(userId,recoveryOperation);
  const retryId=await reservePaidCall(userId,recoveryRequest);
  assert.notEqual(retryId,recoveryId);
  await settlePaidCall(userId,retryId,{reportedMicros:3,latencyMs:0,responseBytes:1,inputTokens:1,outputTokens:1,succeeded:true});
  await assert.rejects(reservePaidCall(userId,recoveryRequest),/paid-request-already-recorded/);
  const sharedOperation=randomUUID(),sharedRound=hash("shared-round"),sharedProvider=randomUUID();
  const sharedId=await reservePaidCall(userId,{...request,operationId:sharedOperation,tariffKey:"shared-fixture",
    maximumChargeMicros:11,costAttribution:{version:"company-cost-attribution-v1",kind:"task-shared",
      roundKey:sharedRound,companyKeys:[]}});
  await settlePaidCall(userId,sharedId,{reportedMicros:null,latencyMs:0,responseBytes:1,inputTokens:0,outputTokens:0,
    succeeded:true,providerUsage:providerUsageObservation({id:sharedProvider})});
  const population=[hash("rejected-company"),hash("qualified-company")].sort();
  await tenantTransaction(userId,client=>completeTaskCostAllocation(client,userId,sharedOperation,sharedRound,population));
  await tenantTransaction(userId,client=>completeTaskCostAllocation(client,userId,sharedOperation,sharedRound,[...population].reverse()));
  await assert.rejects(tenantTransaction(userId,client=>completeTaskCostAllocation(client,userId,sharedOperation,sharedRound,[population[0]])),/population changed/);
  const sharedRows=await tenantQuery<{reserved_micros:string;settled_micros:string|null;metrics:Record<string,unknown>}>(userId,
    "select reserved_micros::text,settled_micros::text,metrics from paid_call_reservation where user_id=$1 and id=$2",[userId,sharedId]);
  assert.equal(sharedRows[0].reserved_micros,"11");assert.equal(sharedRows[0].settled_micros,null);
  assert.deepEqual((sharedRows[0].metrics.completedReservationAllocation as {shares:unknown}).shares,
    [{companyKey:population[0],amountMicros:6},{companyKey:population[1],amountMicros:5}]);
  await recordVerifiedCostObservation(userId,sharedId,{kind:"invoice",amountMicros:7,complete:true,
    sourceVersion:"synthetic-shared-v1",sourceReferenceHash:hash("shared-invoice"),providerRequestHash:hash(sharedProvider)});
  const late=await tenantQuery<{metrics:{costAllocation:{observation:{shares:unknown}}}}>(userId,
    "select metrics from paid_cost_observation where user_id=$1 and reservation_id=$2 and kind='invoice'",[userId,sharedId]);
  assert.deepEqual(late[0].metrics.costAllocation.observation.shares,
    [{companyKey:population[0],amountMicros:4},{companyKey:population[1],amountMicros:3}]);
  const companyCosts=await readCompanyCosts(userId,sharedOperation);
  assert.equal(companyCosts.length,2);
  assert.equal(companyCosts.reduce((sum,row)=>sum+(row.costs.reservation.amountMicros??0),0),11);
  assert.equal(companyCosts.reduce((sum,row)=>sum+(row.costs.invoice.amountMicros??0),0),7);
  assert.equal(companyCosts.reduce((sum,row)=>sum+(row.costs.occupied.amountMicros??0),0),7);
  assert(companyCosts.every(row=>row.costs.estimate.amountMicros===null));
  assert.deepEqual(await readCompanyCosts(userId,sharedOperation),companyCosts);
  assert.deepEqual(await readCompanyCosts(userId,randomUUID()),[]);
  assert.deepEqual(await readCompanyCosts(randomUUID(),sharedOperation),[]);
  console.log(JSON.stringify({companyCostProjectionConserved:true,companyCostRefreshReadOnly:true,companyCostOwnerAndOperationIsolated:true}));
  console.log(JSON.stringify({sharedCompletionConserved:true,sharedPopulationImmutable:true,lateInvoiceUsesCompletedPopulation:true,sharedUnknownRetained:true,realProviderCalls:0}));
  console.log(JSON.stringify({unknownRecoveryBlocked:true,verifiedFailedRequestRecoveryAllowed:true,
    completedRequestReplayBlocked:true,recoveryCostHistoryPreserved:true,realProviderCalls:0}));
  console.log(JSON.stringify({migration:"052",estimateRetained:true,ambiguousMatchRetained:true,concurrentReleaseOnce:true,invoicePriority:true,appendOnlyHistory:true,overrunRuleOnly:true,originalReservationPreserved:true,separateCostBasisAllocationConserved:true,storedCompanyAttributionPreserved:true,realProviderCalls:0,actualModelCostUsd:0,fixturesOnly:true}));
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
