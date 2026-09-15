import nextEnv from "@next/env";
import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {Pool} from "pg";
import {databaseConnectionString,databaseSslConfiguration} from "../src/lib/rag/database-ssl";

nextEnv.loadEnvConfig(process.cwd());
const application=process.env.DATABASE_URL,migration=process.env.DATABASE_MIGRATION_URL;
if(!application||!migration)throw new Error("Both database connections required");
const a=new URL(application),m=new URL(migration);
if(a.hostname!==m.hostname||(a.port||"5432")!==(m.port||"5432")||a.pathname!==m.pathname)
  throw new Error("Database target mismatch");
const admin=new Pool({connectionString:databaseConnectionString(migration),ssl:databaseSslConfiguration(migration)});
const {getPool,tenantQuery}=await import("../src/lib/rag/db");
const {hashPassword}=await import("../src/lib/auth/password");
const {setSpendBudget,readSpendBudget}=await import("../src/lib/billing/repository");
const {withSpendContext}=await import("../src/lib/billing/context");
const {withModelAttempt}=await import("../src/lib/billing/model-attempt-context");
const {budgetedFetch}=await import("../src/lib/billing/paid-fetch");
const {billingPolicy}=await import("../src/lib/billing/policy");
const userId=randomUUID(),email=`rag-contract-${userId}@example.invalid`,operationId=randomUUID();
let transportCalls=0;
const body=(provider:"openai"|"amazon-bedrock/us-east-1")=>({model:"openai/gpt-5.6-sol",messages:[{role:"system",content:"synthetic instructions"},
  {role:"user",content:"synthetic public product facts"}],provider:{require_parameters:true,data_collection:"deny",
    only:[provider],allow_fallbacks:false},stream:false,max_tokens:4096});
const transport:typeof fetch=async()=>{transportCalls++;return Response.json({model:"openai/gpt-5.6-sol",
  choices:[{finish_reason:"stop",message:{content:"Synthetic grounded answer"}}]});};
const send=(payload:Record<string,unknown>,route:string)=>withSpendContext({userId,operationId,stage:"rag-grounded-answer"},()=>
  withModelAttempt({invocationId:"rag-answer-contract-sql",provider:"openrouter",task:"rag-answer",
    promptVersion:`rag-grounded-answer-${route}`,attempt:1},()=>budgetedFetch(transport)(
      "https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{"content-type":"application/json",
        authorization:"Bearer synthetic-never-sent"},body:JSON.stringify(payload)})));
try{
  await admin.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'RAG contract fixture',$3,'member','active')",
    [userId,email,hashPassword(randomBytes(24).toString("hex"))]);
  await setSpendBudget(userId,2_000_000);
  const primary=body("openai"),fallback=body("amazon-bedrock/us-east-1");
  await assert.rejects(send({...primary,temperature:0},"invalid"),{code:"request-out-of-bounds"});
  assert.equal(transportCalls,0);
  assert.equal((await send(primary,"primary-v2")).status,200);
  assert.equal((await send(fallback,"bedrock-v1")).status,200);
  const rows=await tenantQuery<{tariff_key:string;tariff_version:string;reserved_micros:string}>(userId,
    "select tariff_key,tariff_version,reserved_micros::text from paid_call_reservation where user_id=$1 order by created_at",[userId]);
  assert.deepEqual(rows,[{tariff_key:"openrouter-sol-rag-answer-primary-credits",tariff_version:billingPolicy.version,
    reserved_micros:"778240"},{tariff_key:"openrouter-sol-rag-answer-bedrock-fallback-credits",
    tariff_version:billingPolicy.version,reserved_micros:"378471"}]);
  const budget=await readSpendBudget(userId);
  assert.equal(budget.budget?.occupied_micros,"1156711");
  await assert.rejects(send(primary,"primary-v2"),{code:"paid-request-already-recorded"});
  await assert.rejects(send(fallback,"bedrock-v1"),{code:"paid-request-already-recorded"});
  assert.equal(transportCalls,2);
  console.log(JSON.stringify({version:billingPolicy.version,primaryReservedMicros:778240,
    fallbackReservedMicros:378471,combinedReservedMicros:1156711,invalidWireBlocked:true,
    duplicateBlocked:true,syntheticTransportCalls:transportCalls,realProviderCalls:0}));
}finally{
  const client=await admin.connect();
  try{
    await client.query("begin");
    const owned=await client.query("select id from app_user where id=$1 and email=$2 for update",[userId,email]);
    if(owned.rowCount===1){
      await client.query("delete from paid_cost_observation where user_id=$1",[userId]);
      await client.query("delete from paid_rule_hold where user_id=$1",[userId]);
      await client.query("delete from paid_call_reservation where user_id=$1",[userId]);
      await client.query("delete from product_operation_metric where user_id=$1",[userId]);
      await client.query("delete from spend_budget_change where user_id=$1",[userId]);
      await client.query("delete from user_spend_budget where user_id=$1",[userId]);
      await client.query("delete from app_user where id=$1",[userId]);
    }
    await client.query("commit");
  }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  await admin.end();await getPool().end();
}
