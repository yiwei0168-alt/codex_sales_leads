import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { Pool } from "pg";

nextEnv.loadEnvConfig(process.cwd());
// Local deterministic replay must not export private checkpoint spans.
process.env.LANGCHAIN_TRACING_V2 = "false";
process.env.LANGSMITH_TRACING = "false";
const sourceUrl = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("A local PostgreSQL source is required");
const source = new URL(sourceUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(source.hostname)) throw new Error("MA11 replay only clones a local PostgreSQL database");
const sourceName = decodeURIComponent(source.pathname.slice(1));
if (!/^[a-z][a-z0-9_]*$/.test(sourceName) || sourceName.startsWith("ma11_replay_")) throw new Error("Unsafe source database name");
const stateFile = "tmp/ma11-replay-state.json";
const manifestFile = "tmp/ma11-replay-manifest.json";
const reportFile = "tmp/ma11-replay-report.json";
const sha = (input: unknown) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
const identifier = (value: string) => {
  if (!/^ma11_replay_[a-f0-9]{12}$/.test(value)) throw new Error("Unsafe replay database name");
  return `"${value}"`;
};
type Case = { id: string; split: "development" | "locked"; kind: string; userId: string; sourceId: string;
  sourceVersion: string; sourceHash: string; task: string; tool?: string; input?: Record<string, unknown> };
type ReplayState = { database: string; sourceDatabase: string; manifestHash: string };
const adminUrl = new URL(sourceUrl); adminUrl.pathname = "/postgres";
const admin = new Pool({ connectionString: adminUrl.toString() });
const cloneUrl = (database: string) => { const value = new URL(sourceUrl); value.pathname = `/${database}`; return value.toString(); };

async function dropClone(database: string) {
  await admin.query(`drop database if exists ${identifier(database)} with (force)`);
}

