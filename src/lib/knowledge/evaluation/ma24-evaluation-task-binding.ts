import { tenantTransaction } from "../../rag/db";
import type { AgentRun, ModelConfig } from "../../assistant/main/contracts";
import { stableJson } from "../review-types";
import { assertMa24G15RuntimeBinding, type Ma24G15Preview } from "./ma24-g15-runtime-binding";
import { assertMa24FrozenSnapshotBytes, assertMa24GoldMatchesManifest,
  assertMa24SourceSetMatchesManifest, ma24ManifestSha256,
  type Ma24FrozenManifest, type Ma24GoldSnapshot,
  type Ma24SourceSetSnapshot } from "./ma24-independent-comparison";
import { assertMa24CorpusSnapshotBytes, assertMa24PermissionGoldControl,
  verifyMa24LiveCorpusAccount, verifyMa24LivePermissionControl } from "./ma24-corpus-snapshot";

type EvaluationTask = Pick<AgentRun, "id" | "user_id" | "status" | "input" |
  "model_config" | "execution_kind" | "execution_spec" | "lease_token" | "conversation_id"> & {
    lease_until: Date | string | null;
  };
type EvaluationConversation = { status: string; message_count: number; run_count: number };

/** Binds a leased evaluation task to frozen question bytes before a dedicated runner uses it. */
export function assertMa24EvaluationTaskBinding(input: {
  manifest: Ma24FrozenManifest;
  sourceSetBytes: Uint8Array;
  goldBytes: Uint8Array;
  codeAndConfigBytes: Uint8Array;
  corpusSnapshotBytes: Uint8Array;
  loadedCodeAndConfig: Ma24G15Preview;
  nowUtcDate: string;
  task: EvaluationTask;
  conversation: EvaluationConversation;
  runId: string;
  leaseToken: string;
  caseId: string;
  arm: "baseline" | "candidate";
  loadedModelConfig: ModelConfig;
}) {
  const { manifest, sourceSetBytes, goldBytes, codeAndConfigBytes, corpusSnapshotBytes,
    loadedCodeAndConfig, nowUtcDate, task, conversation, runId, leaseToken,
    caseId, arm, loadedModelConfig } = input;
  if (manifest.schema !== "ma24-g16-frozen-comparison-v4" ||
    [manifest.sourceSetSha256, manifest.goldSnapshotSha256, manifest.codeAndConfigSha256,
      manifest.corpusSnapshotSha256]
      .some(hash => !/^[0-9a-f]{64}$/.test(hash)))
    throw new Error("MA24 evaluation snapshot hash missing");
  assertMa24FrozenSnapshotBytes(manifest, {
    sourceSet: sourceSetBytes, gold: goldBytes, codeAndConfig: codeAndConfigBytes,
    corpus: corpusSnapshotBytes,
  });
  const corpus = assertMa24CorpusSnapshotBytes(manifest, corpusSnapshotBytes,
    manifest.corpusSnapshotSha256);
  const frozenConfig = JSON.parse(new TextDecoder("utf-8", { fatal: true })
    .decode(codeAndConfigBytes)) as Ma24G15Preview;
  assertMa24G15RuntimeBinding(frozenConfig, loadedCodeAndConfig, nowUtcDate);
  const sourceSet = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(sourceSetBytes)) as Ma24SourceSetSnapshot;
  assertMa24SourceSetMatchesManifest(manifest, sourceSet);
  const gold = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(goldBytes)) as Ma24GoldSnapshot;
  assertMa24GoldMatchesManifest(manifest, gold);
  assertMa24PermissionGoldControl(manifest, corpus, gold);
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
    !conversation || conversation.status !== "deleted" ||
    conversation.message_count !== 0 || conversation.run_count !== 1 ||
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
    stableJson(loadedModelConfig.profile) !== stableJson(loadedCodeAndConfig.modelProfile) ||
    stableJson(task.model_config) !== stableJson(loadedModelConfig))
    throw new Error("MA24 evaluation task does not match frozen input and leased execution");
  return { userId: entry.userId, caseId: entry.caseId,
    arm, query: question.query,
    knowledgeScope: [...entry.knowledgeScope] };
}

/** Read the live leased row under its own tenant before any model request. */
export async function verifyMa24EvaluationTaskBinding(input: Omit<
  Parameters<typeof assertMa24EvaluationTaskBinding>[0], "task" | "conversation">) {
  const entry = input.manifest.cases.find(item => item.caseId === input.caseId);
  if (!entry) throw new Error("MA24 evaluation case absent from frozen manifest");
  const bound = await tenantTransaction(entry.userId, async client => {
    const task = (await client.query<EvaluationTask>(
      `select id,user_id,conversation_id,status,lease_token,lease_until,execution_kind,execution_spec,input,model_config
       from agent_run where id=$1 and user_id=$2`, [input.runId, entry.userId])).rows[0];
    if (!task) throw new Error("MA24 evaluation task absent from tenant store");
    const conversation = (await client.query<EvaluationConversation>(`
      select c.status,
        (select count(*)::integer from assistant_message m
         where m.user_id=c.user_id and m.conversation_id=c.id) as message_count,
        (select count(*)::integer from agent_run r
         where r.user_id=c.user_id and r.conversation_id=c.id) as run_count
      from assistant_conversation c where c.user_id=$1 and c.id=$2`,
    [entry.userId, task.conversation_id])).rows[0];
    return assertMa24EvaluationTaskBinding({ ...input, task, conversation });
  });
  const corpus = assertMa24CorpusSnapshotBytes(input.manifest, input.corpusSnapshotBytes,
    input.manifest.corpusSnapshotSha256);
  await verifyMa24LiveCorpusAccount(corpus, bound.userId, bound.knowledgeScope);
  await verifyMa24LivePermissionControl(input.manifest, corpus, bound.caseId);
  return bound;
}
