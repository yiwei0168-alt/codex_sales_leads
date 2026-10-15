import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { getPool } from '../../rag/db';
import { currentSpendContext, withMa24EvaluationSpend } from '../../billing/context';
import { currentStagePaidCallOverride } from '../../billing/stage-paid-call-override';
import { digest, type ExecutionContext, type ModelMessage,
  type ModelToolCall, type ToolResult } from '../../assistant/main/contracts';
import { buildMainAgentGraph, durableModel, MainAgentState } from '../../assistant/main/graph';
import { initialTaskMessages } from '../../assistant/main/initial-task-messages';
import { dispatchTool } from '../../assistant/main/executor';
import { boundary, finishRun, heartbeat } from '../../assistant/main/repository';
import { modeModelConfig } from '../../assistant/main/mode-config';
import { loadDecisionMemory } from '../../assistant/main/memory-context';
import { assertCurrentKnowledgeMessages } from '../../assistant/main/knowledge-message-guard';
import { assertCurrentSkillMessages } from '../../assistant/main/skill-message-guard';
import { assertCurrentMemoryMessages, withCurrentDecisionMemory } from '../../assistant/main/memory-message-guard';
import { claimAndBindMa24EvaluationRun, loadCurrentMa24G15Preview } from './ma24-evaluation-claim';
import { verifyMa24EvaluationTaskBinding } from './ma24-evaluation-task-binding';
import { requireMa24G15ModelReady } from './ma24-g15-runtime-binding';
import { verifyMa24EvaluationHardLimit } from './ma24-g15-hard-limit-binding';
import { ma24ManifestSha256 } from './ma24-independent-comparison';
import { assertBgeServiceReady } from '../../rag/bge-client';

type EvaluationInput = Parameters<typeof claimAndBindMa24EvaluationRun>[0];

/** Keep the explicit worker's 90-second lease alive during a long provider call. */
export function startMa24EvaluationHeartbeat(context: ExecutionContext,
  renew: typeof heartbeat = heartbeat, intervalMs = 20_000) {
  let failure: Error | null = null;
  let pending = Promise.resolve();
  const timer = setInterval(() => {
    if (failure) return;
    pending = pending.then(async () => {
      if (!await renew(context)) throw new Error('MA24 evaluation lease lost');
    }).catch(error => {
      failure ??= error instanceof Error ? error : new Error('MA24 evaluation heartbeat failed');
    });
  }, intervalMs);
  timer.unref();
  return {
    assertHealthy() { if (failure) throw failure; },
    async stop() { clearInterval(timer); await pending; },
  };
}

/** MA24 evaluation must use the frozen, reviewed financial path rather than a stage bypass. */
export function assertMa24EvaluationSpendBoundary(userId: string, runId: string) {
  const spend = currentSpendContext();
  if (spend?.tariffPolicy || spend?.fixedFxReferenceVersion ||
    (spend?.ma24EvaluationRunId && spend.ma24EvaluationRunId !== runId) ||
    currentStagePaidCallOverride(userId))
    throw new Error('MA24 evaluation financial override unavailable');
}

/** Refuse all model work until the current G15 preview admits paid evaluation. */
export function assertMa24EvaluationModelReady() {
  const loaded = loadCurrentMa24G15Preview();
  return requireMa24G15ModelReady(loaded, loaded, new Date().toISOString().slice(0, 10));
}

/** A degraded knowledge search cannot count as the frozen BGE baseline. */
export function assertMa24EvaluationBaselineToolResult(call: ModelToolCall,
  outcome: ToolResult): ToolResult {
  if (call.function.name !== 'execute_tool') return outcome;
  let input: unknown;
  try { input = JSON.parse(call.function.arguments); } catch { return outcome; }
  if (input && typeof input === 'object' && 'tool' in input &&
    input.tool === 'knowledge_search' && outcome.status === 'partial')
    throw new Error('MA24 evaluation baseline knowledge_search degraded');
  return outcome;
}

