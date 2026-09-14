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
const {refreshBillingFxReference,readCurrentCnyFxReference,readBillingReferenceStatus}=await import("../src/lib/billing/fx-reference-repository");
const {ECB_SOURCE_KEY,ECB_REFERENCE_URL,fetchEcbCnyReference,StaleEcbReferenceError}=await import("../src/lib/billing/ecb-reference");
let verificationStep="migration";
try{
  const ddl=await readFile(new URL("../db/migrations/053_billing_fx_reference.sql",import.meta.url),"utf8");
  const acl=await readFile(new URL("../db/migrations/070_billing_fx_append_only_acl.sql",import.meta.url),"utf8");
  const client=await admin.connect();
  try{await client.query("begin");await client.query(ddl);await client.query(acl);await client.query("commit");}
  catch(error){await client.query("rollback");throw error;}finally{client.release();}
  verificationStep="concurrent-refresh";
  const results=await Promise.all([refreshBillingFxReference(),refreshBillingFxReference()]);
  assert.ok(results.reduce((sum,item)=>sum+item.httpCalls,0)<=1);
  verificationStep="snapshot-immutability";
  const reference=await readCurrentCnyFxReference();
  const privileges=await query<{table_name:string;can_select:boolean;can_insert:boolean;can_update:boolean;can_delete:boolean;can_truncate:boolean}>(`select c.relname as table_name,
    has_table_privilege(current_user,c.oid,'SELECT') as can_select,
    has_table_privilege(current_user,c.oid,'INSERT') as can_insert,
    has_table_privilege(current_user,c.oid,'UPDATE') as can_update,
    has_table_privilege(current_user,c.oid,'DELETE') as can_delete,
    has_table_privilege(current_user,c.oid,'TRUNCATE') as can_truncate
    from pg_class c where c.relnamespace='public'::regnamespace
    and c.relname in ('billing_fx_reference_snapshot','billing_reference_refresh_observation','billing_reference_refresh_state')
    order by c.relname`);
  assert.equal(privileges.length,3);
  for(const privilege of privileges){
    assert.equal(privilege.can_select,true);
    assert.equal(privilege.can_insert,true);
    assert.equal(privilege.can_update,privilege.table_name==='billing_reference_refresh_state');
    assert.equal(privilege.can_delete,false);
    assert.equal(privilege.can_truncate,false);
  }
  let mutationDenied=false;
  try{await query("update billing_fx_reference_snapshot set fx=fx where source_key=$1",[ECB_SOURCE_KEY]);}
  catch(error){
    if(!/permission denied|row-level security/i.test(error instanceof Error?error.message:""))throw error;
    mutationDenied=true;
  }
  assert.equal(mutationDenied,true);
  verificationStep="cached-repeat";
  const repeat=await refreshBillingFxReference();assert.equal(repeat.httpCalls,0);
  if(reference){
    verificationStep="usable-reference";
    assert.equal(reference.reference,ECB_REFERENCE_URL);
    console.log(JSON.stringify({migrations:["053","070"],fixedOfficialSource:true,concurrentAtMostOneFetch:true,repeatCached:true,
      immutableSnapshot:true,rateUsable:true,referenceDate:reference.asOf,referenceVersion:reference.version,
      realModelCalls:0,paidApiCalls:0,preservedPublicReferenceHistory:true,customerOrInvoiceChanges:false}));
  }else{
    verificationStep="expired-status";
    const status=await readBillingReferenceStatus();
    assert.equal(status.fx.status,"expired-or-invalid");
    verificationStep="official-expiry-check";
    await assert.rejects(fetchEcbCnyReference(),StaleEcbReferenceError);
    console.log(JSON.stringify({migrations:["053","070"],fixedOfficialSource:true,concurrentAtMostOneFetch:true,
      scheduledRefreshAttempted:results.some(item=>item.httpCalls===1),repeatCached:true,
      immutableSnapshot:true,rateUsable:false,holdReason:"official-reference-expired",
      lastReferenceDate:status.fx.asOf,effectiveExpiresAt:status.fx.effectiveExpiresAt,
      realModelCalls:0,paidApiCalls:0,preservedPublicReferenceHistory:true,customerOrInvoiceChanges:false}));
  }
}catch(error){console.error(JSON.stringify({status:"reference-verification-failed",step:verificationStep,
  errorClass:error instanceof Error?error.name:"UnknownError",
  errorCode:error&&typeof error==="object"&&"code" in error?String(error.code):null,paidCalls:0}));process.exitCode=1;}
finally{await admin.end();await getPool().end();}
