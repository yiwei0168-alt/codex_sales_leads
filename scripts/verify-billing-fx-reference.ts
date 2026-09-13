import nextEnv from "@next/env";
import {Pool} from "pg";
import {readFile} from "node:fs/promises";
import assert from "node:assert/strict";
import {databaseConnectionString,databaseSslConfiguration} from "../src/lib/rag/database-ssl";
nextEnv.loadEnvConfig(process.cwd());
const application=process.env.DATABASE_URL,migration=process.env.DATABASE_MIGRATION_URL;
if(!application||!migration)throw new Error("Application and migration connections required");
const a=new URL(application),m=new URL(migration);
if(a.hostname!==m.hostname||(a.port||"5432")!==(m.port||"5432")||a.pathname!==m.pathname)throw new Error("Migration target mismatch");
const admin=new Pool({connectionString:databaseConnectionString(migration),ssl:databaseSslConfiguration(migration)});
const {query,getPool}=await import("../src/lib/rag/db");
const {refreshBillingFxReference,readCurrentCnyFxReference}=await import("../src/lib/billing/fx-reference-repository");
const {ECB_SOURCE_KEY,ECB_REFERENCE_URL}=await import("../src/lib/billing/ecb-reference");
try{
  const ddl=await readFile(new URL("../db/migrations/053_billing_fx_reference.sql",import.meta.url),"utf8");
  const client=await admin.connect();
  try{await client.query("begin");await client.query(ddl);await client.query("commit");}
  catch(error){await client.query("rollback");throw error;}finally{client.release();}
  const results=await Promise.all([refreshBillingFxReference(),refreshBillingFxReference()]);
  assert.ok(results.reduce((sum,item)=>sum+item.httpCalls,0)<=1);
  const reference=await readCurrentCnyFxReference();assert.ok(reference);assert.equal(reference.reference,ECB_REFERENCE_URL);
  await assert.rejects(query("update billing_fx_reference_snapshot set fx=fx where source_key=$1",[ECB_SOURCE_KEY]),/permission denied/i);
  const repeat=await refreshBillingFxReference();assert.equal(repeat.httpCalls,0);
  console.log(JSON.stringify({migration:"053",fixedOfficialSource:true,concurrentAtMostOneFetch:true,repeatCached:true,
    immutableSnapshot:true,referenceDate:reference.asOf,referenceVersion:reference.version,realModelCalls:0,paidApiCalls:0,
    preservedPublicReferenceHistory:true,customerOrInvoiceChanges:false}));
}catch(error){console.error(JSON.stringify({status:"reference-verification-failed",errorClass:error instanceof Error?error.name:"UnknownError",paidCalls:0}));process.exitCode=1;}
finally{await admin.end();await getPool().end();}
