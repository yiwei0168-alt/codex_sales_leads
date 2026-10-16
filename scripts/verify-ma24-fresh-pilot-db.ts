import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import nextEnv from "@next/env";
import { Client } from "pg";

nextEnv.loadEnvConfig(process.cwd());
const appSource = process.env.DATABASE_URL;
const migrationSource = process.env.DATABASE_MIGRATION_URL;
assert(appSource && migrationSource, "Separate local app and migration URLs required");
const appUrl = new URL(appSource), migrationUrl = new URL(migrationSource);
assert(["localhost", "127.0.0.1", "::1"].includes(migrationUrl.hostname));
assert.equal(appUrl.hostname, migrationUrl.hostname);
assert.equal(appUrl.port || "5432", migrationUrl.port || "5432");
assert.equal(migrationUrl.pathname, "/network_copilot_local");
assert.notEqual(appUrl.username, migrationUrl.username);
const name = `ma24_fresh_pilot_${randomBytes(6).toString("hex")}`;
assert(/^ma24_fresh_pilot_[a-f0-9]{12}$/.test(name));
const adminUrl = new URL(migrationUrl);
adminUrl.pathname = "/postgres";
const admin = new Client({ connectionString: adminUrl.toString() });
await admin.connect();
let created = false;
try {
  await admin.query(`create database "${name}" template template0`);
  created = true;
  const appTarget = new URL(appUrl), migrationTarget = new URL(migrationUrl);
  appTarget.pathname = `/${name}`;
  migrationTarget.pathname = `/${name}`;
  const runMigration = () => new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/run-tsx.cjs", "scripts/migrate.ts", "--fresh-pilot-through=135"], {
      cwd: process.cwd(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, DATABASE_URL: appTarget.toString(), DATABASE_MIGRATION_URL: migrationTarget.toString() },
    });
    let output = "";
    child.stdout.on("data", data => { output = (output + String(data)).slice(-5000); });
    child.stderr.on("data", data => { output = (output + String(data)).slice(-5000); });
    child.once("error", reject);
    child.once("exit", code => resolve({ code, output }));
  });
  const result = await runMigration();
  assert.equal(result.code, 0, result.output);
  const repeat = await runMigration();
  assert.notEqual(repeat.code, 0, "Fresh-only migration must reject an already initialized database");
  assert(repeat.output.includes("empty application schemas"));
  const app = new Client({ connectionString: appTarget.toString() });
  await app.connect();
  try {
    await app.query("begin");
    await app.query('set local role "network_copilot_app"');
    const checked = await app.query<{ users: number; placeholderOnly: boolean; documents: number; stage: boolean; laterStageAbsent: boolean }>(`
      select (select count(*)::int from app_user) users,
        (select bool_and(id='00000000-0000-4000-8000-000000000001'::uuid
          and email='owner@network-copilot.local' and password_hash is null) from app_user) "placeholderOnly",
        (select count(*)::int from knowledge_document) documents,
        to_regclass('public.agent_skill_acceptance_freeze') is not null stage,
        to_regclass('public.ma24_evaluation_hard_limit') is null "laterStageAbsent"`);
    assert.deepEqual(checked.rows[0], { users: 1, placeholderOnly: true, documents: 0,
      stage: true, laterStageAbsent: true });
    await app.query("rollback");
  } finally { await app.end(); }
  console.log(JSON.stringify({ disposableDatabase: true, migrationThrough: 135, seededNonLoginPlaceholder: 1,
    realUsers: 0, documents: 0, applicationLoginChecked: true, stagePresent: true,
    laterStageAbsent: true, repeatRejected: true, copiedProductionData: false }));
} finally {
  if (created) await admin.query(`drop database "${name}" with (force)`);
  await admin.end();
}
