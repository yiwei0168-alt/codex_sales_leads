import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
process.env.LANGCHAIN_TRACING_V2 = "false";
process.env.LANGSMITH_TRACING = "false";
process.env.PRODUCT_FINANCIAL_POLICY = "observe";
const stateFile = "tmp/ma11-replay-state.json";
const batchFile = "tmp/ma11-batch-state.json";
const reportFile = "tmp/ma11-batch-report.json";
type SourceCase = { kind: string; userId: string; sourceId: string; task: string };
type BatchCase = { id: string; userId: string; runId: string; sourceKind: string; purpose: string };
type BatchState = { manifestHash: string; database: string; cases: BatchCase[] };
const source = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
if (!source) throw new Error("Local database configuration required");
const url = new URL(source);
if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) throw new Error("MA11 Batch verification requires a local isolated database clone");
const replayState = JSON.parse(await readFile(stateFile, "utf8")) as { database: string; manifestHash: string; cleaned?: boolean };
if (replayState.cleaned || !/^ma11_replay_[a-f0-9]{12}$/.test(replayState.database)) throw new Error("Prepare a fresh MA11 isolated clone first");
url.pathname = `/${replayState.database}`;
process.env.DATABASE_URL = url.toString();
process.env.DATABASE_MIGRATION_URL = url.toString();
const [{ enqueueRun, getRun }, { tenantQuery, getPool }, { executeMainAgentRun }, { defaultModelConfig }, { pollDueModelBatch }] = await Promise.all([
  import("../src/lib/assistant/main/repository"), import("../src/lib/rag/db"), import("../src/lib/assistant/main/graph"),
  import("../src/lib/assistant/main/product"), import("../src/lib/assistant/main/model-batch") ]);
const model = defaultModelConfig();
assert.equal(model.model, "z-ai/glm-5.3:batch");
assert.deepEqual(model.providers, ["fireworks"]);

async function start() {
  if (!process.argv.includes("--allow-private-provider-data")) throw new Error("Explicit private account data transfer authorization flag required for OpenRouter/Fireworks GLM Batch");
  const previous = await readFile(batchFile, "utf8").then(JSON.parse).catch(() => null);
  if (previous) throw new Error("Eight-case Batch state already exists; poll or inspect it instead of resubmitting");
  const manifest = JSON.parse(await readFile("tmp/ma11-replay-manifest.json", "utf8")) as { manifestHash: string; cases: SourceCase[] };
  assert.equal(manifest.manifestHash, replayState.manifestHash);
  const one = (kind: string) => { const item = manifest.cases.find(row => row.kind === kind); assert(item, `Missing ${kind} source`); return item; };
  const knowledge = one("knowledge"), mail = one("mail"), company = one("company"), draft = one("draft"), task = one("task");
  assert.equal(knowledge.userId, mail.userId);
  assert.equal(company.userId, mail.userId);
  assert.equal(draft.userId, mail.userId);
  const missingId = `ma11-missing-${randomUUID()}`;
  const proposals = [
    { source: knowledge, purpose: "single-knowledge", text: knowledge.task },
    { source: mail, purpose: "single-mail", text: mail.task },
    { source: company, purpose: "single-company", text: company.task },
    { source: company, purpose: "multi-company-assessment", text: `Read saved company ${company.sourceId} and its most recent formal assessment policy version. If no assessment exists, state the missing record. Do not rescore.` },
    { source: task, purpose: "task-receipt", text: task.task },
    { source: draft, purpose: "multi-draft-mailbox", text: `Read saved draft ${draft.sourceId} and list this account's mailbox connection states. Do not send or edit.` },
    { source: company, purpose: "missing-assessment", text: `Check whether saved formal assessment exists for company ${missingId}. State exactly what is missing; do not generate a score.` },
    { source: mail, purpose: "partial-mail-read", text: `Read saved message ${mail.sourceId} and also message ${randomUUID()}. Report which saved record exists and which is missing; do not send.` },
  ];
  const state: BatchState = { manifestHash: replayState.manifestHash, database: replayState.database, cases: [] };
  await writeFile(batchFile, JSON.stringify(state, null, 2));
  for (let index = 0; index < proposals.length; index++) {
    const item = proposals[index];
    const run = await enqueueRun(item.source.userId, { content: item.text, requestKey: `ma11-glm-${randomUUID()}`, attachments: [] }, model);
    await tenantQuery(item.source.userId, "update agent_run set execution_version='ma11-batch-verifier' where user_id=$1 and id=$2", [item.source.userId, run.id]);
    state.cases.push({ id: `MA11-B${index + 1}`, userId: item.source.userId, runId: run.id, sourceKind: item.source.kind, purpose: item.purpose });
    await writeFile(batchFile, JSON.stringify(state, null, 2));
    const token = randomUUID();
    await tenantQuery(item.source.userId, "update agent_run set status='running',lease_token=$3,lease_until=now()+interval '5 minutes' where user_id=$1 and id=$2", [item.source.userId, run.id, token]);
    await executeMainAgentRun(item.source.userId, run.id, token);
    const jobs = await tenantQuery<{ status: string }>(item.source.userId, "select status from agent_model_batch where user_id=$1 and run_id=$2", [item.source.userId, run.id]);
    if (!jobs.some(job => job.status === "pending" || job.status === "completed")) {
      console.log(JSON.stringify({ stoppedAfter: state.cases.length, reason: "First configured Batch admission did not persist a usable remote receipt; no repeated submissions" }));
      break;
    }
  }
  await report(state);
}

