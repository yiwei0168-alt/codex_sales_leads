/** Isolated local DB acceptance for explicit MA24 evaluation claims; no model calls. */
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
const { claimMa24EvaluationRun } = await import(
  "../src/lib/knowledge/evaluation/ma24-evaluation-claim");
const { getPool } = await import("../src/lib/rag/db");
const admin = new Pool({ connectionString: adminUrl });
const app = new Pool({ connectionString: appUrl });
const userId = randomUUID(), conversationId = randomUUID();
const evaluationId = randomUUID(), ordinaryId = randomUUID(), malformedId = randomUUID();
let inserted = false;
try {
  const kind = (await admin.query<{ definition: string }>(
    `select pg_get_constraintdef(oid) as definition from pg_constraint
     where conname='agent_run_execution_kind_check'`)).rows[0]?.definition;
  assert(kind?.includes("main-agent-evaluation"), "Clone must have migration 136");
  const migration = await readFile("db/migrations/137_ma24_explicit_evaluation_claim.sql", "utf8");
  await admin.query(migration);
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
      has_function_privilege(current_user,'claim_ma24_evaluation_run(uuid,text)','EXECUTE') as allowed`)).rows[0];
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
    claimMa24EvaluationRun(runId, worker);
  assert.equal(await claim(ordinaryId), null, "Ordinary task was claimed");
  assert.equal(await claim(malformedId), null, "Malformed evaluation task was claimed");
  await assert.rejects(claim(evaluationId, " "), /claim identity required/);
  assert.equal((await appQuery("select * from claim_ma24_evaluation_run($1,$2)",
    [evaluationId, " "])).rowCount, 0, "Blank worker claimed task in SQL");
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
  console.log(JSON.stringify({ schema: "ma24-g16-explicit-claim-clone-v1",
    checks: ["explicit-id-only", "ordinary-rejected", "malformed-rejected",
      "blank-worker-rejected", "duplicate-claim-rejected", "expired-lease-not-reclaimed",
      "app-role-grant"],
    providerCalls: 0 }));
} finally {
  if (inserted) {
    const client = await admin.connect();
    try {
      await client.query("begin");
      const owner = await client.query(`select id from app_user where id=$1
        and display_name='MA24 explicit claim synthetic fixture'
        and email=id::text||'@example.invalid' for update`, [userId]);
      assert.equal(owner.rowCount, 1, "Synthetic owner identity changed");
      await client.query("delete from agent_run where user_id=$1 and id=any($2::uuid[])",
        [userId, [evaluationId, ordinaryId, malformedId]]);
      await client.query("delete from assistant_conversation where user_id=$1 and id=$2",
        [userId, conversationId]);
      await client.query("delete from app_user where id=$1", [userId]);
      await client.query("commit");
      const residual = (await admin.query<{ users: string; conversations: string; runs: string }>(`
        select (select count(*)::text from app_user where id=$1) as users,
          (select count(*)::text from assistant_conversation where id=$2) as conversations,
          (select count(*)::text from agent_run where id=any($3::uuid[])) as runs`,
      [userId, conversationId, [evaluationId, ordinaryId, malformedId]])).rows[0];
      assert.deepEqual(residual, { users: "0", conversations: "0", runs: "0" },
        "Synthetic evaluation claim rows remained");
    } catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
  }
  await app.end();
  await admin.end();
  await getPool().end();
}
