import { tenantTransaction } from "../../rag/db";
import type { AgentRun, ModelConfig } from "../../assistant/main/contracts";
import { stableJson } from "../review-types";
import { assertMa24FrozenSnapshotBytes, assertMa24SourceSetMatchesManifest, ma24ManifestSha256,
  type Ma24FrozenManifest, type Ma24SourceSetSnapshot } from "./ma24-independent-comparison";

type EvaluationTask = Pick<AgentRun, "id" | "user_id" | "status" | "input" |
  "model_config" | "execution_kind" | "execution_spec" | "lease_token"> & {
    lease_until: Date | string | null;
  };

/** Binds a leased evaluation task to frozen question bytes before a dedicated runner uses it. */
export function assertMa24EvaluationTaskBinding(input: {
  manifest: Ma24FrozenManifest;
  sourceSetBytes: Uint8Array;
  goldBytes: Uint8Array;
  codeAndConfigBytes: Uint8Array;
  task: EvaluationTask;
  runId: string;
  leaseToken: string;
  caseId: string;
  arm: "baseline" | "candidate";
  loadedModelConfig: ModelConfig;
}) {
  const { manifest, sourceSetBytes, goldBytes, codeAndConfigBytes,
    task, runId, leaseToken, caseId, arm, loadedModelConfig } = input;
  if (manifest.schema !== "ma24-g16-frozen-comparison-v2" ||
    [manifest.sourceSetSha256, manifest.goldSnapshotSha256, manifest.codeAndConfigSha256]
      .some(hash => !/^[0-9a-f]{64}$/.test(hash)))
    throw new Error("MA24 evaluation snapshot hash missing");
  assertMa24FrozenSnapshotBytes(manifest, {
    sourceSet: sourceSetBytes, gold: goldBytes, codeAndConfig: codeAndConfigBytes,
  });
  const sourceSet = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(sourceSetBytes)) as Ma24SourceSetSnapshot;
  assertMa24SourceSetMatchesManifest(manifest, sourceSet);
  const spec = task.execution_spec as Record<string, unknown> | null;
  const entry = manifest.cases.find(item => item.caseId === caseId);
  const question = sourceSet.cases.find(item => item.caseId === caseId);
  const taskInput = task.input;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  if (!entry || !question || !uuid.test(runId) || !uuid.test(leaseToken) ||
    task.id !== runId || task.status !== "running" ||
    task.lease_token !== leaseToken || !task.lease_until ||
    !Number.isFinite(new Date(task.lease_until).getTime()) ||
    new Date(task.lease_until).getTime() <= Date.now() ||
    task.user_id !== entry.userId ||
    task.execution_kind !== "main-agent-evaluation" ||
    spec?.schema !== "ma24-evaluation-run-v1" ||
    spec.caseId !== caseId || spec.arm !== arm ||
    spec.manifestSha256 !== ma24ManifestSha256(manifest) ||
    Object.keys(spec).sort().join(",") !== "arm,caseId,manifestSha256,schema" ||
    taskInput?.content !== question.query || taskInput.conversationId !== undefined ||
    Object.keys(taskInput).sort().join(",") !== "attachments,content,knowledgeScope,mode,requestKey" ||
    !Array.isArray(taskInput.attachments) || taskInput.attachments.length !== 0 ||
    typeof taskInput.requestKey !== "string" || taskInput.requestKey.length < 8 ||
    stableJson(taskInput.knowledgeScope) !== stableJson(entry.knowledgeScope) ||
    taskInput.mode !== "standard" ||
    loadedModelConfig.profile?.mode !== "standard" ||
    !loadedModelConfig.model?.trim() || !loadedModelConfig.version?.trim() ||
    loadedModelConfig.model !== loadedModelConfig.profile.routes[0]?.model ||
    stableJson(task.model_config) !== stableJson(loadedModelConfig))
    throw new Error("MA24 evaluation task does not match frozen input and leased execution");
  return { userId: entry.userId, caseId: entry.caseId,
    arm, query: question.query,
    knowledgeScope: [...entry.knowledgeScope] };
}

/** Read the live leased row under its own tenant before any model request. */
export async function verifyMa24EvaluationTaskBinding(input: Omit<
  Parameters<typeof assertMa24EvaluationTaskBinding>[0], "task">) {
  const entry = input.manifest.cases.find(item => item.caseId === input.caseId);
  if (!entry) throw new Error("MA24 evaluation case absent from frozen manifest");
  return tenantTransaction(entry.userId, async client => {
    const task = (await client.query<EvaluationTask>(
      `select id,user_id,status,lease_token,lease_until,execution_kind,execution_spec,input,model_config
       from agent_run where id=$1 and user_id=$2`, [input.runId, entry.userId])).rows[0];
    if (!task) throw new Error("MA24 evaluation task absent from tenant store");
    return assertMa24EvaluationTaskBinding({ ...input, task });
  });
}
