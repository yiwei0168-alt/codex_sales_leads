import assert from "node:assert/strict";
import nextEnv from "@next/env";
import { Client } from "pg";
import { databaseConnectionString, databaseSslConfiguration } from "../src/lib/rag/database-ssl";

nextEnv.loadEnvConfig(process.cwd());
const application = process.env.DATABASE_URL;
const migration = process.env.DATABASE_MIGRATION_URL;
assert(application && migration, "Application and migration database URLs are required");
const applicationUrl = new URL(application);
const migrationUrl = new URL(migration);
assert(["localhost", "127.0.0.1", "::1"].includes(migrationUrl.hostname.toLowerCase()), "Only a local database can be checked");
assert(applicationUrl.hostname === migrationUrl.hostname
  && (applicationUrl.port || "5432") === (migrationUrl.port || "5432")
  && applicationUrl.pathname === migrationUrl.pathname, "Application and migration URLs target different databases");

const queues = [
  { name: "mainAgent", table: "agent_run", state: "status", running: "running", lease: "lease_until" },
  { name: "leadWorkflow", table: "lead_workflow_job", state: "status", running: "running", lease: "lease_until" },
  { name: "knowledgeUpload", table: "knowledge_upload_job", state: "status", running: "running", lease: "lease_until" },
  { name: "skillShadow", table: "agent_skill_shadow_job", state: "state", running: "running", lease: "lease_until" },
] as const;

const client = new Client({
  connectionString: databaseConnectionString(migration),
  ssl: databaseSslConfiguration(migration),
});
await client.connect();
try {
  await client.query("begin transaction read only");
  const report: Record<string, unknown> = {};
  for (const queue of queues) {
    const result = await client.query<{ state: string; count: number; expired_lease: number; missing_lease: number }>(`
      select ${queue.state} as state, count(*)::int as count,
        count(*) filter (where ${queue.state}='${queue.running}' and ${queue.lease}<now())::int as expired_lease,
        count(*) filter (where ${queue.state}='${queue.running}' and ${queue.lease} is null)::int as missing_lease
      from public.${queue.table} group by ${queue.state} order by ${queue.state}`);
    report[queue.name] = result.rows;
  }
  const mailbox = await client.query<{ state: string; count: number; older_than_one_hour: number }>(`
    select status as state, count(*)::int as count,
      count(*) filter (where status='running' and started_at<now()-interval '1 hour')::int as older_than_one_hour
    from public.mailbox_sync_run group by status order by status`);
  report.mailboxSync = mailbox.rows;
  const checkedAt = (await client.query<{ checked_at: string }>("select now()::text as checked_at")).rows[0].checked_at;
  await client.query("commit");
  console.log(JSON.stringify({ schema: "ma24-runtime-queue-audit-v1", checkedAt, mode: "read-only", queues: report }));
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
