import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import nextEnv from "@next/env";
import { Client } from "pg";
import { databaseConnectionString, databaseSslConfiguration } from "../src/lib/rag/database-ssl";
import { applyVerifiedMa24Stage, ma24StageMarkers, verifiedMa24StageSql } from "./lib/ma24-stage-127-135";

nextEnv.loadEnvConfig(process.cwd());
const arguments_ = process.argv.slice(2);
assert(arguments_.every(value => value === "--apply" || /^--backup-sha256=[a-f0-9]{64}$/.test(value)),
  "Only --apply and --backup-sha256=<64 lowercase hex> are accepted");
const apply = arguments_.includes("--apply");
const expectedBackup = arguments_.find(value => value.startsWith("--backup-sha256="))?.split("=")[1];
assert(!apply || expectedBackup, "Applying migrations requires an explicitly reviewed backup SHA-256");

const application = process.env.DATABASE_URL;
const migration = process.env.DATABASE_MIGRATION_URL;
assert(application && migration, "Separate application and migration database URLs are required");
const applicationUrl = new URL(application);
const migrationUrl = new URL(migration);
assert(["localhost", "127.0.0.1", "::1"].includes(migrationUrl.hostname.toLowerCase()),
  "This stage runner only accepts the local product database");
assert(applicationUrl.hostname === migrationUrl.hostname
  && (applicationUrl.port || "5432") === (migrationUrl.port || "5432")
  && applicationUrl.pathname === migrationUrl.pathname,
"Application and migration URLs must target the same database");
assert(decodeURIComponent(migrationUrl.pathname) === "/network_copilot_local",
  "This stage runner only accepts network_copilot_local");
assert(decodeURIComponent(migrationUrl.username) !== decodeURIComponent(applicationUrl.username),
  "Application and migration logins must differ");

const files = await verifiedMa24StageSql();
assert(files.length === 9 && files.every(file => Number(file.name.slice(0, 3)) >= 127
  && Number(file.name.slice(0, 3)) <= 135), "Migration stage escaped 127-135");
const backupDirectory = resolve("backups/database");
const names = (await readdir(backupDirectory)).filter(name => /^network_copilot_.*\.dump$/.test(name));
assert(names.length, "No local backup exists");
const latest = (await Promise.all(names.map(async name => ({
  name, modifiedAt: (await stat(join(backupDirectory, name))).mtimeMs,
})))).sort((a, b) => b.modifiedAt - a.modifiedAt)[0];
const backupPath = join(backupDirectory, latest.name);
const manifest = JSON.parse(await readFile(`${backupPath}.json`, "utf8")) as {
  bytes: number; sha256: string; createdAt: string;
};
const hash = createHash("sha256");
for await (const part of createReadStream(backupPath)) hash.update(part);
const backupSha256 = hash.digest("hex");
assert.equal((await stat(backupPath)).size, manifest.bytes, "Backup size mismatch");
assert.equal(backupSha256, manifest.sha256, "Backup checksum mismatch");
const backupAgeMinutes = (Date.now() - Date.parse(manifest.createdAt)) / 60_000;
assert(Number.isFinite(backupAgeMinutes) && backupAgeMinutes >= 0, "Invalid backup creation time");

const client = new Client({ connectionString: databaseConnectionString(migration),
  ssl: databaseSslConfiguration(migration) });
await client.connect();
try {
  const database = (await client.query<{ name: string }>("select current_database() as name")).rows[0]?.name;
  assert.equal(database, "network_copilot_local");
  const prerequisite = (await client.query<Record<string, boolean>>(`select
    to_regclass('public.agent_skill_shadow_campaign') is not null as shadow_campaign,
    to_regclass('public.agent_skill_shadow_job') is not null as shadow_job,
    to_regclass('public.agent_skill_shadow_event') is not null as shadow_event,
    to_regclass('public.agent_skill_shadow_review') is not null as shadow_review,
    to_regclass('public.agent_skill_blind_round') is not null as blind_round,
    to_regclass('public.agent_skill_blind_judgment') is not null as blind_judgment,
    to_regclass('public.agent_skill_blind_disclosure') is not null as blind_disclosure,
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='knowledge_upload_job' and column_name='revision_target_document_id') as revision_target,
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='knowledge_upload_job' and column_name='revision_base_version_id') as revision_base`)).rows[0];
  assert(Object.values(prerequisite).every(Boolean), "123-126 prerequisite schema is incomplete");
  const before = await ma24StageMarkers(client);
  const stageAbsent = Object.values(before).every(value => !value);
  const stagePresent = Object.values(before).every(Boolean);
  assert(stageAbsent || stagePresent, "Partial 127-135 stage requires manual reconciliation");
  console.log(JSON.stringify({ mode: apply ? "apply-preflight" : "read-only", database,
    stage: "127-135", stageState: stageAbsent ? "absent" : "present",
    migrationFiles: files.map(({ name, sha256 }) => ({ name, sha256 })),
    backup: { file: latest.name, sha256: backupSha256,
      ageMinutes: Math.round(backupAgeMinutes * 10) / 10, checksumMatched: true },
    productionChanged: false }));
  if (!apply) process.exitCode = 0;
  else {
    assert(stageAbsent, "Stage already exists; refusing to replay on product database");
    assert.equal(expectedBackup, backupSha256, "Reviewed backup hash does not match the latest archive");
    assert(backupAgeMinutes <= 30, "A verified backup less than 30 minutes old is required");
    await client.query("begin");
    try {
      await applyVerifiedMa24Stage(client, files);
      assert(Object.values(await ma24StageMarkers(client)).every(Boolean), "Stage markers incomplete after SQL");
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
    console.log(JSON.stringify({ stage: "127-135", committed: true,
      backupSha256, migrationCount: files.length,
      markers: await ma24StageMarkers(client) }));
  }
} finally {
  await client.end();
}