/** Dedicated G16 entry: frozen admission, hidden conversation, shared Agent graph, durable journals. */
export async function executeMa24EvaluationRun(input: EvaluationInput) {
  const entry = input.manifest.cases.find(item => item.caseId === input.caseId);
  if (!entry) throw new Error('MA24 evaluation case absent from frozen manifest');
  assertMa24EvaluationSpendBoundary(entry.userId, input.runId);
  const initialPreview = assertMa24EvaluationModelReady(); // Before a lease or any provider request.
  await assertBgeServiceReady();
  const manifestSha256 = ma24ManifestSha256(input.manifest);
  await verifyMa24EvaluationHardLimit({ userId: entry.userId, runId: input.runId,
    manifestSha256, preview: initialPreview });
  const admitted = await claimAndBindMa24EvaluationRun(input);
  const context: ExecutionContext = { userId: admitted.userId, runId: admitted.id,
    leaseToken: admitted.lease_token, role: 'member', mode: 'standard',
    knowledgeScope: admitted.knowledgeScope, evaluationArm: admitted.arm };
  const lease = startMa24EvaluationHeartbeat(context);
  const revalidate = async () => {
    lease.assertHealthy();
    assertMa24EvaluationSpendBoundary(admitted.userId, admitted.id);
    const loadedCodeAndConfig = assertMa24EvaluationModelReady();
    await assertBgeServiceReady();
    await verifyMa24EvaluationHardLimit({ userId: admitted.userId, runId: admitted.id,
      manifestSha256, preview: loadedCodeAndConfig });
    await verifyMa24EvaluationTaskBinding({ ...input,
      leaseToken: admitted.lease_token, loadedCodeAndConfig,
      nowUtcDate: new Date().toISOString().slice(0, 10),
      loadedModelConfig: modeModelConfig('standard') });
  };
  try {
    await revalidate();
    const run = await boundary(context);
    const validateEvidence = async (messages: ModelMessage[]) => {
      await revalidate();
      await assertCurrentSkillMessages(context, messages);
      await assertCurrentMemoryMessages(context.userId, messages);
      await assertCurrentKnowledgeMessages(context.userId, messages, context.knowledgeScope);
    };
    const graph = buildMainAgentGraph({
      validateEvidence,
      boundary: async () => {
        await revalidate();
        return { ...await boundary(context),
          policyRevision: digest(await loadDecisionMemory(context.userId)) };
      },
      model: async (messages, step, revision) => {
        await revalidate();
        return withCurrentDecisionMemory(context.userId, () =>
          durableModel(context, messages, step, revision, run.model_config));
      },
      tool: async (call, instructionIds) => {
        await revalidate();
        return assertMa24EvaluationBaselineToolResult(call,
          await dispatchTool(call, { ...context, instructionIds }));
      },
    }, new PostgresSaver(getPool(), undefined, { schema: 'langgraph' }));
    const config = { configurable: { thread_id: `ma24-evaluation:${context.userId}:${context.runId}`,
      checkpoint_ns: '' }, recursionLimit: 400 };
    const snapshot = await graph.getState(config);
    if (snapshot.createdAt)
      throw new Error('MA24 evaluation checkpoint requires manual reconciliation before resume');
    const initial: Partial<typeof MainAgentState.State> = {
      messages: initialTaskMessages(context, run.input, run.model_config, []),
      pending: [], steps: 0, seen: {}, instructionIds: [], decisionRevision: 0,
      policyRevision: '', status: 'running', reply: '',
    };
    const final = await withMa24EvaluationSpend(context.userId, context.runId,
      () => graph.invoke(initial, config));
    if (final.status !== 'completed') {
      await lease.stop();
      lease.assertHealthy();
      await finishRun(context, 'failed', 'MA24 evaluation execution did not complete');
      return { status: 'failed' as const, runId: context.runId };
    }
    await validateEvidence(final.messages);
    await lease.stop();
    lease.assertHealthy();
    await finishRun(context, 'completed', final.reply);
    return { status: 'completed' as const, runId: context.runId };
  } catch (error) {
    await lease.stop();
    try { await finishRun(context, 'failed', 'MA24 evaluation execution failed'); }
    catch (settlementError) {
      throw new AggregateError([error, settlementError],
        'MA24 evaluation execution and failure settlement both failed');
    }
    throw error;
  }
}
