import assert from "node:assert/strict";
import nextEnv from "@next/env";
import { Client } from "pg";

nextEnv.loadEnvConfig(process.cwd());
const configured = process.env.DATABASE_MIGRATION_URL;
assert(configured, "A local migration connection is required for read-only receipt audit");
const url = new URL(configured);
assert(["localhost", "127.0.0.1", "::1"].includes(url.hostname), "Remote database is not allowed");
assert.equal(decodeURIComponent(url.pathname.slice(1)), "network_copilot_local", "Unexpected product database");

const client = new Client({ connectionString: url.toString() });
await client.connect();
try {
  await client.query("begin read only");
  const result = await client.query(`with jobs as (
    select j.id,j.user_id,j.target_id,j.created_at,j.error,m.learning_status,m.id is not null as message_exists
    from mailbox_work_job j left join mailbox_message m on m.user_id=j.user_id and m.id=j.target_id
    where j.kind='learn' and j.status='uncertain'
  ), receipts as (
    select j.*,a.id as audit_id,a.status as audit_status,a.provider_request_id,
      r.id as reservation_id,r.status as reservation_status,r.provider_request_hash,r.request_fingerprint
    from jobs j left join mailbox_outbound_audit a on a.user_id=j.user_id and a.message_id=j.target_id
    left join paid_call_reservation r on r.user_id=a.user_id and r.operation_id=a.id::text
  ) select count(distinct id)::int as jobs,count(distinct user_id)::int as owners,
    min(created_at)::date::text as oldest_job_date,max(created_at)::date::text as newest_job_date,
    count(*) filter(where not message_exists)::int as missing_messages,
    count(*) filter(where learning_status='failed')::int as failed_learning_status,
    count(audit_id)::int as audits,count(*) filter(where audit_status='failed')::int as failed_audits,
    count(reservation_id)::int as reservations,
    count(*) filter(where reservation_status='unknown')::int as unknown_reservations,
    count(*) filter(where provider_request_id is not null or provider_request_hash is not null)::int as provider_receipts,
    count(*) filter(where request_fingerprint is not null)::int as request_fingerprints
    from receipts`);
  await client.query("rollback");
  console.log(JSON.stringify({ scope: "local read-only metadata; no mail bodies, recipients, or IDs exported",
    ...result.rows[0], automaticRetryAllowed: false }));
} finally {
  await client.end();
}
