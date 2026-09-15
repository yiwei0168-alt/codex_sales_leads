import nextEnv from "@next/env";
import {randomUUID,randomBytes} from "node:crypto";
import {readFile} from "node:fs/promises";
import {Pool} from "pg";
import assert from "node:assert/strict";
import {databaseConnectionString,databaseSslConfiguration} from "../src/lib/rag/database-ssl";

nextEnv.loadEnvConfig(process.cwd());
const application=process.env.DATABASE_URL,migration=process.env.DATABASE_MIGRATION_URL;
if(!application||!migration)throw new Error("Both application and migration connections are required");
const appTarget=new URL(application),migrationTarget=new URL(migration);
if(appTarget.hostname!==migrationTarget.hostname||(appTarget.port||"5432")!==(migrationTarget.port||"5432")||appTarget.pathname!==migrationTarget.pathname)throw new Error("Migration target mismatch");
const admin=new Pool({connectionString:databaseConnectionString(migration),ssl:databaseSslConfiguration(migration)});
const {getPool,tenantQuery}=await import("../src/lib/rag/db");
const {hashPassword}=await import("../src/lib/auth/password");
const {reservePaidCall,settlePaidCall,setSpendBudget}=await import("../src/lib/billing/repository");
const {providerUsageObservation}=await import("../src/lib/billing/provider-usage");
const {readProviderUsageSummary}=await import("../src/lib/billing/usage-summary");
const created:string[]=[];
try{
  // This is the only migration applied; no historical migrations or customer-state rewrites.
  const ddl=await readFile(new URL("../db/migrations/051_paid_request_replay_guard.sql",import.meta.url),"utf8");
  const ddlClient=await admin.connect();
  try{await ddlClient.query("begin");await ddlClient.query(ddl);await ddlClient.query("commit");}
  catch(error){await ddlClient.query("rollback");throw error;}finally{ddlClient.release();}
  for(let i=0;i<2;i++){
    const id=randomUUID();
    await admin.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Billing replay fixture',$3,'member','active')",[id,`billing-replay-${id}@example.invalid`,hashPassword(randomBytes(24).toString("hex"))]);
    created.push(id);await setSpendBudget(id,100);
  }
  const input={operationId:randomUUID(),stage:"synthetic-replay-verification",tariffKey:"synthetic-no-provider",tariffVersion:"fixture-v1",maximumChargeMicros:10,requestBytes:10,requestFingerprint:"a".repeat(64),
    modelAttempt:{invocationId:"synthetic-invocation",provider:"synthetic",task:"synthetic-score",promptVersion:"synthetic-v1",scoringVersion:"synthetic-policy-v1",attempt:1,requestedModel:"synthetic-model",gatewayHost:"api.deepseek.com",endpointKind:"chat-completions"},
    costAttribution:{version:"company-cost-attribution-v1" as const,kind:"company-inputs" as const,companyKeys:["a".repeat(64),"b".repeat(64)],roundKey:"c".repeat(64)}};
  const results=await Promise.allSettled([reservePaidCall(created[0],input),reservePaidCall(created[0],input)]);
  const successes=results.filter((result):result is PromiseFulfilledResult<string>=>result.status==="fulfilled");
  assert.equal(successes.length,1);
  assert.equal(results.filter(result=>result.status==="rejected"&&String(result.reason).includes("paid-request-already-recorded")).length,1);
  const id=successes[0].value;
  await settlePaidCall(created[0],id,{reportedMicros:null,latencyMs:1,responseBytes:10,inputTokens:9,outputTokens:0,succeeded:true,
    providerUsage:providerUsageObservation({choices:[{finish_reason:"stop"}],usage:{prompt_tokens:9,prompt_cache_hit_tokens:0,prompt_cache_miss_tokens:9}})});
  await assert.rejects(reservePaidCall(created[0],input),/paid-request-already-recorded/);
  const budget=await tenantQuery<{occupied_micros:string}>(created[0],"select occupied_micros::text from user_spend_budget where user_id=$1",[created[0]]);
  assert.equal(budget[0].occupied_micros,"10");
  const attributed=await tenantQuery<{metrics:{reservationAllocation:{basis:string;shares:Array<{amountMicros:number}>;additionalSpendMicros:number};costAttribution:unknown}}>(created[0],"select metrics from paid_call_reservation where user_id=$1 and id=$2",[created[0],id]);
  assert.deepEqual(attributed[0].metrics.costAttribution,input.costAttribution);
  assert.equal(attributed[0].metrics.reservationAllocation.basis,"reservation");
  assert.deepEqual(attributed[0].metrics.reservationAllocation.shares.map(row=>row.amountMicros),[5,5]);
  assert.equal(attributed[0].metrics.reservationAllocation.additionalSpendMicros,0);
  const summary=await readProviderUsageSummary(created[0],input.operationId);
  assert.equal(summary.length,1);assert.equal(summary[0].attempts,1);
  assert.deepEqual(summary[0].fields.find(field=>field.field==="prompt_cache_hit_tokens"),{field:"prompt_cache_hit_tokens",reportedAttempts:1,total:"0"});
  assert.equal(summary[0].fields.find(field=>field.field==="output_tokens")?.total,null);
  assert.equal(summary[0].cacheInputHitRate,0);
  assert.equal(summary[0].finishReason,"stop");
  assert.equal(summary[0].scoringVersion,"synthetic-policy-v1");
  assert.equal((await tenantQuery(created[1],"select id from paid_call_reservation where user_id=$1",[created[0]])).length,0);
  await reservePaidCall(created[1],input);
  // A complete reported charge for a failed HTTP attempt permits the existing retry policy.
  const knownInput={...input,requestFingerprint:"b".repeat(64)};
  const known=await reservePaidCall(created[0],knownInput);
  await settlePaidCall(created[0],known,{reportedMicros:1,latencyMs:1,responseBytes:1,inputTokens:null,outputTokens:null,succeeded:false});
  await reservePaidCall(created[0],knownInput);
  const overrideInput={...input,maximumChargeMicros:40,requestFingerprint:"c".repeat(64)};
  const unknown=await reservePaidCall(created[0],overrideInput);
  await settlePaidCall(created[0],unknown,{reportedMicros:null,latencyMs:1,responseBytes:null,inputTokens:null,outputTokens:null,succeeded:false});
  const priorRule=process.env.PAID_CALL_STAGE_OVERRIDE,priorOwner=process.env.PAID_CALL_STAGE_OVERRIDE_USER_ID;
  process.env.PAID_CALL_STAGE_OVERRIDE="A29";process.env.PAID_CALL_STAGE_OVERRIDE_USER_ID=created[0];
  const replay=await reservePaidCall(created[0],overrideInput);
  if(priorRule===undefined)delete process.env.PAID_CALL_STAGE_OVERRIDE;else process.env.PAID_CALL_STAGE_OVERRIDE=priorRule;
  if(priorOwner===undefined)delete process.env.PAID_CALL_STAGE_OVERRIDE_USER_ID;else process.env.PAID_CALL_STAGE_OVERRIDE_USER_ID=priorOwner;
  const overrideRows=await tenantQuery<{metrics:{admissionOverride:unknown}}>(created[0],
    "select metrics from paid_call_reservation where user_id=$1 and id=$2",[created[0],replay]);
  assert.deepEqual(overrideRows[0].metrics.admissionOverride,{ruleId:"A29",allowBudgetOverage:true,allowUnknownReplay:true});
  console.log(JSON.stringify({migration:"051",concurrentSingleReservation:true,unknownReplayBlockedByDefault:true,a29UnknownReplayAndBudgetOverage:true,ownerIsolation:true,nonemptyUsageAggregate:true,knownFailureRetryReservation:true,reservationAllocationConserved:true,attributionStoredBeforeNetwork:true,realProviderCalls:0,actualModelCostUsd:0,fixturesOnly:true}));
}finally{
  if(created.length){
    const client=await admin.connect();
    try{
      await client.query("begin");
      for(const id of created){
        const owner=await client.query("select id from app_user where id=$1 and email=$2 for update",[id,`billing-replay-${id}@example.invalid`]);
        if(owner.rowCount!==1)throw new Error("Fixture identity mismatch; cleanup refused");
        if((await client.query("select to_regclass('paid_cost_observation') as relation")).rows[0].relation)await client.query("delete from paid_cost_observation where user_id=$1",[id]);
        if((await client.query("select to_regclass('paid_rule_hold') as relation")).rows[0].relation)await client.query("delete from paid_rule_hold where user_id=$1",[id]);
        await client.query("delete from paid_call_reservation where user_id=$1",[id]);
        await client.query("delete from spend_budget_change where user_id=$1",[id]);
        await client.query("delete from user_spend_budget where user_id=$1",[id]);
        await client.query("delete from app_user where id=$1",[id]);
      }
      await client.query("commit");console.log("Synthetic billing fixtures removed; no customer records changed.");
    }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  }
  await admin.end();await getPool().end();
}
