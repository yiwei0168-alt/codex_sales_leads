import nextEnv from "@next/env";
import pg from "pg";
import { databaseConnectionString,databaseSslConfiguration } from "../src/lib/rag/database-ssl.ts";
nextEnv.loadEnvConfig(process.cwd());
const app=process.env.DATABASE_URL,target=process.env.DATABASE_MIGRATION_URL||app;
if(!app||!target)throw new Error("Database configuration missing");
const a=new URL(app),b=new URL(target);
if(a.hostname!==b.hostname||a.pathname!==b.pathname||(a.port||"5432")!==(b.port||"5432"))throw new Error("Target mismatch");
const pool=new pg.Pool({connectionString:databaseConnectionString(target),ssl:databaseSslConfiguration(target)});
const client=await pool.connect();
try{
  await client.query("begin");
  const users=await client.query("select id from app_user limit 1");if(!users.rows[0])throw new Error("No test owner available");
  const owner=users.rows[0].id;
  await client.query("set local role network_copilot_app");
  await client.query("select set_config('app.current_user_id',$1,true)",[owner]);
  const saved=await client.query(`insert into user_outreach_memory(user_id,kind,external_id,title,content)
    values($1,'email-style','audit-smoke:'||gen_random_uuid()::text,'PRIVATE-TITLE','PRIVATE-BODY') returning id`,[owner]);
  const id=saved.rows[0].id;
  await client.query("update user_outreach_memory set status='archived' where id=$1",[id]);
  await client.query("update user_outreach_memory set updated_at=now() where id=$1",[id]);
  await client.query("delete from user_outreach_memory where id=$1",[id]);
  const own=await client.query("select operation,changed_fields,before_state,after_state from user_memory_audit where memory_id=$1 order by created_at",[id]);
  if(own.rows.map(row=>row.operation).join(",")!=="INSERT,UPDATE,DELETE")throw new Error("Unexpected audit sequence/no-op not suppressed");
  if(JSON.stringify(own.rows).includes("PRIVATE-"))throw new Error("Private text leaked into audit");
  if(!own.rows[1].changed_fields.includes("status"))throw new Error("Missing status change");
  await client.query("select set_config('app.current_user_id','00000000-0000-4000-8000-999999999999',true)");
  const other=await client.query("select id from user_memory_audit where memory_id=$1",[id]);
  if(other.rowCount!==0)throw new Error("Cross-user audit visibility");
  await client.query("rollback");
  console.log("PASS: audit INSERT/UPDATE/DELETE, no-op suppression, body exclusion, owner-only visibility; all writes rolled back.");
}finally{await client.query("rollback");client.release();await pool.end();}
