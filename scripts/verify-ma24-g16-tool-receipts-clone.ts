/** Isolated local DB acceptance for complete G16 tool-receipt binding; no model calls. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { Pool } from "pg";

nextEnv.loadEnvConfig(process.cwd());
assert.equal(process.env.MA24_ADMISSION_USE_CLONE, "1", "Explicit isolated clone required");
const state = JSON.parse(await readFile("tmp/ma11-replay-state.json", "utf8")) as {
  database: string; cleaned?: boolean;
};
assert(!state.cleaned && /^ma11_replay_[a-f0-9]{12}$/.test(state.database),
  "Active isolated clone required");
const cloneUrl = (value: string | undefined) => {
  assert(value, "Local database URL required");
  const url = new URL(value);
  assert(["localhost", "127.0.0.1"].includes(url.hostname), "Local database required");
  url.pathname = `/${state.database}`;
  return url.toString();
};
const adminUrl = cloneUrl(process.env.DATABASE_MIGRATION_URL);
process.env.DATABASE_URL = cloneUrl(process.env.DATABASE_URL);
const [{ verifyMa24PersistedRunBinding, exportMa24PersistedRun },
  { ma24CaseQuerySha256 }, { digest }, { getPool }] =
  await Promise.all([
    import("../src/lib/knowledge/evaluation/ma24-persisted-run-binding"),
    import("../src/lib/knowledge/evaluation/ma24-independent-comparison"),
    import("../src/lib/assistant/main/contracts"),
    import("../src/lib/rag/db"),
  ]);
const admin = new Pool({ connectionString: adminUrl });
const userId = randomUUID(), runId = randomUUID(), conversationId = randomUUID();
const callId = randomUUID(), inventedId = randomUUID();
const query = "Synthetic receipt-binding question";
const caseId = "ma24-receipt-binding-synthetic";
const modelId = "synthetic-model";
const scope = ["industry"] as const;
const manifestSha256 = "a".repeat(64);
const callInput = { fixture: "local-read-only" };
const frozen = { caseId, caseSha256: ma24CaseQuerySha256(query), group: "synthetic",
  tags: [], expectedOutcome: "route" as const, userId, knowledgeScope: [...scope] };
const run = { caseId, arm: "baseline" as const, runId,
  caseSha256: frozen.caseSha256, manifestSha256, userId, knowledgeScope: [...scope],
  status: "failed" as const, answer: "", citations: [], receiptIds: [runId, callId],
  modelCallIds: [], modelId, failureReason: "Synthetic fixture stops before a model request" };
let inserted = false;
try {
  const database = (await admin.query<{ current_database: string }>(
    "select current_database()")).rows[0]?.current_database;
  assert.equal(database, state.database, "Migration connection missed isolated clone");
  const client = await admin.connect();
  try {
    await client.query("begin");
    await client.query(`insert into app_user(id,email,display_name,role,status)
      values($1,$2,'MA24 tool receipt synthetic fixture','member','active')`,
    [userId, `${userId}@example.invalid`]);
    await client.query(`insert into assistant_conversation(id,user_id,title,status)
      values($1,$2,'MA24 tool receipt fixture','deleted')`, [conversationId, userId]);
    await client.query(`insert into agent_run(id,user_id,conversation_id,request_key,
        request_hash,input,model_config,execution_version,execution_kind,execution_spec,status)
      values($1,$2,$3,$4,$5,$6,$7,'ma24-receipt-fixture','main-agent-evaluation',$8,'failed')`,
    [runId, userId, conversationId, runId, "b".repeat(64),
      JSON.stringify({ content: query, knowledgeScope: scope, attachments: [],
        requestKey: runId, mode: "standard" }), JSON.stringify({ model: modelId }),
      JSON.stringify({ schema: "ma24-evaluation-run-v1", manifestSha256,
        caseId, arm: "baseline" })]);
    await client.query(`insert into agent_tool_call(id,user_id,run_id,call_key,tool_id,
        tool_version,input_hash,input,effect,status,output)
      values($1,$2,$3,$4,'company_read','1',$5,$6,'read','completed',$7)`,
    [callId, userId, runId, `ma24-receipt-${callId}`, digest(callInput),
      JSON.stringify(callInput), JSON.stringify({ status: "success", data: { fixture: true } })]);
    await client.query("commit");
    inserted = true;
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }

  const verify = (receiptIds = run.receiptIds) =>
    verifyMa24PersistedRunBinding(frozen, query, { ...run, receiptIds });
  assert.deepEqual((await verify()).modelCallIds, []);
  const exportInput = { case: frozen, query, arm: run.arm, runId, manifestSha256,
    citations: [] };
  assert.deepEqual(await exportMa24PersistedRun(exportInput), { ...run,
    failureReason: "Persisted task failed; no reason recorded" });
  await assert.rejects(verify([runId, callId, inventedId]), /persisted receipt list mismatch/);
  await assert.rejects(verify([runId]), /persisted receipt list mismatch/);
  await admin.query("update agent_tool_call set status='started' where id=$1 and user_id=$2",
    [callId, userId]);
  await assert.rejects(verify(), /persisted receipt list mismatch/);
  await assert.rejects(exportMa24PersistedRun(exportInput), /persisted receipt list mismatch/);
  await admin.query("update agent_tool_call set status='completed' where id=$1 and user_id=$2",
    [callId, userId]);
  await admin.query("update agent_tool_call set input_hash=$3 where id=$1 and user_id=$2",
    [callId, userId, "0".repeat(64)]);
  await assert.rejects(verify(), /persisted receipt list mismatch/);
  await admin.query("update agent_tool_call set input_hash=$3 where id=$1 and user_id=$2",
    [callId, userId, digest(callInput)]);
  await admin.query("update agent_tool_call set effect='send' where id=$1 and user_id=$2",
    [callId, userId]);
  await assert.rejects(verify(), /persisted receipt list mismatch/);
  await admin.query("update agent_tool_call set effect='read' where id=$1 and user_id=$2",
    [callId, userId]);
  assert.deepEqual((await verify()).modelCallIds, []);
  assert.deepEqual((await exportMa24PersistedRun(exportInput)).receiptIds, [runId, callId]);
  const count = (await admin.query<{ count: string }>(
    "select count(*)::text as count from agent_tool_call where run_id=$1 and effect='model'",
    [runId])).rows[0]?.count;
  assert.equal(count, "0", "Synthetic fixture made a model call");
} finally {
  if (inserted) {
    const client = await admin.connect();
    try {
      await client.query("begin");
      const owner = await client.query(`select id from app_user where id=$1
        and display_name='MA24 tool receipt synthetic fixture'
        and email=id::text||'@example.invalid' for update`, [userId]);
      assert.equal(owner.rowCount, 1, "Synthetic owner identity changed");
      await client.query("delete from agent_tool_call where id=$1 and user_id=$2", [callId, userId]);
      await client.query("delete from agent_run where id=$1 and user_id=$2", [runId, userId]);
      await client.query("delete from assistant_conversation where id=$1 and user_id=$2",
        [conversationId, userId]);
      await client.query("delete from app_user where id=$1", [userId]);
      await client.query("commit");
    } catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
    const residual = (await admin.query<{ users: string; conversations: string;
      runs: string; calls: string }>(`select
      (select count(*)::text from app_user where id=$1) as users,
      (select count(*)::text from assistant_conversation where id=$2) as conversations,
      (select count(*)::text from agent_run where id=$3) as runs,
      (select count(*)::text from agent_tool_call where id=$4) as calls`,
    [userId, conversationId, runId, callId])).rows[0];
    assert.deepEqual(residual, { users: "0", conversations: "0", runs: "0", calls: "0" },
      "Synthetic receipt fixture rows remained");
  }
  await admin.end();
  await getPool().end();
}
console.log(JSON.stringify({ schema: "ma24-g16-tool-receipts-clone-v1",
  isolatedClone: true, checks: ["valid-read-receipt", "invented-rejected",
    "omitted-rejected", "started-rejected", "input-hash-drift-rejected",
    "write-effect-rejected", "restored-read-receipt", "export-valid-receipt",
    "export-started-rejected", "synthetic-rows-cleaned"],
  providerCalls: 0, realDualArmRuns: 0 }));
