import { beforeEach, expect, it, vi } from 'vitest';
import type { MainGraphDependencies } from '../../assistant/main/graph';
import type { ModelMessage } from '../../assistant/main/contracts';

const mocks = vi.hoisted(() => ({
  preview: vi.fn(), claim: vi.fn(), binding: vi.fn(), verify: vi.fn(),
  boundary: vi.fn(), finish: vi.fn(), buildGraph: vi.fn(), model: vi.fn(),
  spend: vi.fn(), pool: vi.fn(), memory: vi.fn(), availableTools: vi.fn(),
  dispatch: vi.fn(), skillGuard: vi.fn(), memoryGuard: vi.fn(), knowledgeGuard: vi.fn(),
}));
vi.mock('@langchain/langgraph-checkpoint-postgres', () => ({
  PostgresSaver: class PostgresSaver {},
}));
vi.mock('../../rag/db', () => ({ getPool: mocks.pool }));
vi.mock('../../billing/context', () => ({ withProductSpend: mocks.spend }));
vi.mock('../../assistant/main/graph', () => ({
  buildMainAgentGraph: mocks.buildGraph, durableModel: mocks.model, MainAgentState: {},
}));
vi.mock('../../assistant/main/tools', () => ({ availableTools: mocks.availableTools }));
vi.mock('../../assistant/main/executor', () => ({ dispatchTool: mocks.dispatch }));
vi.mock('../../assistant/main/repository', () => ({
  boundary: mocks.boundary, finishRun: mocks.finish,
}));
vi.mock('../../assistant/main/memory-context', () => ({ loadDecisionMemory: mocks.memory }));
vi.mock('../../assistant/main/knowledge-message-guard', () => ({
  assertCurrentKnowledgeMessages: mocks.knowledgeGuard,
}));
vi.mock('../../assistant/main/skill-message-guard', () => ({
  assertCurrentSkillMessages: mocks.skillGuard,
}));
vi.mock('../../assistant/main/memory-message-guard', () => ({
  assertCurrentMemoryMessages: mocks.memoryGuard,
  withCurrentDecisionMemory: (_userId: string, run: () => unknown) => run(),
}));
vi.mock('./ma24-evaluation-claim', () => ({
  loadCurrentMa24G15Preview: mocks.preview,
  claimAndBindMa24EvaluationRun: mocks.claim,
}));
vi.mock('./ma24-evaluation-task-binding', () => ({
  verifyMa24EvaluationTaskBinding: mocks.verify,
}));
vi.mock('./ma24-g15-runtime-binding', () => ({
  assertMa24G15RuntimeBinding: mocks.binding,
}));

import { executeMa24EvaluationRun } from './ma24-evaluation-runner';

const userId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const leaseToken = '33333333-3333-4333-8333-333333333333';
const input = { manifest: { cases: [] },
  sourceSetBytes: new TextEncoder().encode('frozen question bytes'),
  goldBytes: new TextEncoder().encode('PRIVATE_GOLD_SENTINEL'),
  codeAndConfigBytes: new TextEncoder().encode('frozen config bytes'),
  runId, caseId: 'case-1', arm: 'baseline', workerId: 'synthetic-worker' } as unknown as
  Parameters<typeof executeMa24EvaluationRun>[0];
const task = { execution_kind: 'main-agent-evaluation', control: null, instructions: [],
  input: { content: 'What does the source say?', requestKey: 'synthetic-key',
    attachments: [], knowledgeScope: ['product'], mode: 'standard' },
  model_config: { model: 'synthetic-model', providers: [], version: 'v1' } };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.preview.mockReturnValue({ schema: 'ma24-g15-config-preview-v1' });
  mocks.binding.mockReturnValue({ runtimeBindingMatched: true,
    readyForModelCalls: true, missing: [] });
  mocks.claim.mockResolvedValue({ id: runId, lease_token: leaseToken,
    userId, caseId: 'case-1', arm: 'baseline', query: task.input.content,
    knowledgeScope: ['product'] });
  mocks.verify.mockResolvedValue({ userId, caseId: 'case-1' });
  mocks.boundary.mockResolvedValue(task);
  mocks.memory.mockResolvedValue([]);
  mocks.model.mockResolvedValue({ role: 'assistant', content: 'Synthetic answer' });
  mocks.availableTools.mockReturnValue([]);
  mocks.spend.mockImplementation((_userId: string, _stage: string, run: () => Promise<unknown>) => run());
});

it('refuses an unready paid evaluation before claiming a persisted task', async () => {
  mocks.binding.mockReturnValue({ runtimeBindingMatched: true,
    readyForModelCalls: false, missing: ['Gold not frozen', 'paid call authorization not confirmed'] });
  await expect(executeMa24EvaluationRun(input))
    .rejects.toThrow('MA24 evaluation model admission unavailable');
  expect(mocks.claim).not.toHaveBeenCalled();
});

it('passes only the question into the shared graph and settles a synthetic completion', async () => {
  mocks.buildGraph.mockImplementation((deps: MainGraphDependencies) => ({
    getState: async () => ({ values: {} }),
    invoke: async (initial: { messages: ModelMessage[] }) => {
      expect(JSON.stringify(initial)).not.toContain('PRIVATE_GOLD_SENTINEL');
      expect(initial.messages.some(message => message.role === 'user' &&
        message.content === task.input.content)).toBe(true);
      await deps.boundary();
      await deps.validateEvidence?.(initial.messages);
      const response = await deps.model(initial.messages, 0, 0);
      return { status: 'completed', reply: response.content,
        messages: [...initial.messages, response] };
    },
  }));
  await expect(executeMa24EvaluationRun(input)).resolves.toEqual({ status: 'completed', runId });
  expect(mocks.spend).toHaveBeenCalledWith(userId, 'main-agent-evaluation',
    expect.any(Function), runId);
  expect(mocks.model).toHaveBeenCalledOnce();
  expect(mocks.verify.mock.calls.length).toBeGreaterThan(2);
  expect(mocks.finish).toHaveBeenCalledWith(expect.objectContaining({
    userId, runId, leaseToken, evaluationArm: 'baseline', knowledgeScope: ['product'],
  }), 'completed', 'Synthetic answer');
});

it('does not replay a checkpoint with existing messages', async () => {
  const invoke = vi.fn();
  mocks.buildGraph.mockReturnValue({
    getState: async () => ({ values: { messages: [{ role: 'user', content: 'old' }] } }),
    invoke,
  });
  await expect(executeMa24EvaluationRun(input))
    .rejects.toThrow('MA24 evaluation checkpoint requires manual reconciliation');
  expect(invoke).not.toHaveBeenCalled();
  expect(mocks.model).not.toHaveBeenCalled();
  expect(mocks.finish).toHaveBeenCalledWith(expect.any(Object), 'failed',
    'MA24 evaluation execution failed');
});

it('settles a partial graph outcome as a failed evaluation run', async () => {
  mocks.buildGraph.mockReturnValue({
    getState: async () => ({ values: {} }),
    invoke: async () => ({ status: 'partial', reply: 'Incomplete synthetic answer',
      messages: [] }),
  });
  await expect(executeMa24EvaluationRun(input)).resolves.toEqual({ status: 'failed', runId });
  expect(mocks.finish).toHaveBeenCalledWith(expect.any(Object), 'failed',
    'MA24 evaluation execution did not complete');
  expect(mocks.finish).not.toHaveBeenCalledWith(expect.any(Object), 'completed',
    expect.any(String));
});
