import nextEnv from "@next/env";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {Pool} from "pg";
import {databaseConnectionString,databaseSslConfiguration} from "../src/lib/rag/database-ssl";
nextEnv.loadEnvConfig(process.cwd());
const application=process.env.DATABASE_URL,migration=process.env.DATABASE_MIGRATION_URL;
if(!application||!migration)throw new Error("Both database connections required");
const a=new URL(application),m=new URL(migration);
if(a.hostname!==m.hostname||(a.port||"5432")!==(m.port||"5432")||a.pathname!==m.pathname)throw new Error("Migration target mismatch");
const admin=new Pool({connectionString:databaseConnectionString(migration),ssl:databaseSslConfiguration(migration)});
const {getPool,tenantTransaction,tenantQuery}=await import("../src/lib/rag/db");
const {setSpendBudget,setTaskSpendBudget,reservePaidCall,settlePaidCall,readTaskSpendBudget}=await import("../src/lib/billing/repository");
const user=randomUUID(),other=randomUUID(),conversation=randomUUID(),root=randomUUID(),child=randomUUID(),grandchild=randomUUID();
const email=`recovery-budget-${user}@example.invalid`;
let created=false;
const reserve=(operationId:string,maximumChargeMicros:number)=>reservePaidCall(user,{operationId,maximumChargeMicros,stage:"synthetic-recovery-budget",tariffKey:"synthetic-recovery-budget",tariffVersion:"fixture-v1",requestBytes:0});
const settle=(id:string,reportedMicros:number|null)=>settlePaidCall(user,id,{reportedMicros,latencyMs:0,responseBytes:0,inputTokens:0,outputTokens:0,succeeded:reportedMicros!==null});
const link=(parent:string,next:string)=>tenantTransaction(user,client=>client.query("insert into lead_processing_recovery(user_id,parent_action_id,child_action_id) values($1,$2,$3)",[user,parent,next]));
try{
  const client=await admin.connect();
  try{
    await client.query("begin");
    await client.query(await readFile(new URL("../db/migrations/055_processing_recovery_lineage.sql",import.meta.url),"utf8"));
    await client.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Recovery budget fixture','disabled-fixture','member','disabled')",[user,email]);
    await client.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Recovery budget fixture')",[conversation,user]);
    for(const id of [root,child,grandchild])await client.query("insert into assistant_action(id,user_id,conversation_id,action_type,status,payload) values($1,$2,$3,'lead-search',$4,$5)",[id,user,conversation,id===root?"completed":"proposed",JSON.stringify({countryCode:"CO",roles:["distributor"]})]);
    await client.query("commit");created=true;
  }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  await setSpendBudget(user,1000);
  await setTaskSpendBudget(user,root,30);
  await settle(await reserve(root,10),10);
  await link(root,child);
  await assert.rejects(link(root,child),/duplicate key/);
  const acl=await admin.query<{can_select:boolean;can_insert:boolean;can_update:boolean;can_delete:boolean}>(
    "select has_table_privilege('network_copilot_app','lead_processing_recovery','SELECT') as can_select, has_table_privilege('network_copilot_app','lead_processing_recovery','INSERT') as can_insert, has_table_privilege('network_copilot_app','lead_processing_recovery','UPDATE') as can_update, has_table_privilege('network_copilot_app','lead_processing_recovery','DELETE') as can_delete");
  assert.deepEqual(acl.rows[0],{can_select:true,can_insert:true,can_update:false,can_delete:false});
  assert.equal((await tenantQuery(other,"select * from lead_processing_recovery")).length,0);
  await assert.rejects(tenantTransaction(other,c=>c.query("insert into lead_processing_recovery(user_id,parent_action_id,child_action_id) values($1,$2,$3)",[user,child,grandchild])));
  await assert.rejects(tenantTransaction(user,c=>c.query("update lead_processing_recovery set metadata='{}' where user_id=$1",[user])),/permission denied/);
  const attempts=await Promise.allSettled([reserve(child,15),reserve(child,15)]);
  assert.equal(attempts.filter(x=>x.status==="fulfilled").length,1);
  const rejected=attempts.find(x=>x.status==="rejected");assert.ok(rejected&&rejected.status==="rejected");assert.match(String(rejected.reason),/task-budget-exhausted/);
  const accepted=attempts.find(x=>x.status==="fulfilled");assert.ok(accepted&&accepted.status==="fulfilled");await settle(accepted.value,15);
  await assert.rejects(setTaskSpendBudget(user,root,24),/不能低于/);
  await setTaskSpendBudget(user,child,18);
  await tenantTransaction(user,c=>c.query("update assistant_action set status='completed' where id=$1 and user_id=$2",[child,user]));
  await tenantTransaction(user,c=>c.query("update assistant_action set payload=jsonb_set(payload,'{countryCode}','\"PE\"') where id=$1 and user_id=$2",[grandchild,user]));
  await assert.rejects(link(child,grandchild),/scope mismatch/);
  await tenantTransaction(user,c=>c.query("update assistant_action set payload=jsonb_set(payload,'{countryCode}','\"CO\"') where id=$1 and user_id=$2",[grandchild,user]));
  await link(child,grandchild);
  await assert.rejects(reserve(grandchild,4),/task-budget-exhausted/);
  await settle(await reserve(grandchild,3),3);
  const snapshot=await readTaskSpendBudget(user,grandchild);
  assert.equal(snapshot.taskLimit,null);
  assert.deepEqual(snapshot.inheritedTaskLimits.map(x=>[x.limit_micros,x.occupied_micros]).sort(),[["18","18"],["30","28"]]);
  assert.equal((await readTaskSpendBudget(user,root)).taskLimit?.occupied_micros,"28");
  await assert.rejects(readTaskSpendBudget(other,root),/不属于/);
  await setTaskSpendBudget(user,root,100);await setTaskSpendBudget(user,child,100);
  await settle(await reserve(root,1),null);
  await assert.rejects(reserve(grandchild,1),/paid-request-already-recorded/);
  assert.equal((await admin.query("select occupied_micros::text from user_spend_budget where user_id=$1",[user])).rows[0].occupied_micros,"29");
  console.log(JSON.stringify({migration:"055+072",concurrentReservations:2,successfulReservations:1,ancestorAndChildCaps:true,descendantOccupancyConserved:true,unknownAncestorBlocked:true,tenantIsolation:true,scopeMismatchBlocked:true,immutableLinks:true,acl:acl.rows[0],providerCalls:0,syntheticMicros:29}));
}finally{
  if(created){
    const client=await admin.connect();
    try{
      await client.query("begin");
      assert.equal((await client.query("select id from app_user where id=$1 and email=$2 for update",[user,email])).rowCount,1);
      assert.equal((await client.query("select id from paid_call_reservation where user_id=$1 and tariff_key<>'synthetic-recovery-budget'",[user])).rowCount,0,"Unexpected paid request: preserve fixture");
      for(const table of ["paid_cost_observation","paid_call_reservation","task_spend_limit","assistant_conversation","spend_budget_change","user_spend_budget"])await client.query(`delete from ${table} where user_id=$1`,[user]);
      await client.query("delete from app_user where id=$1 and email=$2",[user,email]);
      await client.query("commit");console.log("Synthetic recovery budget fixture removed.");
    }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  }
  await admin.end();await getPool().end();
}
