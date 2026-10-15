/** Isolated local DB acceptance for explicit MA24 evaluation claims; no model calls. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { Pool } from "pg";

nextEnv.loadEnvConfig(process.cwd());
assert.equal(process.env.MA24_ADMISSION_USE_CLONE, "1", "Explicit isolated clone required");
const state = JSON.parse(await readFile("tmp/ma11-replay-state.json", "utf8")) as {
  database: string; cleaned?: boolean;
};
assert(!state.cleaned && /^ma11_replay_[a-f0-9]{12}$/.test(state.database), "Active clone required");
const cloneUrl = (value: string | undefined) => {
  assert(value, "Local database URL required");
  const url = new URL(value);
  assert(["localhost", "127.0.0.1"].includes(url.hostname), "Local database required");
  url.pathname = `/${state.database}`;
  return url.toString();
};
const adminUrl = cloneUrl(process.env.DATABASE_MIGRATION_URL);
const appUrl = cloneUrl(process.env.DATABASE_URL);
process.env.DATABASE_URL = appUrl;
const { claimMa24EvaluationRun, claimAndBindMa24EvaluationRun,
  loadCurrentMa24G15Preview } = await import(
  "../src/lib/knowledge/evaluation/ma24-evaluation-claim");
const { getPool } = await import("../src/lib/rag/db");
const { finishRun } = await import("../src/lib/assistant/main/repository");
const { modeModelConfig } = await import("../src/lib/assistant/main/mode-config");
const { ma24CaseQuerySha256, ma24ManifestSha256 } = await import(
  "../src/lib/knowledge/evaluation/ma24-independent-comparison");
const admin = new Pool({ connectionString: adminUrl });
const app = new Pool({ connectionString: appUrl });
const userId = randomUUID(), conversationId = randomUUID();
const evaluationId = randomUUID(), ordinaryId = randomUUID(), malformedId = randomUUID();
const admittedId = randomUUID(), rejectedId = randomUUID();
const admittedConversationId = randomUUID(), rejectedConversationId = randomUUID();
let inserted = false;
let verified = false;
try {
  const kind = (await admin.query<{ definition: string }>(
    `select pg_get_constraintdef(oid) as definition from pg_constraint
     where conname='agent_run_execution_kind_check'`)).rows[0]?.definition;
  assert(kind?.includes("main-agent-evaluation"), "Clone must have migration 136");
  const migration = await readFile("db/migrations/137_ma24_explicit_evaluation_claim.sql", "utf8");
  await admin.query(migration);
  const ownerMigration = await readFile("db/migrations/138_ma24_evaluation_claim_owner.sql", "utf8");
  await admin.query(ownerMigration);
  const oldClaim = (await admin.query<{ old: string | null }>(
    "select to_regprocedure('claim_ma24_evaluation_run(uuid,text)')::text as old")).rows[0];
  assert.equal(oldClaim.old, null, "Task-ID-only evaluation claim entry still exists");
  const appQuery = async <T extends import("pg").QueryResultRow>(sql: string, params: unknown[] = []) => {
    const client = await app.connect();
    try {
      await client.query("begin");
      await client.query('set local role "network_copilot_app"');
      const result = await client.query<T>(sql, params);
      await client.query("commit");
      return result;
    } catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
  };
  const permission = (await appQuery<{ role: string; allowed: boolean }>(
    `select current_user as role,
      has_function_privilege(current_user,'claim_ma24_evaluation_run(uuid,uuid,text)','EXECUTE') as allowed`)).rows[0];
  assert(permission.allowed, `Application role lacks MA24 claim grant: ${permission.role}`);
  const client = await admin.connect();
  try {
    await client.query("begin");
    await client.query(`insert into app_user(id,email,display_name,role,status)
      values($1,$2,'MA24 explicit claim synthetic fixture','member','active')`,
    [userId, `${userId}@example.invalid`]);
    await client.query(`insert into assistant_conversation(id,user_id,title,status)
      values($1,$2,'MA24 explicit claim fixture','deleted')`, [conversationId, userId]);
    for (const [runId, kind, spec] of [
      [evaluationId, "main-agent-evaluation", { schema: "ma24-evaluation-run-v1" }],
      [ordinaryId, "main-agent", null],
      [malformedId, "main-agent-evaluation", { schema: "other" }],
    ] as const) await client.query(`insert into agent_run(id,user_id,conversation_id,request_key,
      request_hash,input,model_config,execution_version,execution_kind,execution_spec,status)
      values($1,$2,$3,$4,$4,$5,$6,'main-agent-v1',$7,$8,'queued')`,
    [runId, userId, conversationId, runId,
      JSON.stringify({ content: "Synthetic question", requestKey: runId,
        attachments: [], knowledgeScope: ["industry"], mode: "standard" }),
      JSON.stringify({ model: "fixture", version: "fixture" }), kind, JSON.stringify(spec)]);
    await client.query("commit");
    inserted = true;
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }

  const claim = (runId: string, worker = "ma24-explicit-claim-fixture") =>
    claimMa24EvaluationRun(runId, userId, worker);
  assert.equal(await claim(ordinaryId), null, "Ordinary task was claimed");
  assert.equal(await claim(malformedId), null, "Malformed evaluation task was claimed");
  assert.equal(await claimMa24EvaluationRun(evaluationId, randomUUID(),
    "ma24-wrong-owner-fixture"), null, "Another account claimed evaluation task");
  await assert.rejects(claim(evaluationId, " "), /claim identity required/);
  assert.equal((await appQuery("select * from claim_ma24_evaluation_run($1,$2,$3)",
    [evaluationId, userId, " "])).rowCount, 0, "Blank worker claimed task in SQL");
  const first = await claim(evaluationId);
  assert(first && first.id === evaluationId && first.user_id === userId &&
    /^[0-9a-f-]{36}$/.test(first.lease_token), "Explicit evaluation claim failed");
  assert.equal(await claim(evaluationId), null, "Evaluation task claimed twice");
  await admin.query(`update agent_run set lease_until=now()-interval '1 second'
    where id=$1 and user_id=$2`, [evaluationId, userId]);
  assert.equal(await claim(evaluationId), null, "Expired evaluation lease was reclaimed");
  const saved = (await admin.query<{ status: string; lease_token: string }>(
    "select status,lease_token from agent_run where id=$1 and user_id=$2", [evaluationId, userId])).rows[0];
  assert.deepEqual(saved, { status: "running", lease_token: first.lease_token });
  const caseId = "ma24-explicit-admission-synthetic";
  const frozenQuery = "What does the synthetic source report?";
  const sourceSetBytes = new TextEncoder().encode(JSON.stringify({
    schema: "ma24-g16-source-set-v1", cases: [{ caseId, query: frozenQuery }],
  }));
  const goldBytes = new TextEncoder().encode(JSON.stringify({
    schema: "ma24-g16-gold-snapshot-v1", cases: [{ caseId,
      caseSha256: ma24CaseQuerySha256(frozenQuery), expectedAnswer: "Synthetic answer",
      expectedSources: [{ assetSha256: "c".repeat(64), unitIndex: 1,
        excerpt: "Synthetic evidence" }], reviewer: "Synthetic reviewer",
      reviewedAt: "2026-10-15T00:00:00Z", note: "Fixture only" }],
  }));
  const model = modeModelConfig("standard");
  const loadedCodeAndConfig = loadCurrentMa24G15Preview();
  const codeAndConfigBytes = new TextEncoder().encode(JSON.stringify(loadedCodeAndConfig));
  const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
  const manifest = { schema: "ma24-g16-frozen-comparison-v2" as const,
    sourceSetSha256: hash(sourceSetBytes), goldSnapshotSha256: hash(goldBytes),
    codeAndConfigSha256: hash(codeAndConfigBytes),
    requiredImprovementTags: [], protectedNoRegressionTags: [],
    cases: [{ caseId, caseSha256: ma24CaseQuerySha256(frozenQuery),
      group: "synthetic", tags: [], expectedOutcome: "route" as const,
      userId, knowledgeScope: ["industry" as const] }],
  };
  for (const [runId, separateConversationId, content] of [
    [admittedId, admittedConversationId, frozenQuery],
    [rejectedId, rejectedConversationId, "Changed question"],
  ]) {
    await admin.query(`insert into assistant_conversation(id,user_id,title,status)
      values($1,$2,'MA24 bound claim fixture','deleted')`, [separateConversationId, userId]);
    await admin.query(`insert into agent_run(id,user_id,conversation_id,request_key,
      request_hash,input,model_config,execution_version,execution_kind,execution_spec,status)
      values($1,$2,$3,$4,$4,$5,$6,'main-agent-v1','main-agent-evaluation',$7,'queued')`,
    [runId, userId, separateConversationId, runId, JSON.stringify({ content,
      requestKey: `ma24-admit-${runId}`, attachments: [], knowledgeScope: ["industry"],
      mode: "standard" }), JSON.stringify(model), JSON.stringify({
      schema: "ma24-evaluation-run-v1", manifestSha256: ma24ManifestSha256(manifest),
      caseId, arm: "baseline" })]);
  }
  const binding = { manifest, sourceSetBytes, goldBytes, codeAndConfigBytes,
    caseId, arm: "baseline" as const,
    workerId: "ma24-bound-claim-fixture" };
  const admitted = await claimAndBindMa24EvaluationRun({ ...binding, runId: admittedId });
  assert.equal(admitted.userId, userId);
  assert.equal(admitted.query, frozenQuery);
  await finishRun({ userId, runId: admittedId, leaseToken: admitted.lease_token,
    role: "member" }, "failed", "Synthetic admission only");
  await assert.rejects(claimAndBindMa24EvaluationRun({ ...binding, runId: rejectedId,
    sourceSetBytes: new TextEncoder().encode("changed frozen source") }),
  /frozen source set snapshot drift/);
  assert.equal((await admin.query<{ status: string }>(
    "select status from agent_run where id=$1 and user_id=$2",
    [rejectedId, userId])).rows[0]?.status, "queued",
  "Snapshot drift consumed the queued evaluation task");
  const changedRuntimeBytes = new TextEncoder().encode(JSON.stringify({
    ...loadedCodeAndConfig, modePromptSha256: "changed-runtime-prompt",
  }));
  await assert.rejects(claimAndBindMa24EvaluationRun({ ...binding, runId: rejectedId,
    manifest: { ...manifest, codeAndConfigSha256: hash(changedRuntimeBytes) },
    codeAndConfigBytes: changedRuntimeBytes }), /modePromptSha256 drift/);
  assert.equal((await admin.query<{ status: string }>(
    "select status from agent_run where id=$1 and user_id=$2",
    [rejectedId, userId])).rows[0]?.status, "queued",
  "Changed frozen runtime preview consumed the queued evaluation task");
  await assert.rejects(claimAndBindMa24EvaluationRun({ ...binding, runId: rejectedId }),
    /leased execution/);
  const rejectedStatus = (await admin.query<{ status: string; result: { reply: string } }>(
    "select status,result from agent_run where id=$1 and user_id=$2",
    [rejectedId, userId])).rows[0];
  assert.deepEqual(rejectedStatus, { status: "failed",
    result: { reply: "MA24 evaluation admission rejected" } });
  const sideEffects = (await admin.query<{ messages: number; model_calls: number }>(`
    select (select count(*)::integer from assistant_message
      where user_id=$1 and conversation_id=any($2::uuid[])) as messages,
      (select count(*)::integer from agent_tool_call
      where user_id=$1 and run_id=any($3::uuid[]) and effect='model') as model_calls`,
  [userId, [admittedConversationId, rejectedConversationId],
    [admittedId, rejectedId]])).rows[0];
  assert.deepEqual(sideEffects, { messages: 0, model_calls: 0 },
    "Evaluation admission wrote ordinary messages or model calls");
  verified = true;
} finally {
  if (inserted) {
    const client = await admin.connect();
    try {
      await client.query("begin");
      const owner = await client.query(`select id from app_user where id=$1
        and display_name='MA24 explicit claim synthetic fixture'
        and email=id::text||'@example.invalid' for update`, [userId]);
      assert.equal(owner.rowCount, 1, "Synthetic owner identity changed");
      await client.query("delete from agent_run_event where user_id=$1 and run_id=any($2::uuid[])",
        [userId, [evaluationId, ordinaryId, malformedId, admittedId, rejectedId]]);
      await client.query("delete from agent_run where user_id=$1 and id=any($2::uuid[])",
        [userId, [evaluationId, ordinaryId, malformedId, admittedId, rejectedId]]);
      await client.query("delete from assistant_conversation where user_id=$1 and id=any($2::uuid[])",
        [userId, [conversationId, admittedConversationId, rejectedConversationId]]);
      await client.query("delete from app_user where id=$1", [userId]);
      await client.query("commit");
      const residual = (await admin.query<{ users: string; conversations: string; runs: string }>(`
        select (select count(*)::text from app_user where id=$1) as users,
          (select count(*)::text from assistant_conversation where id=any($2::uuid[])) as conversations,
          (select count(*)::text from agent_run where id=any($3::uuid[])) as runs`,
      [userId, [conversationId, admittedConversationId, rejectedConversationId],
        [evaluationId, ordinaryId, malformedId, admittedId, rejectedId]])).rows[0];
      assert.deepEqual(residual, { users: "0", conversations: "0", runs: "0" },
        "Synthetic evaluation claim rows remained");
    } catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
  }
  await app.end();
  await admin.end();
  await getPool().end();
}
if (verified) console.log(JSON.stringify({ schema: "ma24-g16-explicit-claim-clone-v1",
  checks: ["explicit-id-and-owner", "ordinary-rejected", "malformed-rejected",
    "blank-worker-rejected", "duplicate-claim-rejected", "expired-lease-not-reclaimed",
    "app-role-grant", "claimed-row-bound-to-frozen-input",
    "snapshot-drift-rejected-before-claim", "loaded-runtime-drift-rejected-before-claim",
    "binding-failure-terminated-without-model-call",
    "no-ordinary-message-or-model-call", "synthetic-rows-cleaned"],
  providerCalls: 0 }));
