import nextEnv from "@next/env";
import {Pool} from "pg";
import {databaseConnectionString,databaseSslConfiguration} from "../src/lib/rag/database-ssl";

nextEnv.loadEnvConfig(process.cwd());
const databaseUrl=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
if(!databaseUrl)throw new Error("Database connection required");
const role=process.env.DATABASE_APPLICATION_ROLE?.trim()||"network_copilot_app";
if(!/^[a-z_][a-z0-9_]{0,62}$/i.test(role))throw new Error("Invalid application role");
const startedAt=Date.now();
const pool=new Pool({connectionString:databaseConnectionString(databaseUrl),ssl:databaseSslConfiguration(databaseUrl)});
try{
  const migrationRole=await pool.query<{name:string;superuser:boolean;bypassRls:boolean}>(
    `select current_user as name,r.rolsuper as superuser,r.rolbypassrls as "bypassRls"
     from pg_roles r where r.rolname=current_user`);
  const rows=await pool.query<{table_name:string;rls_enabled:boolean;rls_forced:boolean;select_granted:boolean;
    insert_granted:boolean;update_granted:boolean;delete_granted:boolean;identity_columns:string[]}>(`
    select c.relname as table_name,c.relrowsecurity as rls_enabled,c.relforcerowsecurity as rls_forced,
      has_table_privilege($1,c.oid,'SELECT') as select_granted,
      has_table_privilege($1,c.oid,'INSERT') as insert_granted,
      has_table_privilege($1,c.oid,'UPDATE') as update_granted,
      has_table_privilege($1,c.oid,'DELETE') as delete_granted,
      coalesce(array_agg(a.attname::text order by a.attnum) filter(where a.attname=any(array[
        'user_id','owner_id','workspace_id','run_id','lead_run_id','action_id','conversation_id'])), '{}'::text[]) as identity_columns
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
      left join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
    where n.nspname='public' and c.relkind='r'
    group by c.relname,c.oid,c.relrowsecurity,c.relforcerowsecurity
    order by c.relname`,[role]);
  const exposed=rows.rows.filter(row=>row.identity_columns.length>0&&row.select_granted&&!row.rls_enabled);
  const links=await pool.query<{evidence_mismatch:string;assessment_mismatch:string;decision_mismatch:string;
    quarantined_emails:string}>(`select
    (select count(*)::text from company_web_evidence e join company_enrichment_run r on r.id=e.run_id
      where e.workspace_id<>r.workspace_id) as evidence_mismatch,
    (select count(*)::text from contact_model_assessment a join contact_verification_run r on r.id=a.run_id
      join company_email_candidate em on em.id=a.email_candidate_id
      where em.workspace_id is distinct from r.workspace_id or em.company_id<>a.company_id) as assessment_mismatch,
    (select count(*)::text from contact_verification_decision d join contact_verification_run r on r.id=d.run_id
      join company_email_candidate em on em.id=d.email_candidate_id
      left join company_contact ct on ct.id=d.contact_id
      where em.workspace_id is distinct from r.workspace_id or em.company_id<>d.company_id
        or (d.contact_id is not null and (ct.workspace_id is distinct from r.workspace_id or ct.company_id<>d.company_id))) as decision_mismatch,
    (select count(*)::text from company_email_candidate where workspace_id is null) as quarantined_emails`);
  console.log(JSON.stringify({appRole:role,migrationRole:migrationRole.rows[0],publicTables:rows.rowCount,unprotectedOwnerKeyedTables:exposed.length,
    contactLinkMismatches:links.rows[0],latencyMs:Date.now()-startedAt,ownerKeyedReadableWithoutRls:exposed.map(row=>({
    table:row.table_name,keys:row.identity_columns,writes:[row.insert_granted,row.update_granted,row.delete_granted]}))},null,2));
}finally{await pool.end();}
