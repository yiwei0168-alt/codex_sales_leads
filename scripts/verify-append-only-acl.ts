import nextEnv from "@next/env";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {Pool} from "pg";
import {databaseConnectionString,databaseSslConfiguration} from "../src/lib/rag/database-ssl";

nextEnv.loadEnvConfig(process.cwd());
const {query,getPool}=await import("../src/lib/rag/db");

if(process.argv.includes("--apply")){
  const application=process.env.DATABASE_URL,migration=process.env.DATABASE_MIGRATION_URL;
  if(!application||!migration)throw new Error("Both database connections required for ACL migration");
  const a=new URL(application),m=new URL(migration);
  if(a.hostname!==m.hostname||(a.port||"5432")!==(m.port||"5432")||a.pathname!==m.pathname)
    throw new Error("Migration target mismatch");
  const admin=new Pool({connectionString:databaseConnectionString(migration),ssl:databaseSslConfiguration(migration)});
  const client=await admin.connect();
  try{
    await client.query("begin");
    await client.query(await readFile(new URL("../db/migrations/071_billing_ledger_acl.sql",import.meta.url),"utf8"));
    await client.query("commit");
  }catch(error){await client.query("rollback");throw error;}
  finally{client.release();await admin.end();}
}

// All of these are produced by INSERT/ON CONFLICT DO NOTHING. The application
// has no correction or deletion path for an already recorded observation.
const appendOnlyTables=[
  "billing_fx_reference_snapshot",
  "billing_reference_refresh_observation",
  "billing_tariff_evidence_snapshot",
  "billing_tariff_refresh_observation",
  "paid_cost_observation",
  "paid_rule_hold",
  "spend_budget_change",
  "lead_processing_recovery",
  "lead_search_continuation",
  "user_memory_audit",
  "knowledge_document_revision",
  "workflow_stage_metric",
  "workflow_model_usage",
  "workflow_artifact_event",
  "workspace_audit_event",
  "lead_review_checkpoint",
  "lead_qualification_phase_checkpoint",
  "lead_qualification_final_checkpoint",
] as const;
const mutableStateTables=[
  "billing_reference_refresh_state",
  "billing_tariff_refresh_state",
  "user_spend_budget",
  "paid_call_reservation",
  "task_spend_limit",
] as const;

try{
  const rows=await query<{table_name:string;can_select:boolean;can_insert:boolean;
    can_update:boolean;can_delete:boolean;can_truncate:boolean;
    can_references:boolean;can_trigger:boolean}>(`select c.relname as table_name,
      has_table_privilege(current_user,c.oid,'SELECT') as can_select,
      has_table_privilege(current_user,c.oid,'INSERT') as can_insert,
      has_table_privilege(current_user,c.oid,'UPDATE') as can_update,
      has_table_privilege(current_user,c.oid,'DELETE') as can_delete,
      has_table_privilege(current_user,c.oid,'TRUNCATE') as can_truncate,
      has_table_privilege(current_user,c.oid,'REFERENCES') as can_references,
      has_table_privilege(current_user,c.oid,'TRIGGER') as can_trigger
    from pg_class c where c.relnamespace='public'::regnamespace
      and c.relname=any($1::text[]) and c.relkind='r'
    order by c.relname`,[[...appendOnlyTables,...mutableStateTables]]);
  assert.equal(rows.length,appendOnlyTables.length+mutableStateTables.length,"Append-only ACL table inventory incomplete");
  const mutable=new Set<string>(mutableStateTables);
  const unexpected=rows.filter(row=>!row.can_select||!row.can_insert||row.can_update!==mutable.has(row.table_name)
    ||row.can_delete||row.can_truncate||row.can_references||row.can_trigger);
  console.log(JSON.stringify({tablesChecked:rows.length,unexpectedPrivileges:unexpected.map(row=>({
    table:row.table_name,select:row.can_select,insert:row.can_insert,
    update:row.can_update,delete:row.can_delete,truncate:row.can_truncate,
    references:row.can_references,trigger:row.can_trigger})),readOnlyAudit:!process.argv.includes("--apply"),
    businessRowsChanged:0,paidCalls:0}));
  assert.equal(unexpected.length,0,"Application role has unexpected append-only ledger privileges");
}finally{await getPool().end();}
