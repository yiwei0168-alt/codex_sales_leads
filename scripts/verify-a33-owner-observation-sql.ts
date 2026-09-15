import nextEnv from "@next/env";
import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {Pool} from "pg";
import {databaseConnectionString,databaseSslConfiguration} from "../src/lib/rag/database-ssl";

nextEnv.loadEnvConfig(process.cwd());
const application=process.env.DATABASE_URL,migration=process.env.DATABASE_MIGRATION_URL;
if(!application||!migration)throw new Error("Both database connections required");
const a=new URL(application),m=new URL(migration);
if(a.hostname!==m.hostname||(a.port||"5432")!==(m.port||"5432")||a.pathname!==m.pathname)throw new Error("Database target mismatch");
const admin=new Pool({connectionString:databaseConnectionString(migration),ssl:databaseSslConfiguration(migration)});
const userId=randomUUID(),email=`a33-observation-${userId}@example.invalid`,operationId=randomUUID();
process.env.PAID_CALL_STAGE_OVERRIDE="A33";process.env.PAID_CALL_STAGE_OVERRIDE_USER_ID=userId;
const {getPool,tenantQuery}=await import("../src/lib/rag/db");
const {hashPassword}=await import("../src/lib/auth/password");
const {withSpendContext}=await import("../src/lib/billing/context");
const {budgetedFetch}=await import("../src/lib/billing/paid-fetch");
let transportCalls=0;
const send=()=>withSpendContext({userId,operationId,stage:"a33-observation-sql"},()=>budgetedFetch(async()=>{
  transportCalls++;return Response.json({usage:{cost:0.002,prompt_tokens:5,completion_tokens:2}});
})("https://unpriced.example.test/v9/paid",{method:"POST",headers:{"content-type":"application/json",
  authorization:"Bearer synthetic-never-sent"},body:JSON.stringify({model:"unreviewed-paid-model",max_tokens:777,
    messages:[{role:"user",content:"synthetic public input"}]})}));
try{
  await admin.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'A33 SQL fixture',$3,'member','active')",
    [userId,email,hashPassword(randomBytes(24).toString("hex"))]);
  assert.equal((await send()).status,200);
  const rows=await tenantQuery<{reserved_micros:string;cost_bound_known:boolean;reported_micros:string;occupied_micros:string;status:string;tariff_version:string;metrics:Record<string,unknown>}>(userId,
    `select reserved_micros::text,cost_bound_known,reported_micros::text,occupied_micros::text,status,tariff_version,metrics
      from paid_call_reservation where user_id=$1 and operation_id=$2`,[userId,operationId]);
  assert.equal(rows.length,1);assert.deepEqual({...rows[0],metrics:undefined},{reserved_micros:"0",cost_bound_known:false,
    reported_micros:"2000",occupied_micros:"2000",status:"reported",tariff_version:"A33",metrics:undefined});
  assert.equal(rows[0].metrics.costBoundKnown,false);
  assert.deepEqual(rows[0].metrics.admissionOverride,{ruleId:"A33",allowBudgetOverage:true,allowUnknownReplay:true,
    allowFinancialAdmissionBypass:true});
  await assert.rejects(send(),{code:"paid-request-already-recorded"});assert.equal(transportCalls,1);
  console.log(JSON.stringify({rule:"A33",preCallReservedMicros:0,costBoundKnown:false,observedMicros:2000,
    successfulReplayBlocked:true,syntheticTransportCalls:transportCalls,realProviderCalls:0}));
}finally{
  const client=await admin.connect();
  try{await client.query("begin");
    const owned=await client.query("select id from app_user where id=$1 and email=$2 for update",[userId,email]);
    if(owned.rowCount===1){
      await client.query("delete from paid_cost_observation where user_id=$1",[userId]);
      await client.query("delete from paid_rule_hold where user_id=$1",[userId]);
      await client.query("delete from paid_call_reservation where user_id=$1",[userId]);
      await client.query("delete from product_operation_metric where user_id=$1",[userId]);
      await client.query("delete from user_spend_budget where user_id=$1",[userId]);
      await client.query("delete from app_user where id=$1",[userId]);
    }
    await client.query("commit");
  }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  await admin.end();await getPool().end();
}
