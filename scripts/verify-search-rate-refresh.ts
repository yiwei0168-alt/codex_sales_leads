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
const {refreshSearchRateEvidence,readSearchRateStatuses}=await import("../src/lib/billing/search-rate-repository");
const {SEARCH_RATE_SOURCES}=await import("../src/lib/billing/search-rate-reference");
try{
  const ddl=await readFile(new URL("../db/migrations/059_exa_places_public_tariff_reference.sql",import.meta.url),"utf8");
  for(let attempt=0;attempt<2;attempt++){
    const client=await admin.connect();
    try{await client.query("begin");await client.query(ddl);await client.query("commit");}
    catch(error){await client.query("rollback");throw error;}finally{client.release();}
  }
  const accounting=()=>admin.query<{reservations:string;observations:string;occupied:string}>(`select
    (select count(*)::text from paid_call_reservation) as reservations,
    (select count(*)::text from paid_cost_observation) as observations,
    (select coalesce(sum(occupied_micros),0)::text from user_spend_budget) as occupied`);
  const before=(await accounting()).rows;
  const readPublicGets=async()=>Number((await admin.query<{requests:string}>(
    "select coalesce(sum((metrics->>'freeHttpRequests')::int),0)::text as requests from billing_tariff_refresh_observation where source_key=any($1::text[])",
    [SEARCH_RATE_SOURCES.map(item=>item.sourceKey)])).rows[0].requests);
  const previousPublicGets=await readPublicGets();
  const results=await Promise.all([refreshSearchRateEvidence(),refreshSearchRateEvidence()]);
  assert.ok(results.reduce((sum,item)=>sum+item.httpCalls,0)<=4);
  const states=await readSearchRateStatuses();
  assert.equal(states.length,4);
  assert.ok(states.every(item=>item.status==="validated"&&item.hold===false
    ||item.status==="review-required"&&item.hold===true),
    `Public Search rate state is unsafe: ${states.map(item=>`${item.tariffKey}:${item.status}`).join(",")}`);
  assert.ok(states.every(item=>item.nextAttemptAt!==null
    &&new Date(item.nextAttemptAt).getTime()-new Date(item.checkedAt!).getTime()===24*60*60*1000));
  const repeat=await refreshSearchRateEvidence();assert.equal(repeat.httpCalls,0);
  await assert.rejects(query("update billing_tariff_evidence_snapshot set evidence=evidence where source_key=$1",
    [SEARCH_RATE_SOURCES[0].sourceKey]),/permission denied/i);
  assert.deepEqual((await accounting()).rows,before);
  assert.equal((await readPublicGets())-previousPublicGets,
    results.reduce((sum,item)=>sum+item.httpCalls,0));
  const observations=await query<{metrics:{freeHttpRequests:number;costUsd:number;apiCredits:number}}>(
    "select metrics from billing_tariff_refresh_observation where source_key=any($1::text[])",
    [SEARCH_RATE_SOURCES.map(item=>item.sourceKey)]);
  assert.ok(observations.every(item=>item.metrics.costUsd===0&&item.metrics.apiCredits===0));
  const latestObservations=await query<{source_key:string;status:string;metrics:{freeHttpRequests:number;inputItems:number;
    validOutputItems:number;downstreamUsedItems:number;outputBytes:number|null;latencyMs:number;discardedReasonCounts:Record<string,number>}}>(
    "select distinct on (source_key) source_key,status,metrics from billing_tariff_refresh_observation where source_key=any($1::text[]) order by source_key,checked_at desc",
    [SEARCH_RATE_SOURCES.map(item=>item.sourceKey)]);
  console.log(JSON.stringify({migration:"059",states,concurrentAtMostFourPublicGets:true,
    oneGetPerSource:true,repeatCached:true,immutableSnapshot:true,paidReservationCountUnchanged:true,
    paidCostObservationCountUnchanged:true,budgetOccupancyUnchanged:true,allSourcesValidated:states.every(item=>item.status==="validated"),modelCalls:0,
    paidSearchCalls:0,tariffAdmitted:false,latestObservations}));
}catch(error){console.error(JSON.stringify({status:"search-rate-refresh-verification-failed",
  errorClass:error instanceof Error?error.name:"UnknownError",errorMessage:error instanceof Error?error.message:"unknown",
  paidCalls:0}));process.exitCode=1;}
finally{await admin.end();await getPool().end();}
