import nextEnv from "@next/env";
import pg from "pg";
import { databaseConnectionString,databaseSslConfiguration } from "../src/lib/rag/database-ssl.ts";
nextEnv.loadEnvConfig(process.cwd());
const target=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
if(!target)throw new Error("Database is not configured");
const pool=new pg.Pool({connectionString:databaseConnectionString(target),ssl:databaseSslConfiguration(target)});
const client=await pool.connect();
try {
  await client.query("begin");
  const sample=await client.query(`select w.id,w.owner_id,wc.market_country_code as country,array_agg(wc.company_id) as companies
    from market_workspace w join workspace_company wc on wc.workspace_id=w.id
    where w.slug='global-sales' and wc.market_country_code is not null
    group by w.id,w.owner_id,wc.market_country_code having count(*)>=2 limit 1`);
  if(!sample.rows[0])throw new Error("No existing two-company market available for transactional verification");
  const row=sample.rows[0];
  await client.query("set local role network_copilot_app");
  await client.query("select set_config('app.current_user_id',$1,true)",[row.owner_id]);
  const saved=await client.query(`insert into user_channel_relationship(user_id,workspace_id,country_code,from_company_id,to_company_id,relationship_type,status,basis)
    values($1,$2,$3,$4,$5,'verification-rollback','pending','temporary transactional verification') returning id`,
    [row.owner_id,row.id,row.country,row.companies[0],row.companies[1]]);
  const id=saved.rows[0].id;
  const own=await client.query("select id from user_channel_relationship where id=$1",[id]);
  if(own.rowCount!==1)throw new Error("Owner cannot read relationship");
  await client.query("select set_config('app.current_user_id','00000000-0000-4000-8000-999999999999',true)");
  const other=await client.query("select id from user_channel_relationship where id=$1",[id]);
  if(other.rowCount!==0)throw new Error("Cross-user isolation failed");
  await client.query("rollback");
  console.log("PASS: relationship insert/read and cross-user RLS; all test writes rolled back.");
} finally {await client.query("rollback");client.release();await pool.end();}
