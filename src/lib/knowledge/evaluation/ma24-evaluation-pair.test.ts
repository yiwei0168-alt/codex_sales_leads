import assert from 'node:assert/strict';
import { expect, it, vi } from 'vitest';
import type { AgentRun, ModelConfig } from '../../assistant/main/contracts';
import type { enqueueRun } from '../../assistant/main/repository';
import { enqueueMa24EvaluationPair } from './ma24-evaluation-pair';
import { ma24CaseQuerySha256, type Ma24FrozenManifest,
  type Ma24SourceSetSnapshot } from './ma24-independent-comparison';

const userId = '11111111-1111-4111-8111-111111111111';
const caseId = 'synthetic-no-answer';
const query = 'Does the synthetic source contain the requested intersection?';
const manifest: Ma24FrozenManifest = { schema: 'ma24-g16-frozen-comparison-v4',
  sourceSetSha256: 'a'.repeat(64), goldSnapshotSha256: 'b'.repeat(64),
  codeAndConfigSha256: 'c'.repeat(64), corpusSnapshotSha256: 'd'.repeat(64),
  requiredImprovementTags: [], protectedNoRegressionTags: [],
  cases: [{ caseId, caseSha256: ma24CaseQuerySha256(query), group: 'synthetic',
    tags: ['no-answer'], expectedOutcome: 'no-answer', userId,
    knowledgeScope: ['industry'] }] };
const sourceSet: Ma24SourceSetSnapshot = { schema: 'ma24-g16-source-set-v1',
  cases: [{ caseId, query }] };
const model: ModelConfig = { model: 'synthetic-model', providers: [], version: 'v1' };

it('queues the same frozen question in two arms with stable distinct request keys', async () => {
  const enqueue = vi.fn(async (...[owner, input, config, options]: Parameters<typeof enqueueRun>) => {
    assert(options?.kind === 'main-agent-evaluation');
    return ({
      id: options.spec.arm === 'baseline'
        ? '22222222-2222-4222-8222-222222222222'
        : '33333333-3333-4333-8333-333333333333',
      user_id: owner, input, model_config: config,
      execution_kind: options.kind, execution_spec: options.spec, status: 'queued',
    }) as AgentRun;
  }) as typeof enqueueRun;
  const first = await enqueueMa24EvaluationPair({ manifest, sourceSet, caseId, model }, enqueue);
  const second = await enqueueMa24EvaluationPair({ manifest, sourceSet, caseId, model }, enqueue);
  expect(first).toEqual(second);
  expect(first.runs.map(run => run.arm)).toEqual(['baseline', 'candidate']);
  expect(enqueue).toHaveBeenCalledTimes(4);
  const calls = vi.mocked(enqueue).mock.calls;
  expect(calls[0][1]).toMatchObject({ content: query, attachments: [],
    knowledgeScope: ['industry'], mode: 'standard' });
  expect(calls[1][1].requestKey).not.toBe(calls[0][1].requestKey);
  expect(calls[2][1].requestKey).toBe(calls[0][1].requestKey);
  expect(calls[3][1].requestKey).toBe(calls[1][1].requestKey);
  expect(calls.every(call => call[0] === userId)).toBe(true);
});

it('rejects a reused request key that resolves to another model', async () => {
  const enqueue = vi.fn(async (...[owner, input, config, options]: Parameters<typeof enqueueRun>) => {
    assert(options?.kind === 'main-agent-evaluation');
    return ({
      id: '22222222-2222-4222-8222-222222222222', user_id: owner,
      input, model_config: { ...config, model: 'other-model' },
      execution_kind: options.kind, execution_spec: options.spec, status: 'queued',
    }) as AgentRun;
  }) as typeof enqueueRun;
  await expect(enqueueMa24EvaluationPair({ manifest, sourceSet, caseId, model }, enqueue))
    .rejects.toThrow('different frozen task');
  expect(enqueue).toHaveBeenCalledOnce();
});
