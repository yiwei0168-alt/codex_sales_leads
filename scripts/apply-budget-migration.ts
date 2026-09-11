import { readFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { Pool } from "pg";
import {databaseConnectionString,databaseSslConfiguration} from "../src/lib/rag/database-ssl";
nextEnv.loadEnvConfig(process.cwd());
const application=process.env.DATABASE_URL;
const migration=process.env.DATABASE_MIGRATION_URL||application;
if(!application||!migration)throw new Error("Database configuration missing");
const a=new URL(application),m=new URL(migration);
if(a.hostname!==m.hostname||(a.port||"5432")!==(m.port||"5432")||a.pathname!==m.pathname)throw new Error("Migration target differs from application database");
if(!process.argv.includes("--apply"))throw new Error("Use --apply to install only migration 046");
const pool=new Pool({connectionString:databaseConnectionString(migration),ssl:databaseSslConfiguration(migration)});
const client=await pool.connect();
try{
  await client.query("begin");await client.query("select pg_advisory_xact_lock(460046)");
  await client.query(await readFile("db/migrations/046_spend_budget.sql","utf8"));
  await client.query("commit");console.log("Applied migration 046 only; no budgets or tariffs activated.");
}catch(error){await client.query("rollback");throw error;}finally{client.release();await pool.end();}
