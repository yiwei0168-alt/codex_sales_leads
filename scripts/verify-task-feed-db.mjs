import nextEnv from "@next/env";
import pg from "pg";
import { databaseConnectionString,databaseSslConfiguration } from "../src/lib/rag/database-ssl.ts";
import { taskFeedSql } from "../src/lib/assistant/task-feed.ts";
nextEnv.loadEnvConfig(process.cwd());
const application=process.env.DATABASE_URL,target=process.env.DATABASE_MIGRATION_URL||application;
if(!application||!target)throw new Error("Database not configured");
const a=new URL(application),b=new URL(target);
if(a.hostname!==b.hostname||a.pathname!==b.pathname||(a.port||"5432")!==(b.port||"5432"))throw new Error("Target mismatch");
const pool=new pg.Pool({connectionString:databaseConnectionString(target),ssl:databaseSslConfiguration(target)});
const client=await pool.connect();
try{
  await client.query("begin read only");
  const users=await client.query("select id from app_user limit 1");if(!users.rows[0])throw new Error("No owner available");
  const owner=users.rows[0].id;await client.query("set local role network_copilot_app");
  await client.query("select set_config('app.current_user_id',$1,true)",[owner]);
  for(const kind of ["all","search","contacts","draft","send"]){
    const result=await client.query(taskFeedSql,[owner,kind,"all","all",0]);
    if(result.rowCount>51||result.rows.some(row=>kind!=="all"&&row.kind!==kind))throw new Error("Feed projection failed");
  }
  const nobody="00000000-0000-4000-8000-999999999999";
  await client.query("select set_config('app.current_user_id',$1,true)",[nobody]);
  const other=await client.query(taskFeedSql,[nobody,"all","all","all",0]);
  if(other.rowCount)throw new Error("Unexpected cross-owner records");
  console.log("PASS: all four feed queries execute, bounded typed results, unknown-owner feed empty; read-only transaction.");
}finally{await client.query("rollback");client.release();await pool.end();}
