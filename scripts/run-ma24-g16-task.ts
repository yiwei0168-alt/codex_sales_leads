/** Explicit G16 task entry. Frozen inputs and an existing queued run are required. */
import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { resolve, sep } from 'node:path';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
  return next(specifier, context);
} });

const args = process.argv.slice(2);
assert.equal(args.length, 9,
  'Usage: run-ma24-g16-task <manifest.json> <source-set.json> <gold.json> <code-and-config.json> <corpus.json> <case-id> <baseline|candidate> <run-uuid> <worker-id>');
const [manifestPath, sourceSetPath, goldPath, configPath, corpusPath,
  caseId, arm, runId, workerId] = args;
assert(caseId?.trim() && ['baseline', 'candidate'].includes(arm) &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(runId) &&
  workerId?.trim() && workerId.length <= 120, 'MA24 explicit evaluation task identity required');

const root = await realpath(resolve('tmp/ma24-independent-evaluation'));
const paths = await Promise.all([manifestPath, sourceSetPath, goldPath, configPath, corpusPath]
  .map(async input => {
    const path = await realpath(resolve(input));
    assert(path.startsWith(root + sep) && path.endsWith('.json'),
      'MA24 frozen input must be a private evaluation JSON file');
    return path;
  }));
const [manifestBytes, sourceSetBytes, goldBytes, codeAndConfigBytes,
  corpusSnapshotBytes] = await Promise.all(paths.map(path => readFile(path)));
const [{ assertMa24FrozenSnapshotBytes, assertMa24GoldMatchesManifest,
  assertMa24SourceSetMatchesManifest }, { assertMa24CorpusSnapshotBytes },
  { executeMa24EvaluationRun }, { getPool }] = await Promise.all([
  import('../src/lib/knowledge/evaluation/ma24-independent-comparison'),
  import('../src/lib/knowledge/evaluation/ma24-corpus-snapshot'),
  import('../src/lib/knowledge/evaluation/ma24-evaluation-runner'),
  import('../src/lib/rag/db'),
]);
const manifest = JSON.parse(manifestBytes.toString('utf8'));
assertMa24FrozenSnapshotBytes(manifest, { sourceSet: sourceSetBytes, gold: goldBytes,
  codeAndConfig: codeAndConfigBytes, corpus: corpusSnapshotBytes });
assertMa24SourceSetMatchesManifest(manifest, JSON.parse(sourceSetBytes.toString('utf8')));
assertMa24GoldMatchesManifest(manifest, JSON.parse(goldBytes.toString('utf8')));
assertMa24CorpusSnapshotBytes(manifest, corpusSnapshotBytes, manifest.corpusSnapshotSha256);
assert(manifest.cases.some((item: { caseId: string }) => item.caseId === caseId),
  'MA24 case absent from frozen manifest');
try {
  const result = await executeMa24EvaluationRun({ manifest, sourceSetBytes, goldBytes,
    codeAndConfigBytes, corpusSnapshotBytes, caseId, arm: arm as 'baseline' | 'candidate',
    runId, workerId });
  console.log(JSON.stringify({ schema: 'ma24-g16-task-result-v1', caseId, arm, runId,
    status: result.status }));
} finally {
  await getPool().end();
}
