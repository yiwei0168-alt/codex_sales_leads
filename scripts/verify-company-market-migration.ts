import { readFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { databaseConnectionString, databaseSslConfiguration } from "../src/lib/rag/database-ssl";
import type { CompanyRecord } from "../src/lib/domain";

nextEnv.loadEnvConfig(process.cwd());
const application = process.env.DATABASE_URL;
const migration = process.env.DATABASE_MIGRATION_URL || application;
if (!application || !migration) throw new Error("Database configuration missing");
const a = new URL(application), m = new URL(migration);
if (a.hostname !== m.hostname || (a.port || "5432") !== (m.port || "5432") || a.pathname !== m.pathname) throw new Error("Migration target differs from application database");
const pool = new Pool({ connectionString: databaseConnectionString(migration), ssl: databaseSslConfiguration(migration) });
const client = await pool.connect();
try {
  await client.query("begin");
  await client.query("select pg_advisory_xact_lock(470047)");
  await client.query(await readFile("db/migrations/047_company_market_state.sql", "utf8"));
  await client.query(await readFile("db/migrations/048_company_market_cutover.sql", "utf8"));
  const rows = await client.query<{ workspace_id: string; company_id: string; owner_id: string; country_code: string }>(
    `select s.workspace_id,s.company_id,w.owner_id,s.country_code from workspace_company_market s
     join market_workspace w on w.id=s.workspace_id limit 1`);
  const row = rows.rows[0];
  if (!row) throw new Error("Need an existing company membership to verify migration");
  await client.query("savepoint verification");
  await client.query("set local role network_copilot_app");
  await client.query("select set_config('app.current_user_id',$1,true)", [row.owner_id]);
  const before = await client.query(`select record,user_overrides,revision from workspace_company_market where workspace_id=$1 and company_id=$2 and country_code=$3`, [row.workspace_id, row.company_id, row.country_code]);
  if (before.rowCount !== 1) throw new Error("Owner read denied");
  const projection=await client.query("select record,account_tier from user_company_market where workspace_id=$1 and company_id=$2 and market_country_code=$3",[row.workspace_id,row.company_id,row.country_code]);
  if(projection.rowCount!==1||projection.rows[0].record.country!==row.country_code)throw new Error("Country projection failed");
  const {saveCompanyMarketAssessment}=await import('../src/lib/sales/company-market-state');
  const secondaryCountry=row.country_code==='CO'?'MX':'CO';
  const run=await client.query<{id:string}>("insert into lead_search_run(workspace_id,provider,target_count,country_code) values($1,'rollback-verification',1,$2) returning id",[row.workspace_id,secondaryCountry]);
  const sharedBefore=await client.query("select record,country_code from sales_company where id=$1",[row.company_id]);
  const saved=await saveCompanyMarketAssessment(client,{workspaceId:row.workspace_id,companyId:row.company_id,country:secondaryCountry,
    record:{...projection.rows[0].record,opportunityStage:'Discovered',primaryBusinessRole:'SI'} as CompanyRecord,runId:run.rows[0].id});
  await client.query("update workspace_company_market set user_overrides=user_overrides || '{\"opportunityStage\":\"Contacted\",\"primaryBusinessRole\":\"Reseller\"}'::jsonb where workspace_id=$1 and candidate_id=$2",[row.workspace_id,saved.candidateId]);
  const updated=await saveCompanyMarketAssessment(client,{workspaceId:row.workspace_id,companyId:row.company_id,country:secondaryCountry,
    record:{...projection.rows[0].record,opportunityStage:'Discovered',primaryBusinessRole:'Distributor'} as CompanyRecord,runId:run.rows[0].id});
  if(updated.added!==0||updated.roleChanged!==0||updated.candidateId!==saved.candidateId)throw new Error('Reassessment identity/override regression');
  const effective=await client.query("select record from user_company_market where workspace_id=$1 and candidate_id=$2",[row.workspace_id,saved.candidateId]);
  if(effective.rows[0]?.record.opportunityStage!=='Contacted'||effective.rows[0]?.record.primaryBusinessRole!=='Reseller')throw new Error('Reassessment lost user activity');
  await client.query(`select wc.record from user_company_market wc join workspace_company_market locked
    on locked.workspace_id=wc.workspace_id and locked.candidate_id=wc.candidate_id
    where wc.workspace_id=$1 and wc.candidate_id=$2 for update of locked`,[row.workspace_id,saved.candidateId]);
  const sharedAfter=await client.query("select record,country_code from sales_company where id=$1",[row.company_id]);
  if(JSON.stringify(sharedBefore.rows)!==JSON.stringify(sharedAfter.rows))throw new Error('Shared identity was overwritten');
  // ZZ is a transaction-only test marker, never a production candidate country.
  await client.query(`insert into workspace_company_market(workspace_id,company_id,country_code,candidate_id,record,provenance)
    values($1,$2,'ZZ','rollback-market-verification','{"opportunityStage":"Discovered"}','user-added')`, [row.workspace_id, row.company_id]);
  await client.query(`update workspace_company_market set user_overrides='{"opportunityStage":"Contacted"}' where workspace_id=$1 and candidate_id='rollback-market-verification'`, [row.workspace_id]);
  const after = await client.query(`select record,user_overrides,revision from workspace_company_market where workspace_id=$1 and company_id=$2 and country_code=$3`, [row.workspace_id, row.company_id, row.country_code]);
  if (JSON.stringify(before.rows) !== JSON.stringify(after.rows)) throw new Error("Country state leaked to original membership");
  await client.query("select set_config('app.current_user_id','00000000-0000-4000-8000-999999999999',true)");
  const other = await client.query("select candidate_id from workspace_company_market where workspace_id=$1", [row.workspace_id]);
  if (other.rowCount) throw new Error("Cross-owner country read allowed");
  const otherProjection=await client.query("select candidate_id from user_company_market where workspace_id=$1",[row.workspace_id]);
  if(otherProjection.rowCount)throw new Error("Cross-owner projection read allowed");
  const changed = await client.query("update workspace_company_market set revision=revision+1 where workspace_id=$1", [row.workspace_id]);
  if (changed.rowCount) throw new Error("Cross-owner country update allowed");
  await client.query("rollback to savepoint verification");
  // Default is completely reversible SQL validation, including the schema itself.
  await client.query(process.argv.includes("--apply") ? "commit" : "rollback");
  console.log(process.argv.includes("--apply")
    ? "PASS: migrations 047/048 applied; country and owner isolation verified, probe writes rolled back."
    : "PASS: migrations 047/048 and country/owner isolation verified; ALL schema/data changes rolled back.");
} catch (error) {
  await client.query("rollback"); throw error;
} finally { client.release(); await pool.end(); }
