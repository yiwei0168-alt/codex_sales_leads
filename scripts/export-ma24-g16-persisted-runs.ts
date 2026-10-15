/** Read-only export of both frozen arms from saved task and tool journals. */
import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { resolve, sep } from 'node:path';
import type { Ma24Case } from '../src/lib/knowledge/evaluation/ma24-independent-comparison';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
  return next(specifier, context);
} });

const inputs = process.argv.slice(2);
assert.equal(inputs.length, 6,
  'Usage: export-ma24-g16-persisted-runs <manifest.json> <source-set.json> <gold.json> <code-and-config.json> <corpus.json> <run-map.json>');
const root = await realpath(resolve('tmp/ma24-independent-evaluation'));
const paths = await Promise.all(inputs.map(async input => {
  const path = await realpath(resolve(input));
  assert(path.startsWith(root + sep) && path.endsWith('.json'),
    'MA24 export inputs must be private evaluation JSON files');
  return path;
}));
const bytes = await Promise.all(paths.map(path => readFile(path)));
const [{ assertMa24FrozenManifestComplete, assertMa24FrozenSnapshotBytes,
  assertMa24GoldMatchesManifest, assertMa24SourceSetMatchesManifest, ma24ManifestSha256 },
{ assertMa24CorpusSnapshotBytes }, { exportMa24PersistedRun }, { getPool }] = await Promise.all([
  import('../src/lib/knowledge/evaluation/ma24-independent-comparison'),
  import('../src/lib/knowledge/evaluation/ma24-corpus-snapshot'),
  import('../src/lib/knowledge/evaluation/ma24-persisted-run-binding'),
  import('../src/lib/rag/db'),
]);
const [manifest, sourceSet, gold, , , runMap] = bytes.map(value => JSON.parse(value.toString('utf8')));
assertMa24FrozenSnapshotBytes(manifest, { sourceSet: bytes[1], gold: bytes[2],
  codeAndConfig: bytes[3], corpus: bytes[4] });
assertMa24FrozenManifestComplete(manifest);
assertMa24SourceSetMatchesManifest(manifest, sourceSet);
assertMa24GoldMatchesManifest(manifest, gold);
assertMa24CorpusSnapshotBytes(manifest, bytes[4], manifest.corpusSnapshotSha256);
assert(Array.isArray(runMap) && runMap.length === manifest.cases.length * 2,
  'Run map must identify both arms of every frozen case');
const cases = new Map<string, Ma24Case>(manifest.cases.map((item: Ma24Case) => [item.caseId, item]));
const questions = new Map<string, string>(sourceSet.cases.map((item: { caseId: string; query: string }) => [item.caseId, item.query]));
const seen = new Set<string>();
const runIds = new Set<string>();
for (const item of runMap) {
  const key = `${item?.caseId}:${item?.arm}`;
  assert(item && Object.keys(item).sort().join(',') === 'arm,caseId,citations,runId' &&
    cases.has(item.caseId) && ['baseline', 'candidate'].includes(item.arm) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(item.runId) &&
    Array.isArray(item.citations) && !seen.has(key) && !runIds.has(item.runId),
    `Invalid or duplicate MA24 run mapping ${key}`);
  seen.add(key);
  runIds.add(item.runId);
}
try {
  const runs = [];
  for (const item of runMap) {
    const frozen = cases.get(item.caseId), question = questions.get(item.caseId);
    assert(frozen && question, 'Run map has no frozen case or question');
    runs.push(await exportMa24PersistedRun({ case: frozen,
      query: question, arm: item.arm, runId: item.runId,
      manifestSha256: ma24ManifestSha256(manifest), citations: item.citations }));
  }
  process.stdout.write(`${JSON.stringify(runs, null, 2)}\n`);
} finally {
  await getPool().end();
}
