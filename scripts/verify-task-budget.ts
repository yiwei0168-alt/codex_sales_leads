import {readFile} from "node:fs/promises";
import nextEnv from "@next/env";
import {Pool} from "pg";
import {databaseConnectionString,databaseSslConfiguration} from "../src/lib/rag/database-ssl";
import {reservePaidCallInTransaction} from "../src/lib/billing/repository";
nextEnv.loadEnvConfig(process.cwd());
const application=process.env.DATABASE_URL,migration=process.env.DATABASE_MIGRATION_URL||application;
if(!application||!migration)throw new Error("Database configuration missing");
const a=new URL(application),m=new URL(migration);
if(a.hostname!==m.hostname||(a.port||"5432")!==(m.port||"5432")||a.pathname!==m.pathname)throw new Error("Migration target differs from application");
const pool=new Pool({connectionString:databaseConnectionString(migration),ssl:databaseSslConfiguration(migration)}),client=await pool.connect();
try{
  await client.query("begin");await client.query("select pg_advisory_xact_lock(500050)");
  await client.query(await readFile("db/migrations/050_task_spend_limits.sql","utf8"));
  await client.query("savepoint fixture");
  const users=await client.query<{id:string}>("select id from app_user where status='active' limit 1");
  if(!users.rows[0])throw new Error("An active user is required for rollback probe");const userId=users.rows[0].id;
  await client.query("set local role network_copilot_app");await client.query("select set_config('app.current_user_id',$1,true)",[userId]);
  const conversation=await client.query<{id:string}>("insert into assistant_conversation(user_id,title) values($1,'rollback-budget-fixture') returning id",[userId]);
  const action=await client.query<{id:string}>("insert into assistant_action(user_id,conversation_id,action_type,status,payload) values($1,$2,'lead-search','proposed','{}') returning id",[userId,conversation.rows[0].id]);
  const actionId=action.rows[0].id;
  await client.query("insert into user_spend_budget(user_id,limit_micros) values($1,100) on conflict(user_id) do update set limit_micros=100,occupied_micros=0,frozen=false",[userId]);
  await client.query("insert into task_spend_limit(user_id,action_id,limit_micros) values($1,$2,10)",[userId,actionId]);
  const input={operationId:actionId,stage:"rollback-probe",tariffKey:"fixture",tariffVersion:"fixture",maximumChargeMicros:7,requestBytes:1};
  await reservePaidCallInTransaction(client,userId,input);
  let blocked=false;try{await reservePaidCallInTransaction(client,userId,input);}catch(error){blocked=error instanceof Error&&error.message.includes("task-budget-exhausted");}
  if(!blocked)throw new Error("Task cap failed");
  const occupied=await client.query("select occupied_micros::text from user_spend_budget where user_id=$1",[userId]);
  if(occupied.rows[0].occupied_micros!=="7")throw new Error("Denied call changed occupied funds");
  await client.query("insert into spend_budget_change(user_id,operation_id,new_limit_micros,metrics) values($1,$2,10,'{}')",[userId,actionId]);
  await client.query("select set_config('app.current_user_id','00000000-0000-4000-8000-999999999999',true)");
  for(const table of ["task_spend_limit","spend_budget_change"]){const hidden=await client.query(`select user_id from ${table} where user_id=$1`,[userId]);if(hidden.rowCount)throw new Error("Owner isolation failed");}
  await client.query("rollback to savepoint fixture");
  if(process.argv.includes("--apply")){await client.query("commit");console.log("Migration 050 applied; all fixtures rolled back, no budgets activated or provider calls.");}
  else{await client.query("rollback");console.log("Task cap actual reservation/RLS checks passed; entire probe rolled back.");}
}catch(error){await client.query("rollback");throw error;}finally{client.release();await pool.end();}
