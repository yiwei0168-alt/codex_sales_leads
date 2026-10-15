/** Enqueue one frozen case's two hidden evaluation arms after G15 admission. */
import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { resolve, sep } from 'node:path';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
  return next(specifier, context);
} });

const args = process.argv.slice(2);
assert.equal(args.length, 6,
  'Usage: enqueue-ma24-g16-pair <manifest.json> <source-set.json> <gold.json> <code-and-config.json> <corpus.json> <case-id>');
const [manifestPath, sourceSetPath, goldPath, configPath, corpusPath, caseId] = args;
assert(caseId?.trim(), 'MA24 frozen case ID required');
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
const [{ assertMa24FrozenManifestComplete, assertMa24FrozenSnapshotBytes, assertMa24GoldMatchesManifest,
  assertMa24SourceSetMatchesManifest },
{ assertMa24CorpusSnapshotBytes, assertMa24PermissionGoldControl,
  assertMa24RouteGoldCorpusAccess, verifyMa24LiveCorpusAccount,
  verifyMa24LivePermissionControl, verifyMa24LivePermissionGoldEvidence,
  verifyMa24LiveRouteGoldEvidence },
{ loadCurrentMa24G15Preview }, { requireMa24G15ModelReady },
{ modeModelConfig }, { enqueueMa24EvaluationPair }, { stableJson }, { getPool }] = await Promise.all([
  import('../src/lib/knowledge/evaluation/ma24-independent-comparison'),
  import('../src/lib/knowledge/evaluation/ma24-corpus-snapshot'),
  import('../src/lib/knowledge/evaluation/ma24-evaluation-claim'),
  import('../src/lib/knowledge/evaluation/ma24-g15-runtime-binding'),
  import('../src/lib/assistant/main/mode-config'),
  import('../src/lib/knowledge/evaluation/ma24-evaluation-pair'),
  import('../src/lib/knowledge/review-types'),
  import('../src/lib/rag/db'),
]);
const manifest = JSON.parse(manifestBytes.toString('utf8'));
assertMa24FrozenSnapshotBytes(manifest, { sourceSet: sourceSetBytes, gold: goldBytes,
  codeAndConfig: codeAndConfigBytes, corpus: corpusSnapshotBytes });
const sourceSet = JSON.parse(sourceSetBytes.toString('utf8'));
assertMa24SourceSetMatchesManifest(manifest, sourceSet);
const gold = JSON.parse(goldBytes.toString('utf8'));
assertMa24GoldMatchesManifest(manifest, gold);
const corpus = assertMa24CorpusSnapshotBytes(manifest, corpusSnapshotBytes,
  manifest.corpusSnapshotSha256);
assertMa24PermissionGoldControl(manifest, corpus, gold);
assertMa24RouteGoldCorpusAccess(manifest, corpus, gold);
const entry = manifest.cases.find((item: { caseId: string }) => item.caseId === caseId);
const question = sourceSet.cases.find((item: { caseId: string }) => item.caseId === caseId);
assert(entry && question, 'MA24 case absent from frozen manifest or source set');
const frozenConfig = JSON.parse(codeAndConfigBytes.toString('utf8'));
const loadedConfig = loadCurrentMa24G15Preview();
requireMa24G15ModelReady(frozenConfig, loadedConfig, new Date().toISOString().slice(0, 10));
assertMa24FrozenManifestComplete(manifest);
const model = modeModelConfig('standard');
assert(stableJson(model.profile) === stableJson(loadedConfig.modelProfile),
  'MA24 standard model profile differs from frozen G15 configuration');
try {
  await verifyMa24LiveCorpusAccount(corpus, entry.userId, entry.knowledgeScope);
  await verifyMa24LivePermissionControl(manifest, corpus, caseId);
  await verifyMa24LivePermissionGoldEvidence(manifest, corpus, gold, caseId);
  await verifyMa24LiveRouteGoldEvidence(manifest, gold, caseId);
  const pair = await enqueueMa24EvaluationPair({ manifest, sourceSet, caseId, model });
  console.log(JSON.stringify({ schema: 'ma24-g16-enqueued-pair-v1', ...pair }));
} finally {
  await getPool().end();
}