async function poll() {
  if (!process.argv.includes("--allow-private-provider-data")) throw new Error("Explicit private account data transfer authorization flag required before resuming model turns");
  const state = JSON.parse(await readFile(batchFile, "utf8")) as BatchState;
  assert.equal(state.database, replayState.database);
  assert.equal(state.manifestHash, replayState.manifestHash);
  const permitted = new Set(["discover_tools", "describe_tool", "knowledge_library_list", "mail_read", "company_read", "company_assessment_read", "task_detail", "draft_read", "mail_connections"]);
  for (const item of state.cases) {
    const jobs = await tenantQuery<{ id: string; status: string }>(item.userId,
      "select id,status from agent_model_batch where user_id=$1 and run_id=$2 order by submitted_at", [item.userId, item.runId]);
    for (const job of jobs) if (job.status === "pending") await pollDueModelBatch(job.id);
    const run = await getRun(item.userId, item.runId);
    if (!run || run.status !== "queued") continue;
    const outputs = await tenantQuery<{ output: { data?: { message?: { tool_calls?: Array<{ function: { name: string; arguments: string } }> } } } }>(item.userId,
      "select output from agent_tool_call where user_id=$1 and run_id=$2 and tool_id='main_model' and status='completed' order by created_at", [item.userId, item.runId]);
    let unsafe = false;
    for (const row of outputs) for (const call of row.output?.data?.message?.tool_calls ?? []) {
      if (call.function.name === "execute_tool") {
        let tool = "";
        try { tool = JSON.parse(call.function.arguments).tool; } catch { /* reject below */ }
        if (!permitted.has(tool)) unsafe = true;
      } else if (!permitted.has(call.function.name)) unsafe = true;
    }
    if (unsafe) {
      await tenantQuery(item.userId, "update agent_run set status='cancelled',control='cancel' where user_id=$1 and id=$2", [item.userId, item.runId]);
      continue;
    }
    const token = randomUUID();
    await tenantQuery(item.userId, "update agent_run set status='running',lease_token=$3,lease_until=now()+interval '5 minutes' where user_id=$1 and id=$2 and status='queued'", [item.userId, item.runId, token]);
    await executeMainAgentRun(item.userId, item.runId, token);
  }
  await report(state);
}

