import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  preview: vi.fn(), claim: vi.fn(), binding: vi.fn(),
}));
vi.mock('./ma24-evaluation-claim', () => ({
  loadCurrentMa24G15Preview: mocks.preview,
  claimAndBindMa24EvaluationRun: mocks.claim,
}));
vi.mock('./ma24-g15-runtime-binding', () => ({
  assertMa24G15RuntimeBinding: mocks.binding,
}));

import { executeMa24EvaluationRun } from './ma24-evaluation-runner';

afterEach(() => vi.clearAllMocks());

it('refuses an unready paid evaluation before claiming a persisted task', async () => {
  mocks.preview.mockReturnValue({ schema: 'ma24-g15-config-preview-v1' });
  mocks.binding.mockReturnValue({ runtimeBindingMatched: true,
    readyForModelCalls: false, missing: ['Gold not frozen', 'paid call authorization not confirmed'] });
  await expect(executeMa24EvaluationRun({} as Parameters<typeof executeMa24EvaluationRun>[0]))
    .rejects.toThrow('MA24 evaluation model admission unavailable');
  expect(mocks.claim).not.toHaveBeenCalled();
});
