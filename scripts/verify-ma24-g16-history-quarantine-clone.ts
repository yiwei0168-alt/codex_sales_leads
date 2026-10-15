/** Positive database check for evaluation task admission and ordinary-history quarantine. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { Pool } from "pg";

nextEnv.loadEnvConfig(process.cwd());
const configured = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
assert(configured, "Local PostgreSQL URL required");
const url = new URL(configured);
assert(["localhost", "127.0.0.1", "::1"].includes(url.hostname), "Local PostgreSQL required");
const state = JSON.parse(await readFile("tmp/ma11-replay-state.json", "utf8")) as {
  database: string; cleaned?: boolean;
};
assert(!state.cleaned && /^ma11_replay_[a-f0-9]{12}$/.test(state.database), "Active isolated clone required");
url.pathname = `/${state.database}`;
process.env.DATABASE_URL = url.toString();
process.env.DATABASE_MIGRATION_URL = url.toString();
globalThis.fetch = async () => { throw new Error("External HTTP disabled for MA24 clone acceptance"); };

const { enqueueRun, finishRun, getRun, listRuns, readEvents } = await import("../src/lib/assistant/main/repository");
const { getPool } = await import("../src/lib/rag/db");
const pool = new Pool({ connectionString: url.toString() });
const userId = randomUUID();
const requestKey = `ma24-quarantine-${randomUUID()}`;
const ordinaryKey = `ma24-control-${randomUUID()}`;
const model = { model: "synthetic/model", providers: ["synthetic"], version: "synthetic-v1" };
let evaluationRunId: string | undefined;
let ordinaryRunId: string | undefined;
try {
  assert.equal((await pool.query<{ name: string }>("select current_database() as name")).rows[0]?.name,
    state.database, "Database mismatch");
  const constraint = (await pool.query<{ definition: string }>(
    `select pg_get_constraintdef(oid) as definition from pg_constraint
     where conname='agent_run_execution_kind_check'`
  )).rows[0]?.definition;
  let migrationApplied = false;
  if (!constraint?.includes("main-agent-evaluation")) {
    await pool.query(await readFile("db/migrations/136_ma24_evaluation_run_kind.sql", "utf8"));
    migrationApplied = true;
  }
  await pool.query(`insert into app_user(id,email,display_name,role,status)
    values($1,$2,'MA24 quarantine synthetic fixture','member','active')`,
  [userId, `${userId}@example.invalid`]);

  const evaluation = await enqueueRun(userId, {
    content: "Synthetic question: give the exact source value", requestKey, attachments: [],
    knowledgeScope: ["industry"], mode: "standard",
  }, model, { kind: "main-agent-evaluation", spec: {
    schema: "ma24-evaluation-run-v1", manifestSha256: "a".repeat(64),
    caseId: "synthetic-history-case", arm: "baseline",
  } });
  evaluationRunId = evaluation.id;
  const ordinary = await enqueueRun(userId, {
    content: "Synthetic ordinary control", requestKey: ordinaryKey, attachments: [],
    knowledgeScope: ["industry"], mode: "standard",
  }, model);
  ordinaryRunId = ordinary.id;

  assert.equal(await getRun(userId, evaluation.id), null);
  assert.equal((await getRun(userId, ordinary.id))?.id, ordinary.id);
  const before = await listRuns(userId);
  assert(before.some(run => run.id === ordinary.id));
  assert(!before.some(run => run.id === evaluation.id));
  assert.deepEqual(await readEvents(userId, evaluation.id, "0"), []);
  assert((await readEvents(userId, ordinary.id, "0")).some(event => event.kind === "queued"));

  const leaseToken = randomUUID();
  await pool.query(`update agent_run set status='running',lease_token=$3,
    lease_until=now()+interval '10 minutes' where id=$1 and user_id=$2`,
  [evaluation.id, userId, leaseToken]);
  await finishRun({ userId, runId: evaluation.id, leaseToken, role: "member" },
    "completed", "Synthetic evaluation answer");
  const stored = (await pool.query<{ status: string; title: string; conversation_status: string;
    message_count: string; result: { reply: string } }>(`
    select r.status,r.result,c.title,c.status as conversation_status,
      (select count(*)::text from assistant_message m where m.user_id=r.user_id
        and m.conversation_id=r.conversation_id) as message_count
    from agent_run r join assistant_conversation c on c.id=r.conversation_id
    where r.id=$1 and r.user_id=$2`, [evaluation.id, userId])).rows[0];
  assert.deepEqual({ status: stored.status, reply: stored.result.reply,
    title: stored.title, conversationStatus: stored.conversation_status,
    messageCount: stored.message_count }, {
    status: "completed", reply: "Synthetic evaluation answer",
    title: "MA24 evaluation", conversationStatus: "deleted", messageCount: "0",
  });
  assert.equal(await getRun(userId, evaluation.id), null);
  assert.deepEqual(await readEvents(userId, evaluation.id, "0"), []);
  console.log(JSON.stringify({ schema: "ma24-g16-history-quarantine-clone-v1",
    clone: state.database, migrationApplied, synthetic: true,
    checks: ["evaluation-hidden-conversation", "evaluation-no-ordinary-messages",
      "ordinary-control-visible", "evaluation-detail-list-events-hidden",
      "evaluation-result-persisted"], providerCalls: 0 }));
} finally {
  try {
    await pool.query("begin");
    const owner = (await pool.query<{ id: string }>(`select id from app_user
      where id=$1 and email=$1::text||'@example.invalid'
        and display_name='MA24 quarantine synthetic fixture' for update`, [userId])).rows[0];
    if (owner) {
      const ids = [evaluationRunId, ordinaryRunId].filter((id): id is string => Boolean(id));
      if (ids.length) {
        await pool.query("delete from agent_run_event where user_id=$1 and run_id=any($2::uuid[])", [userId, ids]);
        await pool.query("delete from assistant_message where user_id=$1 and conversation_id in (select conversation_id from agent_run where user_id=$1 and id=any($2::uuid[]))", [userId, ids]);
        await pool.query("delete from agent_run where user_id=$1 and id=any($2::uuid[])", [userId, ids]);
      }
      await pool.query("delete from assistant_conversation where user_id=$1", [userId]);
      await pool.query("delete from app_user where id=$1", [userId]);
    }
    await pool.query("commit");
    const residual = (await pool.query<{ users: string; runs: string }>(`
      select (select count(*)::text from app_user where id=$1) as users,
        (select count(*)::text from agent_run where request_key=any($2::text[])) as runs`,
    [userId, [requestKey, ordinaryKey]])).rows[0];
    assert.deepEqual(residual, { users: "0", runs: "0" }, "Synthetic rows remained after cleanup");
  } catch (error) { await pool.query("rollback"); throw error; }
  finally { await pool.end(); await getPool().end(); }
}
