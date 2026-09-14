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
const {budgetedFetch}=await import("../src/lib/billing/paid-fetch");
const {billingPolicy}=await import("../src/lib/billing/policy");
const userId=randomUUID(),email=`extract-contract-${userId}@example.invalid`;
let created=false,transportCalls=0;
try{
  await admin.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Extract contract fixture',$3,'member','active')",
    [userId,email,hashPassword(randomBytes(24).toString("hex"))]);created=true;
  await setSpendBudget(userId,64_000);
  const transport:typeof fetch=async()=>{transportCalls++;return Response.json({results:[],failed_results:[],usage:{credits:4}});};
  const send=(operationId:string,urls:string[])=>withSpendContext({userId,operationId,stage:"synthetic-extract-contract"},
    ()=>budgetedFetch(transport)("https://api.tavily.com/extract",{method:"POST",
      headers:{"content-type":"application/json","authorization":"Bearer synthetic-never-sent"},
      body:JSON.stringify({urls,extract_depth:"basic",format:"text",include_images:false,
        include_usage:true,timeout:20})}));
  const urls=Array.from({length:20},(_,index)=>`https://fixture-${index}.example/path`);
  const first=randomUUID();
  assert.equal((await send(first,urls)).status,200);
  const firstBudget=await readSpendBudget(userId);
  assert.equal(firstBudget.budget?.occupied_micros,"32000");
  assert.equal(firstBudget.budget?.remaining_micros,"32000");
  assert.equal(firstBudget.stages[0]?.unknown_bills,1);
  await assert.rejects(send(first,urls),{code:"paid-request-already-recorded"});
  await setSpendBudget(userId,40_000);
  await assert.rejects(send(randomUUID(),urls),{code:"budget-exhausted"});
  await assert.rejects(send(randomUUID(),[...urls,"https://extra.example/path"]),
    {code:"request-out-of-bounds"});
  assert.equal(transportCalls,1);
  const rows=await tenantQuery<{tariff_key:string;tariff_version:string;reserved_micros:string}>(userId,
    "select tariff_key,tariff_version,reserved_micros::text from paid_call_reservation where user_id=$1",[userId]);
  assert.deepEqual(rows,[{tariff_key:"tavily-basic-extract",tariff_version:billingPolicy.version,
    reserved_micros:"32000"}]);
  console.log(JSON.stringify({activeTariff:rows[0].tariff_key,tariffVersion:rows[0].tariff_version,
    reservedMicros:32000,unknownBillRetained:true,duplicateBlocked:true,overBudgetBlocked:true,
    extraUrlBlocked:true,syntheticTransportCalls:transportCalls,realProviderCalls:0}));
}finally{
  if(created){
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
