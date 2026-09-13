import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import nextEnv from "@next/env";
import {Pool} from "pg";
import {databaseConnectionString,databaseSslConfiguration} from "../src/lib/rag/database-ssl";

nextEnv.loadEnvConfig(process.cwd());
const application=process.env.DATABASE_URL,migration=process.env.DATABASE_MIGRATION_URL;
if(!application||!migration)throw new Error("Application and migration connections required");
const appTarget=new URL(application),migrationTarget=new URL(migration);
if(appTarget.hostname!==migrationTarget.hostname||(appTarget.port||"5432")!==(migrationTarget.port||"5432")
  ||appTarget.pathname!==migrationTarget.pathname)throw new Error("Migration target mismatch");
const admin=new Pool({connectionString:databaseConnectionString(migration),ssl:databaseSslConfiguration(migration)});
const {query,getPool}=await import("../src/lib/rag/db");
const {refreshOpenRouterSolRateEvidence,readOpenRouterSolRateStatus}=await import("../src/lib/billing/openrouter-rate-repository");
const {OPENROUTER_SOL_RATE_SOURCE,OPENROUTER_SOL_TARIFF_KEY}=await import("../src/lib/billing/openrouter-rate-reference");
try{
  const ddl=await readFile(new URL("../db/migrations/056_openrouter_tariff_reference.sql",import.meta.url),"utf8");
  const client=await admin.connect();
  try{await client.query("begin");await client.query(ddl);await client.query("commit");}
  catch(error){await client.query("rollback");throw error;}finally{client.release();}
  const before=await admin.query<{reservations:string;observations:string;occupied:string}>(`select
    (select count(*)::text from paid_call_reservation) as reservations,
    (select count(*)::text from paid_cost_observation) as observations,
    (select coalesce(sum(occupied_micros),0)::text from user_spend_budget) as occupied`);
  const results=await Promise.all([refreshOpenRouterSolRateEvidence(),refreshOpenRouterSolRateEvidence()]);
  assert.ok(results.reduce((sum,item)=>sum+item.httpCalls,0)<=2);
  const state=await readOpenRouterSolRateStatus();
  assert.ok(["validated","review-required","unavailable"].includes(state.status));
  const holds=await query<{held:boolean}>(
    "select exists(select 1 from billing_tariff_refresh_state where tariff_key=$1 and hold) as held",[OPENROUTER_SOL_TARIFF_KEY]);
  assert.equal(holds[0]?.held,state.hold);
  const repeat=await refreshOpenRouterSolRateEvidence();assert.equal(repeat.httpCalls,0);
  await assert.rejects(query("update billing_tariff_evidence_snapshot set evidence=evidence where source_key=$1",[OPENROUTER_SOL_RATE_SOURCE]),/permission denied/i);
  const after=await admin.query<{reservations:string;observations:string;occupied:string}>(`select
    (select count(*)::text from paid_call_reservation) as reservations,
    (select count(*)::text from paid_cost_observation) as observations,
    (select coalesce(sum(occupied_micros),0)::text from user_spend_budget) as occupied`);
  assert.deepEqual(after.rows,before.rows);
  console.log(JSON.stringify({migration:"056",source:OPENROUTER_SOL_RATE_SOURCE,status:state.status,hold:state.hold,
    concurrentAtMostTwoPublicGets:true,repeatCached:true,immutableSnapshot:true,applicationRoleReadsReviewHold:true,paidReservationCountUnchanged:true,
    paidCostObservationCountUnchanged:true,budgetOccupancyUnchanged:true,modelCalls:0,paidApiCalls:0,tariffAdmitted:false}));
}catch(error){console.error(JSON.stringify({status:"openrouter-rate-refresh-verification-failed",
  errorClass:error instanceof Error?error.name:"UnknownError",paidCalls:0}));process.exitCode=1;}
finally{await admin.end();await getPool().end();}