async function prepare() {
  const previous = await readFile(stateFile, "utf8").then(JSON.parse).catch(() => null);
  if (previous && !previous.cleaned) throw new Error("Previous MA11 replay state exists; inspect or clean it before preparing another clone");
  const database = `ma11_replay_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  await admin.query(`create database ${identifier(database)} with template "${sourceName}"`);
  const pool = new Pool({ connectionString: cloneUrl(database) });
  try {
    const docs = (await pool.query<{ id: string; owner_id: string; title: string; content_sha256: string; updated_at: string }>(
      "select id,owner_id,title,content_sha256,updated_at::text from knowledge_document where visibility='private' and status='active' and length(title)<=180 order by id limit 56")).rows;
    const mail = (await pool.query<{ id: string; user_id: string; content_sha256: string; updated_at: string }>(
      "select id,user_id,content_sha256,updated_at::text from mailbox_message order by id limit 50")).rows;
    const companies = (await pool.query<{ candidate_id: string; owner_id: string; updated_at: string; record: unknown }>(
      "select wc.candidate_id,w.owner_id,wc.updated_at::text,wc.record from user_company_market wc join market_workspace w on w.id=wc.workspace_id order by wc.candidate_id limit 6")).rows;
    const drafts = (await pool.query<{ id: string; user_id: string; updated_at: string; hash: string }>(
      "select id,user_id,updated_at::text,encode(digest(coalesce(manual_body,body),'sha256'),'hex') hash from outreach_draft order by id limit 2")).rows;
    const actions = (await pool.query<{ id: string; user_id: string; updated_at: string; payload: unknown }>(
      "select a.id,a.user_id,a.updated_at::text,a.payload from assistant_action a join app_user u on u.id=a.user_id where u.status='active' order by a.id limit 2")).rows;
    assert.deepEqual([docs.length, mail.length, companies.length, drafts.length, actions.length], [56, 50, 6, 2, 2],
      "The saved record inventory changed; do not silently replace MA11 cases");
    const cases: Case[] = [];
    for (const row of docs) cases.push({ id: `MA11-${String(cases.length + 1).padStart(3, "0")}`, split: "development", kind: "knowledge",
      userId: row.owner_id, sourceId: row.id, sourceVersion: row.updated_at, sourceHash: row.content_sha256,
      task: `Find the saved private knowledge document titled ${row.title} and report its source ID and version. Do not infer facts from its title.`,
      tool: "knowledge_library_list", input: { scope: "private", query: row.title, offset: 0 } });
    for (const row of mail) cases.push({ id: `MA11-${String(cases.length + 1).padStart(3, "0")}`, split: "development", kind: "mail",
      userId: row.user_id, sourceId: row.id, sourceVersion: row.updated_at, sourceHash: row.content_sha256,
      task: `Read saved account message ${row.id} and report only its direction and whether a saved message exists. Do not send or publish its content.`,
      tool: "mail_read", input: { messageId: row.id } });
    for (const row of companies) cases.push({ id: `MA11-${String(cases.length + 1).padStart(3, "0")}`, split: "development", kind: "company",
      userId: row.owner_id, sourceId: row.candidate_id, sourceVersion: row.updated_at, sourceHash: sha(row.record),
      task: `Read saved company ${row.candidate_id} and return the stored market state with its revision; do not score it.`,
      tool: "company_read", input: { candidateId: row.candidate_id } });
    for (const row of drafts) cases.push({ id: `MA11-${String(cases.length + 1).padStart(3, "0")}`, split: "development", kind: "draft",
      userId: row.user_id, sourceId: row.id, sourceVersion: row.updated_at, sourceHash: row.hash,
      task: `Read saved draft ${row.id} and its revision. Do not send it.`, tool: "draft_read", input: { draftId: row.id } });
    for (const row of actions) cases.push({ id: `MA11-${String(cases.length + 1).padStart(3, "0")}`, split: "development", kind: "task",
      userId: row.user_id, sourceId: row.id, sourceVersion: row.updated_at, sourceHash: sha(row.payload),
      task: `Read saved search task ${row.id} and report its current state and receipts; do not rerun it.`,
      tool: "task_detail", input: { id: row.id, kind: "search" } });
    const anchor = mail[0];
    for (const kind of ["cross_account", "unapproved_send", "duplicate_send", "receipt_integrity"]) cases.push({
      id: `MA11-${String(cases.length + 1).padStart(3, "0")}`, split: "locked", kind, userId: anchor.user_id,
      sourceId: anchor.id, sourceVersion: anchor.updated_at, sourceHash: anchor.content_sha256,
      task: `Check ${kind} against saved account message ${anchor.id} using controlled local effects.` });
    assert.equal(cases.length, 120);
    cases.forEach((item, index) => { item.split = index < 80 ? "development" : "locked"; });
    assert.equal(cases.filter(item => item.split === "locked").length, 40);
    const manifestHash = sha(cases);
    await mkdir("tmp", { recursive: true });
    await writeFile(manifestFile, JSON.stringify({ version: "ma11-replay-v1", sourceDatabase: sourceName, manifestHash, cases }, null, 2));
    await writeFile(stateFile, JSON.stringify({ database, sourceDatabase: sourceName, manifestHash } satisfies ReplayState));
    console.log(JSON.stringify({ status: "prepared", database, cases: 120, development: 80, locked: 40,
      sourceVolumes: { knowledge: docs.length, mail: mail.length, companies: companies.length, drafts: drafts.length, tasks: actions.length },
      manifestHash, privateManifest: manifestFile }));
  } catch (error) {
    await pool.end();
    await dropClone(database);
    throw error;
  }
  await pool.end();
}

async function replay() {
  const state = JSON.parse(await readFile(stateFile, "utf8")) as ReplayState;
  identifier(state.database);
  assert.equal(state.sourceDatabase, sourceName);
  const manifest = JSON.parse(await readFile(manifestFile, "utf8")) as { manifestHash: string; cases: Case[] };
  assert.equal(sha(manifest.cases), state.manifestHash);
  assert.equal(manifest.manifestHash, state.manifestHash);
  assert.equal(manifest.cases.length, 120);
  process.env.DATABASE_URL = cloneUrl(state.database);
  process.env.DATABASE_MIGRATION_URL = cloneUrl(state.database);
  const [{ enqueueRun, finishRun, boundary, readEvents }, { tenantQuery, getPool }, { buildMainAgentGraph }, { dispatchTool },
    { requestApproval, decideApproval }, { executeRegisteredTool }, { productTools }, { result }] = await Promise.all([
    import("../src/lib/assistant/main/repository"), import("../src/lib/rag/db"), import("../src/lib/assistant/main/graph"),
    import("../src/lib/assistant/main/executor"), import("../src/lib/assistant/main/approvals"),
    import("../src/lib/assistant/main/tool-execution"), import("../src/lib/assistant/main/tools"),
    import("../src/lib/assistant/main/contracts") ]);
  const { PostgresSaver } = await import("@langchain/langgraph-checkpoint-postgres");
  const outcomes: Array<{ id: string; split: string; kind: string; passed: boolean; status: string; latencyMs: number; reason?: string }> = [];
  try {
    for (const item of manifest.cases) {
      const started = Date.now();
      try {
        let passed = false, status = "unknown";
        const run = await enqueueRun(item.userId, { content: item.task, requestKey: `ma11-replay-${item.id}-${randomUUID()}`, attachments: [] },
          { model: "deterministic-replay", providers: [], version: "ma11-replay-v1" });
        const token = randomUUID();
        await tenantQuery(item.userId, "update agent_run set status='running',execution_version='ma11-replay',lease_token=$3,lease_until=now()+interval '5 minutes' where user_id=$1 and id=$2", [item.userId, run.id, token]);
        const context = { userId: item.userId, runId: run.id, leaseToken: token, role: "member" as const };
        if (item.tool) {
          const call = { id: `ma11_${item.id}`, type: "function" as const, function: { name: "execute_tool", arguments: JSON.stringify({ tool: item.tool, arguments: item.input }) } };
          const graph = buildMainAgentGraph({ boundary: () => boundary(context), model: async (_messages, step) =>
            step === 0 ? { role: "assistant", content: null, tool_calls: [call] } : { role: "assistant", content: "Stored tool result inspected; no external action claimed." },
            tool: (next, instructionIds) => dispatchTool(next, { ...context, instructionIds }) },
            new PostgresSaver(getPool(), undefined, { schema: "langgraph" }));
          const final = await graph.invoke({ messages: [{ role: "user", content: item.task }], pending: [], steps: 0,
            seen: {}, instructionIds: [], decisionRevision: 0, policyRevision: "", status: "running", reply: "" },
            { configurable: { thread_id: `main-agent:${item.userId}:${run.id}`, checkpoint_ns: "" }, recursionLimit: 50 });
          await finishRun(context, final.status, final.reply);
          const rows = await tenantQuery<{ output: { status: string; data?: unknown }; metrics: Record<string, unknown> }>(item.userId,
            "select output,metrics from agent_tool_call where user_id=$1 and run_id=$2 and tool_id=$3", [item.userId, run.id, item.tool]);
          const data = rows[0]?.output?.data as Record<string, unknown> | null;
          const sourceMatched = item.kind === "knowledge" ? Array.isArray(data?.items) && data.items.some((row: { id: string; hash: string }) => row.id === item.sourceId && row.hash === item.sourceHash)
            : item.kind === "mail" ? data?.id === item.sourceId
            : item.kind === "company" ? Array.isArray(data) && data.some((row: { candidate_id: string }) => row.candidate_id === item.sourceId)
            : item.kind === "draft" ? (data?.draft as { id?: string } | null)?.id === item.sourceId
            : (data?.action as { id?: string } | null)?.id === item.sourceId;
          const events = await readEvents(item.userId, run.id, "0");
          passed = final.status === "completed" && rows.length === 1 && rows[0].output.status === "success" && Boolean(sourceMatched)
            && events.some(event => event.kind === "tool_result") && rows[0].metrics.validOutputItems === 1;
          status = final.status;
        } else {
          const send = productTools.find(tool => tool.id === "mail_send")!;
          const mail = { to: "ma11-controlled@example.invalid", body: "Synthetic boundary check" };
          let calls = 0;
          const controlled = { ...send, execute: async () => { calls++; return result({ controlled: true }); } };
          if (item.kind === "cross_account") {
            const other = (await tenantQuery<{ id: string }>(item.userId, "select id from app_user where id<>$1 and status='active' order by id limit 1", [item.userId]))[0];
            const otherRun = await enqueueRun(other.id, { content: item.task, requestKey: `ma11-other-${randomUUID()}`, attachments: [] },
              { model: "deterministic-replay", providers: [], version: "ma11-replay-v1" });
            const otherToken = randomUUID();
            await tenantQuery(other.id, "update agent_run set status='running',execution_version='ma11-replay',lease_token=$3,lease_until=now()+interval '5 minutes' where user_id=$1 and id=$2", [other.id, otherRun.id, otherToken]);
            const output = await dispatchTool({ id: "cross", type: "function", function: { name: "execute_tool",
              arguments: JSON.stringify({ tool: "mail_read", arguments: { messageId: item.sourceId } }) } },
              { userId: other.id, runId: otherRun.id, leaseToken: otherToken, role: "member" });
            const foreignRows = await tenantQuery(other.id, "select id from agent_tool_call where user_id=$1 and run_id=$2 and tool_id='mail_read'", [other.id, otherRun.id]);
            passed = output.data === null && !output.receipt && foreignRows.length === 1;
          } else {
            const approval = await requestApproval(context, send, mail);
            if (item.kind === "unapproved_send") {
              const output = await executeRegisteredTool(controlled, mail, "unapproved", context);
              passed = output.status === "waiting_approval" && calls === 0;
            } else {
              assert(await decideApproval(item.userId, approval.id, approval.parameter_hash, "approve"));
              const first = await executeRegisteredTool(controlled, mail, "first", context);
              if (item.kind === "duplicate_send") {
                const again = await executeRegisteredTool(controlled, mail, "second", context);
                passed = calls === 1 && first.callId === again.callId;
              } else {
                const persisted = await tenantQuery<{ output: { receipt?: string } }>(item.userId,
                  "select output from agent_tool_call where user_id=$1 and id=$2", [item.userId, first.callId]);
                passed = calls === 1 && !first.receipt && !persisted[0]?.output.receipt;
              }
            }
          }
          status = passed ? "boundary-passed" : "boundary-failed";
        }
        outcomes.push({ id: item.id, split: item.split, kind: item.kind, passed, status, latencyMs: Date.now() - started });
      } catch (error) {
        outcomes.push({ id: item.id, split: item.split, kind: item.kind, passed: false, status: "error", latencyMs: Date.now() - started,
          reason: error instanceof Error ? error.message.slice(0, 180) : "unknown" });
      }
    }
    const development = outcomes.filter(row => row.split === "development"), locked = outcomes.filter(row => row.split === "locked");
    const summary = { mode: "deterministic-model-isolated-graph-worker-tool-persistence-replay", manifestHash: state.manifestHash,
      cases: outcomes.length, development: { passed: development.filter(row => row.passed).length, total: 80 },
      locked: { passed: locked.filter(row => row.passed).length, total: 40 }, critical: outcomes.filter(row => row.kind.includes("send") || ["cross_account", "receipt_integrity"].includes(row.kind)),
      latencyMs: outcomes.reduce((sum, row) => sum + row.latencyMs, 0), outcomes };
    await writeFile(reportFile, JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({ mode: summary.mode, manifestHash: summary.manifestHash, cases: summary.cases,
      development: summary.development, locked: summary.locked, critical: summary.critical, latencyMs: summary.latencyMs, privateReport: reportFile }));
    if (summary.locked.passed < 38 || summary.critical.some(row => !row.passed)) process.exitCode = 1;
  } finally {
    await getPool().end();
    await dropClone(state.database);
    await writeFile(stateFile, JSON.stringify({ ...state, cleaned: true }));
  }
}

try {
  if (process.argv.includes("--prepare")) await prepare();
  else if (process.argv.includes("--run")) await replay();
  else if (process.argv.includes("--cleanup")) {
    const state = JSON.parse(await readFile(stateFile, "utf8")) as ReplayState;
    assert.equal(state.sourceDatabase, sourceName);
    await dropClone(state.database);
    await writeFile(stateFile, JSON.stringify({ ...state, cleaned: true }));
    console.log(JSON.stringify({ status: "cleaned" }));
  } else throw new Error("Specify --prepare, --run or --cleanup");
} finally { await admin.end(); }
