import { beforeEach, expect, it, vi } from 'vitest';
import type { MainGraphDependencies } from '../../assistant/main/graph';
import type { ModelMessage } from '../../assistant/main/contracts';

const mocks = vi.hoisted(() => ({
  preview: vi.fn(), claim: vi.fn(), binding: vi.fn(), verify: vi.fn(),
  boundary: vi.fn(), finish: vi.fn(), buildGraph: vi.fn(), model: vi.fn(),
  spend: vi.fn(), pool: vi.fn(), memory: vi.fn(), availableTools: vi.fn(),
  spendContext: vi.fn(), financialOverride: vi.fn(),
  hardLimit: vi.fn(),
  dispatch: vi.fn(), skillGuard: vi.fn(), memoryGuard: vi.fn(), knowledgeGuard: vi.fn(),
}));
vi.mock('@langchain/langgraph-checkpoint-postgres', () => ({
  PostgresSaver: class PostgresSaver {},
}));
vi.mock('../../rag/db', () => ({ getPool: mocks.pool }));
vi.mock('../../billing/context', () => ({ withMa24EvaluationSpend: mocks.spend,
  currentSpendContext: mocks.spendContext }));
vi.mock('../../billing/stage-paid-call-override', () => ({
  currentStagePaidCallOverride: mocks.financialOverride,
}));
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
vi.mock('./ma24-g15-hard-limit-binding', () => ({
  verifyMa24EvaluationHardLimit: mocks.hardLimit,
}));

import { executeMa24EvaluationRun } from './ma24-evaluation-runner';

const userId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const leaseToken = '33333333-3333-4333-8333-333333333333';
const input = { manifest: { cases: [{ caseId: 'case-1', userId }] },
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
  mocks.hardLimit.mockResolvedValue({});
  mocks.boundary.mockResolvedValue(task);
  mocks.memory.mockResolvedValue([]);
  mocks.model.mockResolvedValue({ role: 'assistant', content: 'Synthetic answer' });
  mocks.availableTools.mockReturnValue([]);
  mocks.spend.mockImplementation((_userId: string, _stage: string, run: () => Promise<unknown>) => run());
  mocks.spendContext.mockReturnValue(undefined);
  mocks.financialOverride.mockReturnValue(null);
});

it('rejects stage financial bypass or inherited tariff overrides before claiming', async () => {
  mocks.financialOverride.mockReturnValueOnce({ ruleId: 'MA05', allowFinancialAdmissionBypass: true });
  await expect(executeMa24EvaluationRun(input))
    .rejects.toThrow('MA24 evaluation financial override unavailable');
  expect(mocks.claim).not.toHaveBeenCalled();
  expect(mocks.hardLimit).not.toHaveBeenCalled();
  mocks.spendContext.mockReturnValue({ tariffPolicy: { version: 'unfrozen', rules: [] } });
  await expect(executeMa24EvaluationRun(input))
    .rejects.toThrow('MA24 evaluation financial override unavailable');
  expect(mocks.claim).not.toHaveBeenCalled();
});

it('rejects an inherited fixed FX reference before claiming or running the graph', async () => {
  mocks.spendContext.mockReturnValue({ fixedFxReferenceVersion: 'synthetic-fx-v1' });
  await expect(executeMa24EvaluationRun(input))
    .rejects.toThrow('MA24 evaluation financial override unavailable');
  expect(mocks.claim).not.toHaveBeenCalled();
  expect(mocks.buildGraph).not.toHaveBeenCalled();
  expect(mocks.model).not.toHaveBeenCalled();
});

it('rejects an inherited spend scope for another evaluation run before claiming', async () => {
  mocks.spendContext.mockReturnValue({ ma24EvaluationRunId:
    '44444444-4444-4444-8444-444444444444' });
  await expect(executeMa24EvaluationRun(input))
    .rejects.toThrow('MA24 evaluation financial override unavailable');
  expect(mocks.claim).not.toHaveBeenCalled();
});

