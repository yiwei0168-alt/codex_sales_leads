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
const {refreshDeepSeekRateEvidence,readDeepSeekRateStatuses}=await import("../src/lib/billing/deepseek-rate-repository");
const {DEEPSEEK_RATE_SOURCES}=await import("../src/lib/billing/deepseek-rate-reference");
try{
  const ddl=await readFile(new URL("../db/migrations/057_deepseek_public_tariff_reference.sql",import.meta.url),"utf8");
  const client=await admin.connect();
  try{await client.query("begin");await client.query(ddl);await client.query("commit");}
  catch(error){await client.query("rollback");throw error;}finally{client.release();}
  const accounting=()=>admin.query<{reservations:string;observations:string;occupied:string}>(`select
    (select count(*)::text from paid_call_reservation) as reservations,
    (select count(*)::text from paid_cost_observation) as observations,
    (select coalesce(sum(occupied_micros),0)::text from user_spend_budget) as occupied`);
  const before=(await accounting()).rows;
  const readPublicGets=async()=>Number((await admin.query<{requests:string}>(
    "select coalesce(sum((metrics->>'freeHttpRequests')::int),0)::text as requests from billing_tariff_refresh_observation where source_key=any($1::text[])",
    [DEEPSEEK_RATE_SOURCES.map(item=>item.sourceKey)])).rows[0].requests);
  const previousPublicGets=await readPublicGets();
  const results=await Promise.all([refreshDeepSeekRateEvidence(),refreshDeepSeekRateEvidence()]);
  assert.ok(results.reduce((sum,item)=>sum+item.httpCalls,0)<=1);
  const states=await readDeepSeekRateStatuses();
  assert.equal(states.length,2);
  assert.ok(states.every(item=>["validated","review-required","unavailable"].includes(item.status)));
  const holds=await query<{tariff_key:string;hold:boolean}>(
    "select tariff_key,hold from billing_tariff_refresh_state where source_key=any($1::text[])",
    [DEEPSEEK_RATE_SOURCES.map(item=>item.sourceKey)]);
  for(const state of states)assert.equal(holds.find(item=>item.tariff_key===state.tariffKey)?.hold,state.hold);
  const repeat=await refreshDeepSeekRateEvidence();assert.equal(repeat.httpCalls,0);
  await assert.rejects(query("update billing_tariff_evidence_snapshot set evidence=evidence where source_key=$1",
    [DEEPSEEK_RATE_SOURCES[0].sourceKey]),/permission denied/i);
  assert.deepEqual((await accounting()).rows,before);
  const observations=await query<{metrics:{freeHttpRequests:number;outputBytes:number|null;costUsd:number;apiCredits:number}}>(
    "select metrics from billing_tariff_refresh_observation where source_key=any($1::text[]) order by id",
    [DEEPSEEK_RATE_SOURCES.map(item=>item.sourceKey)]);
  assert.equal((await readPublicGets())-previousPublicGets,
    results.reduce((sum,item)=>sum+item.httpCalls,0));
  assert.ok(observations.every(item=>item.metrics.costUsd===0&&item.metrics.apiCredits===0));
  console.log(JSON.stringify({migration:"057",states,concurrentAtMostOnePublicGet:true,repeatCached:true,
    sharedHttpCountConserved:true,immutableSnapshot:true,paidReservationCountUnchanged:true,
    paidCostObservationCountUnchanged:true,budgetOccupancyUnchanged:true,modelCalls:0,
    paidApiCalls:0,tariffAdmitted:false}));
}catch(error){console.error(JSON.stringify({status:"deepseek-rate-refresh-verification-failed",
  errorClass:error instanceof Error?error.name:"UnknownError",errorMessage:error instanceof Error?error.message:"unknown",
  paidCalls:0}));process.exitCode=1;}
finally{await admin.end();await getPool().end();}
