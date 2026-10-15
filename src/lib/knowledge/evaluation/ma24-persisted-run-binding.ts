import { createHash } from "node:crypto";
import { tenantTransaction } from "../../rag/db";
import { stableJson } from "../review-types";
import { ma24CaseQuerySha256, type Ma24Arm, type Ma24Case, type Ma24Run } from "./ma24-independent-comparison";
import type { GoldSourceCoordinate } from "../review-types";
import { digest } from "../../assistant/main/contracts";
import { auditModelProtocol } from "../../assistant/main/model-protocol-audit";
import { assertMa24CitationEvidence, type Ma24EvidenceCall } from "./ma24-citation-evidence";

type PersistedRun = {
  id: string; user_id: string; status: string; execution_kind: string;
  input: unknown; execution_spec: unknown; model_config: unknown; result: unknown;
};
type PersistedModelCall = {
  id: string; user_id: string; run_id: string; tool_id: string;
  effect: string; status: string; input: unknown; input_hash: string; output: unknown;
};
type PersistedCall = Pick<PersistedModelCall,
  "id" | "user_id" | "run_id" | "effect" | "status" | "input" | "input_hash">;

function savedModelAnswer(output: unknown): string | undefined {
  const receipt = output as Record<string, unknown> | null;
  if (receipt?.status !== "success") return undefined;
  const data = receipt.data as Record<string, unknown> | undefined;
  const selected = (data?.value ?? data) as Record<string, unknown> | undefined;
  const message = selected?.message as Record<string, unknown> | undefined;
  if (message?.role !== "assistant" || typeof message.content !== "string" ||
    (Array.isArray(message.tool_calls) && message.tool_calls.length > 0)) return undefined;
  return message.content;
}

function modelVisibleSourceCalls(call: PersistedModelCall, evidenceCalls: Ma24EvidenceCall[]): Ma24EvidenceCall[] {
  const input = call.input as { messages?: unknown } | null;
  if (!Array.isArray(input?.messages)) return [];
  const sourceById = new Map(evidenceCalls.map(source => [source.id, source]));
  return input.messages.flatMap(message => {
    if (!message || typeof message !== "object" ||
      (message as { role?: unknown }).role !== "tool" ||
      typeof (message as { content?: unknown }).content !== "string") return [];
    try {
      const output = JSON.parse((message as { content: string }).content) as { callId?: unknown };
      const source = typeof output?.callId === "string" ? sourceById.get(output.callId) : undefined;
      return source && stableJson(output) === stableJson(source.output) ? [source] : [];
    } catch { return []; }
  });
}

