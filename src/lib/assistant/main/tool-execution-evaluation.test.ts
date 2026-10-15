import { z } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  boundary: vi.fn(), beginCall: vi.fn(), completeCall: vi.fn(), event: vi.fn(),
  requestApproval: vi.fn(), execute: vi.fn(),
}));
vi.mock('./repository', () => ({
  boundary: mocks.boundary, beginCall: mocks.beginCall, completeCall: mocks.completeCall,
  event: mocks.event, assertCurrentInstructions: vi.fn(),
  LeaseLostError: class LeaseLostError extends Error {},
  InstructionsChangedError: class InstructionsChangedError extends Error {},
}));
vi.mock('./approvals', () => ({
  needsApproval: (tool: { effect: string }) => tool.effect !== 'read',
  requestApproval: mocks.requestApproval,
}));

import { result } from './contracts';
import { defineTool } from './tool-definition';
import { executeRegisteredTool } from './tool-execution';

const userId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const leaseToken = '33333333-3333-4333-8333-333333333333';
const context = { userId, runId, leaseToken, role: 'member' as const,
  knowledgeScope: ['product' as const], evaluationArm: 'baseline' as const };
const task = { control: null, instructions: [], execution_kind: 'main-agent-evaluation',
  execution_spec: { arm: 'baseline' }, input: { knowledgeScope: ['product'] } };
const read = defineTool({ id: 'knowledge_status', description: 'Read knowledge status',
  input: z.object({}).strict(), execute: async () => mocks.execute() });
const write = defineTool({ id: 'schedule_create', description: 'Create a schedule',
  input: z.object({}).strict(), effect: 'publish', execute: async () => mocks.execute() });

afterEach(() => vi.clearAllMocks());

describe('MA24 persisted evaluation tool boundary', () => {
  it('rejects writes and mismatched arm or scope before approval, journal or execution', async () => {
    for (const [tool, changed] of [
      [write, {}],
      [read, { evaluationArm: 'candidate' as const }],
      [read, { evaluationArm: undefined }],
      [read, { knowledgeScope: ['industry'] as Array<'industry' | 'company' | 'product'> }],
      [read, { knowledgeScope: undefined }],
    ] as const) {
      mocks.boundary.mockResolvedValueOnce(task);
      await expect(executeRegisteredTool(tool, {}, 'call', { ...context, ...changed }))
        .rejects.toThrow('MA24 evaluation tool context does not match the leased task');
    }
    expect(mocks.requestApproval).not.toHaveBeenCalled();
    expect(mocks.beginCall).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('rejects an evaluation arm attached to an ordinary task', async () => {
    mocks.boundary.mockResolvedValueOnce({ ...task, execution_kind: 'main-agent' });
    await expect(executeRegisteredTool(read, {}, 'call', context))
      .rejects.toThrow('MA24 evaluation arm cannot execute an ordinary task');
    expect(mocks.beginCall).not.toHaveBeenCalled();
  });
  it('executes a matched read using the leased evaluation identity', async () => {
    mocks.boundary.mockResolvedValueOnce(task);
    mocks.beginCall.mockResolvedValueOnce({ id: '44444444-4444-4444-8444-444444444444',
      fresh: true, output: null });
    mocks.execute.mockResolvedValueOnce(result({ status: 'ready' }));
    const output = await executeRegisteredTool(read, {}, 'call', context);
    expect(output).toMatchObject({ status: 'success', data: { status: 'ready' } });
    expect(mocks.beginCall).toHaveBeenCalledOnce();
    expect(mocks.execute).toHaveBeenCalledOnce();
  });
});
