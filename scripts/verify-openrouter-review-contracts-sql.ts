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
const fixtures:Array<{userId:string;email:string}>=[];
let transportCalls=0;
const cases=[{task:"lead-review-secondary",model:"openai/gpt-5.6-terra",effort:"medium",
  tokens:8192,key:"openrouter-terra-review-credits-standard-json",micros:11019202},
{task:"lead-review-judge",model:"openai/gpt-5.6-sol",effort:"high",
  tokens:12000,key:"openrouter-sol-judge-credits-standard-json",micros:27736500}] as const;
try{
  for(const [index,entry] of cases.entries()){
    const userId=randomUUID(),email=`review-contract-${userId}@example.invalid`;
    await admin.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Review contract fixture',$3,'member','active')",
      [userId,email,hashPassword(randomBytes(24).toString("hex"))]);
    fixtures.push({userId,email});
    await setSpendBudget(userId,30_000_000);
    const body={model:entry.model,temperature:0,reasoning:{effort:entry.effort},
      max_completion_tokens:entry.tokens,provider:{require_parameters:true,data_collection:"deny"},
      response_format:{type:"json_schema",json_schema:{name:entry.task,strict:true,schema:{type:"object"}}},
      messages:[{role:"system",content:"synthetic instructions"},{role:"user",content:"synthetic fact"}]};
    const operationId=randomUUID();
    const transport:typeof fetch=async()=>{transportCalls++;return Response.json({model:entry.model,
      choices:[{finish_reason:"stop",message:{content:"{}"}}]});};
    const send=(task:string,payload:Record<string,unknown>)=>withSpendContext({userId,operationId,
      stage:"synthetic-review-contract"},()=>withModelAttempt({invocationId:`review-contract-${index}`,
      provider:"openrouter-openai-review",task,promptVersion:"fixture",attempt:1},
      ()=>budgetedFetch(transport)("https://openrouter.ai/api/v1/chat/completions",{
        method:"POST",headers:{"content-type":"application/json","authorization":"Bearer synthetic-never-sent"},
        body:JSON.stringify(payload)})));
    await assert.rejects(send("unrelated-task",body),{code:index===0?"missing-tariff":"request-out-of-bounds"});
    await assert.rejects(send(entry.task,{...body,reasoning:{effort:"low"}}),
      {code:"request-out-of-bounds"});
    assert.equal(transportCalls,index);
    assert.equal((await send(entry.task,body)).status,200);
    const rows=await tenantQuery<{tariff_key:string;tariff_version:string;reserved_micros:string}>(userId,
      "select tariff_key,tariff_version,reserved_micros::text from paid_call_reservation where user_id=$1",[userId]);
    assert.deepEqual(rows,[{tariff_key:entry.key,tariff_version:billingPolicy.version,
      reserved_micros:String(entry.micros)}]);
    const budget=await readSpendBudget(userId);
    assert.equal(budget.budget?.occupied_micros,String(entry.micros));
    assert.equal(budget.stages[0]?.unknown_bills,1);
    await assert.rejects(send(entry.task,body),{code:"paid-request-already-recorded"});
    assert.equal(transportCalls,index+1);
  }
  console.log(JSON.stringify({version:billingPolicy.version,terraReservedMicros:11019202,
    solJudgeReservedMicros:27736500,unrelatedTaskBlocked:true,invalidWireBlocked:true,
    duplicateBlocked:true,unknownBillsRetained:true,syntheticTransportCalls:transportCalls,
    realProviderCalls:0}));
}finally{
  for(const {userId,email} of fixtures){
    const client=await admin.connect();
    try{
      await client.query("begin");
      const owned=await client.query("select id from app_user where id=$1 and email=$2 for update",[userId,email]);
      if(owned.rowCount!==1)throw new Error("Fixture mismatch; refusing cleanup");
      await client.query("delete from paid_cost_observation where user_id=$1",[userId]);
      await client.query("delete from paid_rule_hold where user_id=$1",[userId]);
      await client.query("delete from paid_call_reservation where user_id=$1",[userId]);
      await client.query("delete from spend_budget_change where user_id=$1",[userId]);
      await client.query("delete from user_spend_budget where user_id=$1",[userId]);
      await client.query("delete from app_user where id=$1",[userId]);
      await client.query("commit");
    }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  }
  await admin.end();await getPool().end();
}