/** Checks database rows, not fields copied from an evaluation run file. */
export function assertMa24PersistedRunBinding(input: {
  case: Ma24Case; query: string; run: Ma24Run;
  task: PersistedRun | undefined; modelCalls: PersistedModelCall[]; evidenceCalls: Ma24EvidenceCall[];
  allCalls: PersistedCall[];
}) {
  const { case: frozen, query, run, task, modelCalls, evidenceCalls, allCalls } = input;
  const taskInput = task?.input as Record<string, unknown> | undefined;
  const taskSpec = task?.execution_spec as Record<string, unknown> | undefined;
  const modelConfig = task?.model_config as Record<string, unknown> | undefined;
  const result = task?.result as Record<string, unknown> | undefined;
  if (ma24CaseQuerySha256(query) !== frozen.caseSha256 || run.caseId !== frozen.caseId ||
    run.caseSha256 !== frozen.caseSha256 || run.userId !== frozen.userId ||
    stableJson(run.knowledgeScope) !== stableJson(frozen.knowledgeScope))
    throw new Error(`MA24 frozen case drift ${run.caseId}:${run.arm}`);
  if (!task || task.id !== run.runId || task.user_id !== frozen.userId ||
    task.execution_kind !== "main-agent-evaluation" ||
    taskSpec?.schema !== "ma24-evaluation-run-v1" ||
    taskSpec.manifestSha256 !== run.manifestSha256 || taskSpec.caseId !== run.caseId ||
    taskSpec.arm !== run.arm || Object.keys(taskSpec).sort().join(",") !== "arm,caseId,manifestSha256,schema" ||
    taskInput?.content !== query ||
    stableJson(taskInput.knowledgeScope) !== stableJson(frozen.knowledgeScope) ||
    !Array.isArray(taskInput.attachments) || taskInput.attachments.length !== 0 ||
    taskInput.conversationId !== undefined ||
    modelConfig?.model !== run.modelId ||
    (run.status === "completed" ? task.status !== "completed" || result?.reply !== run.answer :
      task.status !== "failed" || run.status !== "failed"))
    throw new Error(`MA24 persisted task mismatch ${run.caseId}:${run.arm}`);
  const scopeRule = `Search and cite only these selected knowledge collections: ${frozen.knowledgeScope.join(", ")}.`;
  if (!Array.isArray(run.modelCallIds) ||
    (run.status === "completed" && !modelCalls.some(call => savedModelAnswer(call.output) === run.answer)) ||
    stableJson(modelCalls.map(call => call.id).sort()) !== stableJson([...run.modelCallIds].sort()) ||
    modelCalls.some(call => {
      const savedInput = call.input as Record<string, unknown> | undefined;
      const messages = savedInput?.messages;
      return call.user_id !== frozen.userId || call.run_id !== run.runId ||
        call.tool_id !== "main_model" || call.effect !== "model" || call.status !== "completed" ||
        !["success", "unavailable"].includes((call.output as Record<string, unknown> | null)?.status as string) ||
        call.input_hash !== digest(call.input) || !Array.isArray(messages) ||
        !messages.some(message => message?.role === "user" && message.content === query) ||
        !messages.some(message => message?.role === "system" &&
          typeof message.content === "string" && message.content.includes(scopeRule));
    }))
    throw new Error(`MA24 persisted model journal mismatch ${run.caseId}:${run.arm}`);
  const savedCallIds = new Set(allCalls.map(call => call.id));
  const receiptIds = new Set(run.receiptIds);
  if (savedCallIds.size !== allCalls.length ||
    receiptIds.size !== run.receiptIds.length ||
    allCalls.some(call => !receiptIds.has(call.id) ||
      call.user_id !== frozen.userId || call.run_id !== run.runId ||
      call.status !== "completed" || call.input_hash !== digest(call.input) ||
      !["read", "model"].includes(call.effect)) ||
    run.receiptIds.some(id => id !== task.id && !savedCallIds.has(id)) ||
    [...modelCalls, ...evidenceCalls].some(call => !savedCallIds.has(call.id)))
    throw new Error(`MA24 persisted receipt list mismatch ${run.caseId}:${run.arm}`);
  const wireManifests = modelCalls.flatMap(call => {
    if ((call.output as Record<string, unknown> | null)?.status !== "success") return [];
    const audit = auditModelProtocol(call);
    if (!audit.bound || audit.model !== run.modelId)
      throw new Error(`MA24 saved model wire manifest mismatch ${run.caseId}:${run.arm}`);
    return [{ callId: call.id, requestHash: audit.requestHash,
      provider: audit.provider, generationId: audit.generationId }];
  });
  if (new Set(wireManifests.map(item => `${item.provider}:${item.generationId}`)).size !== wireManifests.length)
    throw new Error(`MA24 duplicate provider generation ${run.caseId}:${run.arm}`);
  const citationEvidence = assertMa24CitationEvidence({ userId: frozen.userId, runId: run.runId,
    citations: run.citations, receiptIds: run.receiptIds, calls: evidenceCalls });
  if (run.citations.length && !modelCalls.some(call => {
    if (savedModelAnswer(call.output) !== run.answer) return false;
    try {
      assertMa24CitationEvidence({ userId: frozen.userId, runId: run.runId,
        citations: run.citations, receiptIds: run.receiptIds,
        calls: modelVisibleSourceCalls(call, evidenceCalls) });
      return true;
    } catch { return false; }
  })) throw new Error(`MA24 citation absent from final model input ${run.caseId}:${run.arm}`);
  return {
    runId: run.runId, userId: task.user_id,
    taskSha256: createHash("sha256").update(stableJson(task)).digest("hex"),
    modelCallIds: modelCalls.map(call => call.id).sort(),
    wireManifests,
    ...citationEvidence,
  };
}

