import nextEnv from "@next/env";
import {Pool} from "pg";
import {databaseConnectionString,databaseSslConfiguration} from "../src/lib/rag/database-ssl";
nextEnv.loadEnvConfig(process.cwd());
const userId=process.argv[2];if(!/^[0-9a-f-]{36}$/.test(userId??""))throw new Error("Supply one explicit synthetic fixture UUID");
const application=process.env.DATABASE_URL,migration=process.env.DATABASE_MIGRATION_URL;
if(!application||!migration)throw new Error("Database configuration missing");
const a=new URL(application),m=new URL(migration);
if(a.hostname!==m.hostname||(a.port||"5432")!==(m.port||"5432")||a.pathname!==m.pathname)throw new Error("Target mismatch");
const pool=new Pool({connectionString:databaseConnectionString(migration),ssl:databaseSslConfiguration(migration)}),client=await pool.connect();
try{
  await client.query("begin");
  const owner=await client.query("select id from app_user where id=$1 and email=$2 and display_name='UI acceptance fixture' for update",[userId,`ui-verification-${userId}@example.invalid`]);
  if(owner.rowCount!==1)throw new Error("Not the exact isolated UI fixture; refusing cleanup");
  const calls=await client.query("select 1 from paid_call_reservation where user_id=$1 limit 1",[userId]);
  if(calls.rowCount)throw new Error("Fixture has paid accounting; preserve it for reconciliation");
  await client.query("delete from task_spend_limit where user_id=$1",[userId]);
  await client.query("delete from assistant_conversation where user_id=$1",[userId]);
  await client.query("delete from market_workspace where owner_id=$1",[userId]);
  await client.query("delete from sales_company where domain=$1 and not exists(select 1 from workspace_company where company_id=sales_company.id)",[`ui-verification-${userId}.invalid`]);
  await client.query("delete from spend_budget_change where user_id=$1",[userId]);
  await client.query("delete from user_spend_budget where user_id=$1",[userId]);
  await client.query("delete from app_user where id=$1",[userId]);
  await client.query("commit");console.log("Removed exactly the verified synthetic fixture; no paid accounting or customer data deleted.");
}catch(error){await client.query("rollback");throw error;}finally{client.release();await pool.end();}
