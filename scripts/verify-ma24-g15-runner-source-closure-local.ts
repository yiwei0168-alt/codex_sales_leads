/** Read-only local proof that the dedicated runner participates in the G15 code lock. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { assertMa24G15RuntimeBinding, type Ma24G15Preview } from
  '../src/lib/knowledge/evaluation/ma24-g15-runtime-binding';

const stdout = execFileSync(process.execPath,
  ['scripts/run-tsx.cjs', 'scripts/prepare-ma24-g15-config-local.ts'],
  { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 4_194_304 });
const preview = JSON.parse(stdout) as Ma24G15Preview;
const runner = 'src/lib/knowledge/evaluation/ma24-evaluation-runner.ts';
const required = [runner, 'src/lib/knowledge/evaluation/ma24-evaluation-claim.ts',
  'next.config.ts', 'scripts/build-next.mjs', 'scripts/package-ma24-next-standalone.py',
  'src/lib/knowledge/evaluation/ma24-evaluation-task-binding.ts',
  'src/lib/knowledge/evaluation/ma24-persisted-run-binding.ts',
  'scripts/score-ma24-independent-comparison.ts',
  'src/lib/assistant/main/graph.ts', 'src/lib/assistant/main/tool-execution.ts',
  'src/lib/billing/paid-fetch.ts'];
for (const path of required)
  assert(/^[0-9a-f]{64}$/.test(preview.sourceHashes[path] ?? ''), `Missing runtime source ${path}`);
const altered = { ...preview, sourceHashes: {
  ...preview.sourceHashes, ['next.config.ts']: '0'.repeat(64),
} };
assert.throws(() => assertMa24G15RuntimeBinding(altered, preview,
  new Date().toISOString().slice(0, 10)), /sourceHashes drift/);
console.log(JSON.stringify({ schema: 'ma24-g15-runner-source-closure-local-v1',
  sourceClosureFileCount: preview.sourceClosureFileCount,
  runnerSha256: preview.sourceHashes[runner],
  nextConfigSha256: preview.sourceHashes['next.config.ts'],
  previewStdoutSha256: createHash('sha256').update(stdout).digest('hex'),
  requiredRuntimeFilesPresent: required.length, buildConfigHashDriftRejected: true,
  readyForPaidEvaluation: preview.readyForPaidEvaluation,
  providerCalls: 0 }));