/** Tenant scoped, read-only lookup of the persisted main Agent run and model-call journal. */
export async function verifyMa24PersistedRunBinding(frozen: Ma24Case, query: string, run: Ma24Run) {
  return tenantTransaction(frozen.userId, async client => {
    const rows = await loadPersistedRunRows(client, frozen.userId, run.runId);
    return assertMa24PersistedRunBinding({ case: frozen, query, run, ...rows });
  });
}

type QueryClient = Parameters<Parameters<typeof tenantTransaction>[1]>[0];
async function loadPersistedRunRows(client: QueryClient, userId: string, runId: string) {
  const task = (await client.query<PersistedRun>(
      `select id,user_id,status,execution_kind,execution_spec,input,model_config,result
       from agent_run where id=$1 and user_id=$2`, [runId, userId])).rows[0];
  const modelCalls = (await client.query<PersistedModelCall>(
      `select id,user_id,run_id,tool_id,effect,status,input,input_hash,output from agent_tool_call
       where run_id=$1 and user_id=$2 and tool_id='main_model' and effect='model' order by id`,
      [runId, userId])).rows;
  const evidenceCalls = (await client.query<Ma24EvidenceCall>(
      `select id,user_id,run_id,tool_id,effect,status,input,input_hash,output from agent_tool_call
       where run_id=$1 and user_id=$2 and tool_id in ('knowledge_search','vectorless_read') order by id`,
      [runId, userId])).rows;
  const allCalls = (await client.query<PersistedCall>(
      `select id,user_id,run_id,effect,status,input,input_hash
       from agent_tool_call where run_id=$1 and user_id=$2 order by id`,
      [runId, userId])).rows;
  return { task, modelCalls, evidenceCalls, allCalls };
}

type ExportInput = { case: Ma24Case; query: string; arm: Ma24Arm; runId: string;
  manifestSha256: string; citations: GoldSourceCoordinate[] };

/** Derive factual fields from saved rows and verify the complete binding before export. */
export function deriveMa24PersistedRun(input: ExportInput,
  rows: Awaited<ReturnType<typeof loadPersistedRunRows>>): Ma24Run {
  const { case: frozen, query, arm, runId, manifestSha256, citations } = input;
  const task = rows.task;
  const result = task?.result as Record<string, unknown> | undefined;
  const modelConfig = task?.model_config as Record<string, unknown> | undefined;
  if (!task || !["completed", "failed"].includes(task.status) ||
    typeof modelConfig?.model !== "string" || !modelConfig.model.trim() ||
    (task.status === "completed" && (typeof result?.reply !== "string" || !result.reply.trim())) ||
    (task.status === "failed" && citations.length))
    throw new Error(`MA24 run is not exportable ${frozen.caseId}:${arm}`);
  const run: Ma24Run = {
    caseId: frozen.caseId, arm, runId, caseSha256: frozen.caseSha256,
    manifestSha256, userId: frozen.userId, knowledgeScope: frozen.knowledgeScope,
    status: task.status as "completed" | "failed",
    answer: task.status === "completed" ? result!.reply as string : "",
    citations, receiptIds: [runId, ...rows.allCalls.map(call => call.id)],
    modelCallIds: rows.modelCalls.map(call => call.id), modelId: modelConfig.model,
    ...(task.status === "failed" ? { failureReason: typeof result?.reply === "string" && result.reply.trim()
      ? result.reply : "Persisted task failed; no reason recorded" } : {}),
  };
  assertMa24PersistedRunBinding({ case: frozen, query, run, ...rows });
  return run;
}

/** Build a scoreable run from saved rows; only citation coordinates come from the reviewer. */
export async function exportMa24PersistedRun(input: ExportInput) {
  return tenantTransaction(input.case.userId, async client => {
    const rows = await loadPersistedRunRows(client, input.case.userId, input.runId);
    return deriveMa24PersistedRun(input, rows);
  });
}