it('rechecks fixed FX after claiming and before graph or model work', async () => {
  mocks.spendContext.mockReturnValueOnce(undefined)
    .mockReturnValueOnce({ fixedFxReferenceVersion: 'synthetic-fx-v1' });
  await expect(executeMa24EvaluationRun(input))
    .rejects.toThrow('MA24 evaluation financial override unavailable');
  expect(mocks.claim).toHaveBeenCalledOnce();
  expect(mocks.buildGraph).not.toHaveBeenCalled();
  expect(mocks.model).not.toHaveBeenCalled();
  expect(mocks.finish).toHaveBeenCalledWith(expect.any(Object), 'failed',
    'MA24 evaluation execution failed');
});

it('rechecks financial admission after claim and before graph or model work', async () => {
  mocks.financialOverride.mockReturnValueOnce(null)
    .mockReturnValueOnce({ ruleId: 'A33', allowFinancialAdmissionBypass: true });
  await expect(executeMa24EvaluationRun(input))
    .rejects.toThrow('MA24 evaluation financial override unavailable');
  expect(mocks.claim).toHaveBeenCalledOnce();
  expect(mocks.buildGraph).not.toHaveBeenCalled();
  expect(mocks.model).not.toHaveBeenCalled();
  expect(mocks.finish).toHaveBeenCalledWith(expect.any(Object), 'failed',
    'MA24 evaluation execution failed');
});

it('refuses an unready paid evaluation before claiming a persisted task', async () => {
  mocks.binding.mockReturnValue({ runtimeBindingMatched: true,
    readyForModelCalls: false, missing: ['Gold not frozen', 'paid call authorization not confirmed'] });
  await expect(executeMa24EvaluationRun(input))
    .rejects.toThrow('MA24 evaluation model admission unavailable');
  expect(mocks.claim).not.toHaveBeenCalled();
});

it('refuses a missing or mismatched durable hard limit before claiming', async () => {
  mocks.hardLimit.mockRejectedValueOnce(new Error('MA24 authorized hard limit missing'));
  await expect(executeMa24EvaluationRun(input))
    .rejects.toThrow('MA24 authorized hard limit missing');
  expect(mocks.claim).not.toHaveBeenCalled();
  expect(mocks.model).not.toHaveBeenCalled();
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
  expect(mocks.spend).toHaveBeenCalledWith(userId, runId, expect.any(Function));
  expect(mocks.hardLimit.mock.calls.length).toBeGreaterThan(2);
  expect(mocks.model).toHaveBeenCalledOnce();
  expect(mocks.verify.mock.calls.length).toBeGreaterThan(2);
  expect(mocks.finish).toHaveBeenCalledWith(expect.objectContaining({
    userId, runId, leaseToken, evaluationArm: 'baseline', knowledgeScope: ['product'],
  }), 'completed', 'Synthetic answer');
});

it('does not replay a checkpoint with existing messages', async () => {
  const invoke = vi.fn();
  mocks.buildGraph.mockReturnValue({
    getState: async () => ({ values: { messages: [{ role: 'user', content: 'old' }] },
      createdAt: '2026-10-15T00:00:00.000Z' }),
    invoke,
  });
  await expect(executeMa24EvaluationRun(input))
    .rejects.toThrow('MA24 evaluation checkpoint requires manual reconciliation');
  expect(invoke).not.toHaveBeenCalled();
  expect(mocks.model).not.toHaveBeenCalled();
  expect(mocks.finish).toHaveBeenCalledWith(expect.any(Object), 'failed',
    'MA24 evaluation execution failed');
});

it('does not replay a checkpoint whose message list is empty', async () => {
  const invoke = vi.fn();
  mocks.buildGraph.mockReturnValue({
    getState: async () => ({ values: { messages: [], pending: [{ callId: 'prior-tool' }] },
      createdAt: '2026-10-15T00:00:00.000Z' }),
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