async function reconcileAdmission() {
  const state = JSON.parse(await readFile(batchFile, "utf8")) as BatchState;
  assert.equal(state.database, replayState.database);
  const unknown = [];
  for (const item of state.cases) {
    const rows = await tenantQuery<{ id: string; model: string; custom_id: string; submitted_at: string }>(item.userId,
      "select id,model,custom_id,submitted_at from agent_model_batch where user_id=$1 and run_id=$2 and status='unknown' and remote_id is null", [item.userId, item.runId]);
    for (const row of rows) unknown.push({ item, ...row });
  }
  if (!unknown.length) { console.log(JSON.stringify({ status: "no-unknown-admissions" })); return; }
  const { getOpenRouterConfig, openRouterRequestHeaders } = await import("../src/providers/openrouter");
  const { matchesBatchModel, readOpenRouterBatch } = await import("../src/providers/openrouter-batch");
  const route = getOpenRouterConfig();
  const observations = [];
  for (const row of unknown) {
    const submitted = Math.floor(new Date(row.submitted_at).getTime() / 1000);
    try {
      const response = await fetch(`${route.baseUrl}/batches?limit=100&created_after=${submitted - 2}&created_before=${submitted + 30}`,
        { headers: openRouterRequestHeaders(route), signal: AbortSignal.timeout(30_000), redirect: "error" });
      if (!response.ok) { observations.push({ id: row.item.id, status: `read-http-${response.status}` }); continue; }
      const body = await response.json() as { data?: Array<{ id: string; model: string; request_counts: { total: number } }> };
      const candidates = (body.data ?? []).filter(batch => matchesBatchModel(batch.model, row.model) && batch.request_counts?.total === 1);
      if (candidates.length !== 1) { observations.push({ id: row.item.id, status: "identity-ambiguous", candidateCount: candidates.length,
        listedCount: body.data?.length ?? null, listShape: Object.keys(body).sort() }); continue; }
      const batch = await readOpenRouterBatch(candidates[0].id);
      const exact = batch.results?.some(result => result.custom_id === row.custom_id) ?? false;
      observations.push({ id: row.item.id, status: exact ? "exact-remote-result-found" : "remote-identity-still-unproven",
        providerStatus: batch.status, matchedCustomId: exact });
    } catch {
      observations.push({ id: row.item.id, status: "provider-read-unavailable" });
    }
  }
  console.log(JSON.stringify({ mode: "read-only-admission-reconciliation", noNewSubmissions: true, observations }));
}

async function report(state: BatchState) {
  const cases = [];
  for (const item of state.cases) {
    const run = await getRun(item.userId, item.runId);
    const batches = await tenantQuery<{ status: string; provider_status: string; poll_count: number; http_latency_ms: string }>(item.userId,
      "select status,provider_status,poll_count,http_latency_ms from agent_model_batch where user_id=$1 and run_id=$2 order by submitted_at", [item.userId, item.runId]);
    const calls = await tenantQuery<{ tool_id: string; status: string; output: { status?: string; receipt?: string; data?: unknown } | null; metrics: Record<string, unknown> }>(item.userId,
      "select tool_id,status,output,metrics from agent_tool_call where user_id=$1 and run_id=$2 order by created_at", [item.userId, item.runId]);
    const modelCalls = calls.filter(call => call.tool_id === "main_model");
    const unknownCostCalls = modelCalls.filter(call => call.metrics.costUsd == null).length;
    const modelSelections = modelCalls.flatMap(call => {
      const message = (call.output?.data as { message?: { tool_calls?: Array<{ function: { name: string; arguments: string } }> } } | undefined)?.message;
      return (message?.tool_calls ?? []).map(choice => {
        if (choice.function.name !== "execute_tool") return choice.function.name;
        try { return `execute_tool:${JSON.parse(choice.function.arguments).tool}`; } catch { return "execute_tool:invalid-arguments"; }
      });
    });
    cases.push({ id: item.id, purpose: item.purpose, runId: item.runId, status: run?.status ?? "missing",
      modelTurns: calls.filter(call => call.tool_id === "main_model").length,
      modelSelections,
      selectedTools: calls.filter(call => call.tool_id !== "main_model").map(call => ({ tool: call.tool_id, status: call.output?.status ?? call.status, receipt: Boolean(call.output?.receipt) })),
      batches, inputTokens: calls.reduce((n, call) => n + (Number(call.metrics.inputTokens) || 0), 0),
      outputTokens: calls.reduce((n, call) => n + (Number(call.metrics.outputTokens) || 0), 0),
      knownReportedCostUsd: modelCalls.reduce((n, call) => n + (Number(call.metrics.costUsd) || 0), 0),
      costComplete: unknownCostCalls === 0,
      unknownCostCalls,
      latencyMs: calls.reduce((n, call) => n + (Number(call.metrics.latencyMs) || 0), 0) });
  }
  const output = { mode: "actual-configured-glm-batch-isolated-data", manifestHash: state.manifestHash,
    submittedTasks: state.cases.length, completedTasks: cases.filter(row => row.status === "completed").length, cases };
  await writeFile(reportFile, JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output));
}

try {
  if (process.argv.includes("--start")) await start();
  else if (process.argv.includes("--poll")) await poll();
  else if (process.argv.includes("--reconcile")) await reconcileAdmission();
  else throw new Error("Specify --start, --poll or --reconcile");
} finally { await getPool().end(); }
