import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { Client } from "pg";

nextEnv.loadEnvConfig(process.cwd());
const configured = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
assert(configured, "A local PostgreSQL connection is required");
const source = new URL(configured);
assert(["localhost", "127.0.0.1", "::1"].includes(source.hostname), "Remote database is not allowed");
const state = JSON.parse(await readFile("tmp/ma11-replay-state.json", "utf8")) as { database: string };
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database), "Invalid isolated clone name");
source.pathname = `/${state.database}`;

const client = new Client({ connectionString: source.toString() });
const markers = async () => {
  const result = await client.query(`select
    to_regclass('public.knowledge_upload_extraction_review') is not null as extraction_review,
    to_regclass('public.knowledge_upload_review_completion') is not null as review_completion,
    to_regclass('public.agent_skill_acceptance_bundle') is not null as acceptance_bundle,
    to_regclass('public.agent_skill_model_attempt') is not null as model_attempt,
    to_regclass('public.agent_skill_acceptance_freeze') is not null as acceptance_freeze,
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='knowledge_upload_job' and column_name='visual_retry_at') as visual_retry,
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='agent_skill_model_attempt' and column_name='freeze_id') as model_freeze_binding`);
  return result.rows[0] as Record<string, boolean>;
};

await client.connect();
let transactionOpen = false;
try {
  const before = await markers();
  await client.query("begin");
  transactionOpen = true;
  const applied: string[] = [];
  for (const file of [
    "127_upload_extraction_reviews.sql",
    "128_upload_extraction_review_completion.sql",
    "129_upload_visual_queue.sql",
    "130_skill_acceptance_evidence.sql",
    "131_skill_model_attempt_journal.sql",
    "132_skill_bundle_collector.sql",
    "133_skill_acceptance_freeze.sql",
    "134_skill_model_freeze_binding.sql",
  ]) {
    await client.query(await readFile(`db/migrations/${file}`, "utf8"));
    applied.push(file);
  }
  const inside = await markers();
  assert(Object.values(inside).every(Boolean), "Candidate schema markers incomplete");
  await client.query("rollback");
  transactionOpen = false;
  const after = await markers();
  assert.deepEqual(after, before, "Rollback did not restore schema markers");
  console.log(JSON.stringify({
    clone: state.database,
    applied,
    before,
    inside,
    after,
    rolledBack: true,
    baselineAlreadyContainsAllCheckedMarkers: Object.values(before).every(Boolean),
  }));
} finally {
  if (transactionOpen) await client.query("rollback");
  await client.end();
}
