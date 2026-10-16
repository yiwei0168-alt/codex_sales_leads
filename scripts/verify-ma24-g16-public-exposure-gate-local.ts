/** Isolated Git controls for the pre-enqueue and pre-claim public exposure gate. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { assertMa24FrozenSetNotPubliclyExposed } from
  '../src/lib/knowledge/evaluation/ma24-public-exposure-gate';
import type { Ma24GoldSnapshot, Ma24SourceSetSnapshot } from
  '../src/lib/knowledge/evaluation/ma24-independent-comparison';

const privateTempRoot = realpathSync(resolve('tmp'));
const repo = mkdtempSync(join(privateTempRoot, 'ma24-public-exposure-gate-'));
const question = 'What is the verified count for the private sample?';
const answer = 'The verified private sample count is exactly forty two.';
const sourceSet: Ma24SourceSetSnapshot = { schema: 'ma24-g16-source-set-v1',
  cases: [{ caseId: 'private-case', query: question }] };
const gold: Ma24GoldSnapshot = { schema: 'ma24-g16-gold-snapshot-v1',
  cases: [{ caseId: 'private-case', caseSha256: '0'.repeat(64), expectedAnswer: answer,
    expectedSources: [], reviewer: 'fixture', reviewedAt: '2026-10-16T00:00:00Z', note: 'fixture' }] };
function git(...args: string[]) {
  execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
}
function commit(content: string) {
  writeFileSync(join(repo, 'receipt.md'), content);
  git('add', 'receipt.md');
  git('-c', 'user.name=MA24 Fixture', '-c', 'user.email=ma24@example.invalid',
    'commit', '-qm', 'fixture');
}
function check() {
  return assertMa24FrozenSetNotPubliclyExposed({ sourceSet, gold, repositoryRoot: repo });
}
try {
  git('init', '-q');
  commit('Unrelated fixture content.');
  assert.deepEqual(check(), { caseCount: 1, trackedTextFiles: 1,
    publicQuestionOrAnswerExposure: false });
  gold.cases[0].expectedAnswer = 'Access denied.';
  assert.equal(check().publicQuestionOrAnswerExposure, false);
  gold.cases[0].expectedAnswer = answer;

  writeFileSync(join(repo, 'receipt.md'), question);
  assert.throws(check, /question is publicly exposed/);
  writeFileSync(join(repo, 'receipt.md'), answer);
  assert.throws(check, /answer is publicly exposed/);
  writeFileSync(join(repo, 'receipt.md'), 'The-verified private sample count is exactly forty two.');
  assert.throws(check, /answer is publicly exposed/);

  commit(question);
  commit('Question removed from current tree.');
  assert.throws(check, /question is publicly exposed/);
  assert.throws(() => assertMa24FrozenSetNotPubliclyExposed({ sourceSet, gold,
    repositoryRoot: privateTempRoot }), /repository root|not a git repository/i);
  console.log(JSON.stringify({ schema: 'ma24-g16-public-exposure-gate-local-v1',
    cleanSetAccepted: true, currentQuestionRejected: true, currentAnswerRejected: true,
    normalizedAnswerRejected: true, shortGenericAnswerAccepted: true,
    historicalQuestionRejected: true,
    missingRepositoryRejected: true, providerCalls: 0 }));
} finally {
  const target = realpathSync(repo);
  assert(target.startsWith(privateTempRoot + sep), 'test cleanup escaped private temp root');
  rmSync(target, { recursive: true, force: true });
}
