import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { ModelConfig } from '../../assistant/main/contracts';
import { enqueueRun } from '../../assistant/main/repository';
import { stableJson } from '../review-types';
import { assertMa24SourceSetMatchesManifest, ma24ManifestSha256, type Ma24FrozenManifest,
  type Ma24SourceSetSnapshot } from './ma24-independent-comparison';

/** Queue both arms under stable request keys; a partial enqueue can be retried. */
export async function enqueueMa24EvaluationPair(input: {
  manifest: Ma24FrozenManifest; sourceSet: Ma24SourceSetSnapshot;
  caseId: string; model: ModelConfig;
}, enqueue: typeof enqueueRun = enqueueRun) {
  const { manifest, sourceSet, caseId, model } = input;
  assertMa24SourceSetMatchesManifest(manifest, sourceSet);
  const entry = manifest.cases.find(item => item.caseId === caseId);
  const question = sourceSet.cases.find(item => item.caseId === caseId);
  assert(entry && question, 'MA24 case absent from frozen manifest or source set');
  const manifestSha256 = ma24ManifestSha256(manifest);
  const runs = [];
  for (const arm of ['baseline', 'candidate'] as const) {
    const requestKey = `ma24-${createHash('sha256').update(JSON.stringify([
      manifestSha256, caseId, arm])).digest('hex')}`;
    const spec = { schema: 'ma24-evaluation-run-v1' as const,
      manifestSha256, caseId, arm };
    const run = await enqueue(entry.userId, { content: question.query, requestKey,
      attachments: [], knowledgeScope: entry.knowledgeScope, mode: 'standard' }, model,
    { kind: 'main-agent-evaluation', spec });
    assert(run.execution_kind === 'main-agent-evaluation' &&
      run.user_id === entry.userId && run.input.content === question.query &&
      run.input.requestKey === requestKey &&
      stableJson(run.input.knowledgeScope) === stableJson(entry.knowledgeScope) &&
      stableJson(run.model_config) === stableJson(model) &&
      stableJson(run.execution_spec) === stableJson(spec),
    'MA24 request key resolved to a different frozen task');
    runs.push({ arm, runId: run.id, status: run.status });
  }
  assert(runs[0].runId !== runs[1].runId, 'MA24 evaluation arms reused one task');
  return { caseId, manifestSha256, runs };
}
