import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { getPool } from '../../rag/db';
import { withProductSpend } from '../../billing/context';
import { digest, type ExecutionContext, type ModelMessage } from '../../assistant/main/contracts';
import { buildMainAgentGraph, durableModel, MainAgentState } from '../../assistant/main/graph';
import { initialTaskMessages } from '../../assistant/main/initial-task-messages';
import { dispatchTool } from '../../assistant/main/executor';
import { boundary, finishRun } from '../../assistant/main/repository';
import { modeModelConfig } from '../../assistant/main/mode-config';
import { loadDecisionMemory } from '../../assistant/main/memory-context';
import { assertCurrentKnowledgeMessages } from '../../assistant/main/knowledge-message-guard';
import { assertCurrentSkillMessages } from '../../assistant/main/skill-message-guard';
import { assertCurrentMemoryMessages, withCurrentDecisionMemory } from '../../assistant/main/memory-message-guard';
import { claimAndBindMa24EvaluationRun, loadCurrentMa24G15Preview } from './ma24-evaluation-claim';
import { verifyMa24EvaluationTaskBinding } from './ma24-evaluation-task-binding';
import { assertMa24G15RuntimeBinding } from './ma24-g15-runtime-binding';

type EvaluationInput = Parameters<typeof claimAndBindMa24EvaluationRun>[0];

/** Refuse all model work until the current G15 preview admits paid evaluation. */
export function assertMa24EvaluationModelReady() {
  const loaded = loadCurrentMa24G15Preview();
  const gate = assertMa24G15RuntimeBinding(loaded, loaded, new Date().toISOString().slice(0, 10));
  if (!gate.readyForModelCalls)
    throw new Error(`MA24 evaluation model admission unavailable: ${gate.missing.join('; ')}`);
  return loaded;
}

/** Dedicated G16 entry: frozen admission, hidden conversation, shared Agent graph, durable journals. */
export async function executeMa24EvaluationRun(input: EvaluationInput) {
  assertMa24EvaluationModelReady(); // Before a lease or any provider request.
  const admitted = await claimAndBindMa24EvaluationRun(input);
  const context: ExecutionContext = { userId: admitted.userId, runId: admitted.id,
    leaseToken: admitted.lease_token, role: 'member', mode: 'standard',
    knowledgeScope: admitted.knowledgeScope, evaluationArm: admitted.arm };
  const revalidate = async () => {
    const loadedCodeAndConfig = assertMa24EvaluationModelReady();
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
        return dispatchTool(call, { ...context, instructionIds });
      },
    }, new PostgresSaver(getPool(), undefined, { schema: 'langgraph' }));
    const config = { configurable: { thread_id: `ma24-evaluation:${context.userId}:${context.runId}`,
      checkpoint_ns: '' }, recursionLimit: 400 };
    const snapshot = await graph.getState(config);
    if ((snapshot.values as Partial<typeof MainAgentState.State>).messages?.length)
      throw new Error('MA24 evaluation checkpoint requires manual reconciliation before resume');
    const initial: Partial<typeof MainAgentState.State> = {
      messages: initialTaskMessages(context, run.input, run.model_config, []),
      pending: [], steps: 0, seen: {}, instructionIds: [], decisionRevision: 0,
      policyRevision: '', status: 'running', reply: '',
    };
    const final = await withProductSpend(context.userId, 'main-agent-evaluation',
      () => graph.invoke(initial, config), context.runId);
    if (final.status !== 'completed') {
      await finishRun(context, 'failed', 'MA24 evaluation execution did not complete');
      return { status: 'failed' as const, runId: context.runId };
    }
    await validateEvidence(final.messages);
    await finishRun(context, 'completed', final.reply);
    return { status: 'completed' as const, runId: context.runId };
  } catch (error) {
    try { await finishRun(context, 'failed', 'MA24 evaluation execution failed'); }
    catch (settlementError) {
      throw new AggregateError([error, settlementError],
        'MA24 evaluation execution and failure settlement both failed');
    }
    throw error;
  }
}
