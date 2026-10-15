import { createHash } from "node:crypto";
import { tenantTransaction } from "../../rag/db";
import { stableJson } from "../review-types";
import { ma24CaseQuerySha256, type Ma24Case, type Ma24Run } from "./ma24-independent-comparison";
import { digest } from "../../assistant/main/contracts";

type PersistedRun = {
  id: string; user_id: string; status: string; execution_kind: string;
  input: unknown; model_config: unknown; result: unknown;
};
type PersistedModelCall = {
  id: string; user_id: string; run_id: string; tool_id: string;
  effect: string; status: string; input: unknown; input_hash: string;
};

/** Checks database rows, not fields copied from an evaluation run file. */
export function assertMa24PersistedRunBinding(input: {
  case: Ma24Case; query: string; run: Ma24Run;
  task: PersistedRun | undefined; modelCalls: PersistedModelCall[];
}) {
  const { case: frozen, query, run, task, modelCalls } = input;
  const taskInput = task?.input as Record<string, unknown> | undefined;
  const modelConfig = task?.model_config as Record<string, unknown> | undefined;
  const result = task?.result as Record<string, unknown> | undefined;
  if (ma24CaseQuerySha256(query) !== frozen.caseSha256 || run.caseId !== frozen.caseId ||
    run.caseSha256 !== frozen.caseSha256 || run.userId !== frozen.userId ||
    stableJson(run.knowledgeScope) !== stableJson(frozen.knowledgeScope))
    throw new Error(`MA24 frozen case drift ${run.caseId}:${run.arm}`);
  if (!task || task.id !== run.runId || task.user_id !== frozen.userId ||
    task.execution_kind !== "main-agent" || taskInput?.content !== query ||
    stableJson(taskInput.knowledgeScope) !== stableJson(frozen.knowledgeScope) ||
    (taskInput.attachments !== undefined &&
      (!Array.isArray(taskInput.attachments) || taskInput.attachments.length !== 0)) ||
    taskInput.conversationId !== undefined ||
    modelConfig?.model !== run.modelId ||
    (run.status === "completed" ? task.status !== "completed" || result?.reply !== run.answer :
      task.status !== "failed" || run.status !== "failed"))
    throw new Error(`MA24 persisted task mismatch ${run.caseId}:${run.arm}`);
  const scopeRule = `Search and cite only these selected knowledge collections: ${frozen.knowledgeScope.join(", ")}.`;
  if (!Array.isArray(run.modelCallIds) || (run.status === "completed" && !modelCalls.length) ||
    stableJson(modelCalls.map(call => call.id).sort()) !== stableJson([...run.modelCallIds].sort()) ||
    modelCalls.some(call => {
      const savedInput = call.input as Record<string, unknown> | undefined;
      const messages = savedInput?.messages;
      return call.user_id !== frozen.userId || call.run_id !== run.runId ||
        call.tool_id !== "main_model" || call.effect !== "model" || call.status !== "completed" ||
        call.input_hash !== digest(call.input) || !Array.isArray(messages) ||
        !messages.some(message => message?.role === "user" && message.content === query) ||
        !messages.some(message => message?.role === "system" &&
          typeof message.content === "string" && message.content.includes(scopeRule));
    }))
    throw new Error(`MA24 persisted model journal mismatch ${run.caseId}:${run.arm}`);
  return {
    runId: run.runId, userId: task.user_id,
    taskSha256: createHash("sha256").update(stableJson(task)).digest("hex"),
    modelCallIds: modelCalls.map(call => call.id).sort(),
  };
}

/** Tenant scoped, read-only lookup of the persisted main Agent run and model-call journal. */
export async function verifyMa24PersistedRunBinding(frozen: Ma24Case, query: string, run: Ma24Run) {
  return tenantTransaction(frozen.userId, async client => {
    const task = (await client.query<PersistedRun>(
      `select id,user_id,status,execution_kind,input,model_config,result
       from agent_run where id=$1 and user_id=$2`, [run.runId, frozen.userId])).rows[0];
    const modelCalls = (await client.query<PersistedModelCall>(
      `select id,user_id,run_id,tool_id,effect,status,input,input_hash from agent_tool_call
       where run_id=$1 and user_id=$2 and tool_id='main_model' and effect='model' order by id`,
      [run.runId, frozen.userId])).rows;
    return assertMa24PersistedRunBinding({ case: frozen, query, run, task, modelCalls });
  });
}
