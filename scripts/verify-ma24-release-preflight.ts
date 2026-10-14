import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
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

const migrationNames = [
  "127_upload_extraction_reviews.sql", "128_upload_extraction_review_completion.sql",
  "129_upload_visual_queue.sql", "130_skill_acceptance_evidence.sql",
  "131_skill_model_attempt_journal.sql", "132_skill_bundle_collector.sql",
  "133_skill_acceptance_freeze.sql", "134_skill_model_freeze_binding.sql",
  "135_skill_freeze_current_version.sql",
];
const sha256 = async (path: string) => {
  const digest = createHash("sha256");
  for await (const part of createReadStream(path)) digest.update(part);
  return digest.digest("hex");
};
const files = await Promise.all(migrationNames.map(async name => ({
  name, sha256: await sha256(resolve("db/migrations", name)),
})));

const directory = resolve("backups/database");
const archives = (await readdir(directory)).filter(name => /^network_copilot_.*\.dump$/.test(name));
assert(archives.length, "No local backup archive found");
const newest = (await Promise.all(archives.map(async name => ({
  name, modifiedAt: (await stat(join(directory, name))).mtimeMs,
})))).sort((a, b) => b.modifiedAt - a.modifiedAt)[0];
const archive = join(directory, newest.name);
const manifest = JSON.parse(await readFile(`${archive}.json`, "utf8")) as {
  bytes: number; sha256: string; createdAt: string;
};
const archiveSize = (await stat(archive)).size;
const archiveHash = await sha256(archive);
assert.equal(archiveSize, manifest.bytes, "Backup archive size mismatch");
assert.equal(archiveHash, manifest.sha256, "Backup archive SHA-256 mismatch");

const client = new Client({
  connectionString: databaseConnectionString(migration),
  ssl: databaseSslConfiguration(migration),
});
await client.connect();
try {
  const prerequisiteResult = await client.query<Record<string, boolean>>(`select
    to_regclass('public.agent_skill_shadow_campaign') is not null as shadow_campaign,
    to_regclass('public.agent_skill_shadow_job') is not null as shadow_job,
    to_regclass('public.agent_skill_shadow_event') is not null as shadow_event,
    to_regclass('public.agent_skill_shadow_review') is not null as shadow_review,
    to_regclass('public.agent_skill_blind_round') is not null as blind_round,
    to_regclass('public.agent_skill_blind_judgment') is not null as blind_judgment,
    to_regclass('public.agent_skill_blind_disclosure') is not null as blind_disclosure,
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='knowledge_upload_job' and column_name='revision_target_document_id') as revision_target,
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='knowledge_upload_job' and column_name='revision_base_version_id') as revision_base`);
  const prerequisiteMarkers = prerequisiteResult.rows[0];
  const result = await client.query<Record<string, boolean>>(`select
    to_regclass('public.knowledge_upload_extraction_review') is not null as extraction_review,
    to_regclass('public.knowledge_upload_review_completion') is not null as review_completion,
    to_regclass('public.agent_skill_acceptance_bundle') is not null as acceptance_bundle,
    to_regclass('public.agent_skill_model_attempt') is not null as model_attempt,
    to_regclass('public.agent_skill_acceptance_freeze') is not null as acceptance_freeze,
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='knowledge_upload_job' and column_name='visual_retry_at') as visual_retry,
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='agent_skill_model_attempt' and column_name='freeze_id') as model_freeze_binding,
    case when to_regrole('network_copilot_skill_collector') is null then false else
      has_table_privilege('network_copilot_skill_collector','public.agent_skill','SELECT') and
      has_table_privilege('network_copilot_skill_collector','public.agent_skill_version','SELECT') and
      has_table_privilege('network_copilot_skill_collector','public.agent_run_skill','SELECT') end as skill_freeze_reader`);
  const markers = result.rows[0];
  const values = Object.values(markers);
  const schemaState = values.every(Boolean) ? "stage-present" : values.every(value => !value) ? "stage-absent" : "partial-stage";
  console.log(JSON.stringify({
    preflight: "read-only", schemaState, prerequisiteMarkers, markers, migrationFiles: files,
    backup: { file: newest.name, bytes: archiveSize, sha256: archiveHash, createdAt: manifest.createdAt,
      ageHours: Math.round((Date.now() - Date.parse(manifest.createdAt)) / 3_600_000 * 10) / 10,
      checksumMatched: true },
    readyForRelease: false,
    remaining: ["Create a fresh backup immediately before migration", "Bind an integrated source/service release and rollback package", "Verify runtime and queues again"],
  }));
  assert(Object.values(prerequisiteMarkers).every(Boolean), "One or more 123-126 prerequisite markers are absent");
  assert.notEqual(schemaState, "partial-stage", "Partial 127-135 stage needs manual reconciliation");
} finally {
  await client.end();
}
