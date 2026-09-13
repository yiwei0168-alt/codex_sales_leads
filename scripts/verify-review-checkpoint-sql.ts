import nextEnv from "@next/env";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Pool } from "pg";
import { databaseConnectionString, databaseSslConfiguration } from "../src/lib/rag/database-ssl";

nextEnv.loadEnvConfig(process.cwd());
const app = process.env.DATABASE_URL, migration = process.env.DATABASE_MIGRATION_URL;
if (!app || !migration) throw new Error("Both application and migration database connections are required");
const a = new URL(app), m = new URL(migration);
if (a.hostname !== m.hostname || (a.port || "5432") !== (m.port || "5432") || a.pathname !== m.pathname)
  throw new Error("Fixture database mismatch");
const admin = new Pool({ connectionString: databaseConnectionString(migration),
  ssl: databaseSslConfiguration(migration) });
const { getPool, tenantQuery } = await import("../src/lib/rag/db");
const { productReviewCheckpoint } = await import("../src/lib/leads/workflow/review-checkpoint");
const userId = randomUUID(), otherUserId = randomUUID(), workspaceId = randomUUID(), otherWorkspaceId = randomUUID();
const candidateId = "synthetic-review-company";
const contract = createHash("sha256").update("synthetic-review-wire").digest("hex");
const response = { model: "fixture-model", output: { candidateId, fixture: true },
  usage: { inputTokens: 11, outputTokens: 7, reasoningTokens: 2, totalTokens: 18 } };
let created = false;
const startedAt = Date.now();
try {
  // Recover only this verifier's exact disposable identities if an earlier cleanup was interrupted.
  const stale = await admin.query<{ id: string }>(`select id from app_user
    where display_name='Review checkpoint fixture' and email like 'review-checkpoint-%@fixture.invalid'`);
  if (stale.rows.length) {
    if (stale.rows.length !== 2) throw new Error("Unexpected stale review fixture count");
    const staleIds = stale.rows.map(row => row.id);
    const client = await admin.connect();
    try {
      await client.query("begin");
      const workspaces = await client.query(`select id from market_workspace where owner_id=any($1::uuid[])
        and name='Review checkpoint fixture' and slug='global-sales' for update`, [staleIds]);
      if (workspaces.rowCount !== 2) throw new Error("Unexpected stale review workspace count");
      await client.query("delete from market_workspace where id=any($1::uuid[])",
        [workspaces.rows.map(row => row.id)]);
      await client.query("delete from app_user where id=any($1::uuid[])", [staleIds]);
      await client.query("commit");
      console.log("Interrupted synthetic review fixture removed.");
    } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  }
  const client = await admin.connect();
  try {
    await client.query("begin");
    for (const id of [userId, otherUserId]) await client.query(
      "insert into app_user(id,email,display_name,role,status) values($1,$2,'Review checkpoint fixture','member','disabled')",
      [id, `review-checkpoint-${id}@fixture.invalid`]);
    for (const [id, owner] of [[workspaceId, userId], [otherWorkspaceId, otherUserId]])
      await client.query(`insert into market_workspace(id,owner_id,slug,name,market,country_code,objective)
        values($1,$2,'global-sales','Review checkpoint fixture','Global','WW','Synthetic review cache')`,
      [id, owner]);
    await client.query("commit"); created = true;
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }

  const own = productReviewCheckpoint({ userId, workspaceId, countryCode: "CO" });
  await own.save("secondary", candidateId, contract, response);
  assert.deepEqual(await own.load("secondary", candidateId, contract), response);
  const probe = spawnSync(process.execPath,
    ["scripts/run-tsx.cjs", "scripts/probe-review-checkpoint.ts", userId, workspaceId,
      "CO", candidateId, contract], { cwd: process.cwd(), encoding: "utf8", timeout: 30_000 });
  assert.equal(probe.status, 0, `Cross-process checkpoint load failed: ${probe.stderr}`);
  assert.match(probe.stdout, /"crossProcessReviewCheckpoint":"passed"/);
  await own.save("secondary", candidateId, contract, response);
  assert.equal((await tenantQuery<{ n: number }>(userId,
    "select count(*)::int as n from lead_review_checkpoint where candidate_id=$1", [candidateId]))[0].n, 1);
  assert.equal(await own.load("judge", candidateId, contract), null);
  assert.equal(await productReviewCheckpoint({ userId, workspaceId, countryCode: "MX" })
    .load("secondary", candidateId, contract), null);
  assert.equal(await productReviewCheckpoint({ userId: otherUserId, workspaceId: otherWorkspaceId,
    countryCode: "CO" }).load("secondary", candidateId, contract), null);
  assert.equal((await tenantQuery(otherUserId,
    "select response from lead_review_checkpoint where candidate_id=$1", [candidateId])).length, 0);
  await assert.rejects(productReviewCheckpoint({ userId: otherUserId, workspaceId,
    countryCode: "CO" }).save("secondary", candidateId, contract, response),
  /row-level security|permission denied/i);
  await assert.rejects(tenantQuery(userId,
    "update lead_review_checkpoint set response='{}'::jsonb where candidate_id=$1", [candidateId]),
  /permission denied/i);
  console.log(JSON.stringify({ reviewCheckpointSql: "passed", completedResponses: 1,
    crossProcessLoads: 1,
    duplicateRows: 0, foreignReads: 0, crossCountryReads: 0, foreignWorkspaceInsertDenied: true,
    mutationDenied: true, actualPaidCalls: 0, latencyMs: Date.now() - startedAt }));
} finally {
  if (created) {
    const client = await admin.connect();
    try {
      await client.query("begin");
      const owners = await client.query("select id from app_user where id=any($1::uuid[]) and display_name='Review checkpoint fixture' for update",
        [[userId, otherUserId]]);
      if (owners.rowCount !== 2) throw new Error("Fixture owner mismatch");
      await client.query("delete from market_workspace where id=any($1::uuid[]) and name='Review checkpoint fixture'",
        [[workspaceId, otherWorkspaceId]]);
      await client.query("delete from app_user where id=any($1::uuid[])", [[userId, otherUserId]]);
      await client.query("commit");
      console.log("Synthetic review checkpoint fixture removed.");
    } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  }
  await getPool().end(); await admin.end();
}
