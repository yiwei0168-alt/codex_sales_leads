/** Recheck and assemble only approved private G14 Gold subsets; never admit model calls. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { goldSourceIsPrecise } from '../src/lib/knowledge/review-types';
import { ma24CaseQuerySha256, type Ma24GoldSnapshot,
  type Ma24SourceSetSnapshot } from '../src/lib/knowledge/evaluation/ma24-independent-comparison';

const root = resolve('tmp/ma24-independent-quarantine');
const dispositions = [
  'ma24-g14-govuk-family-gold-disposition-2026-10-15.json',
  'ma24-g14-fcc-family-gold-disposition-2026-10-15.json',
  'ma24-g14-nist-connected-family-gold-disposition-2026-10-15.json',
];
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const readSnapshot = async (path: string, expectedHash: string) => {
  const full = resolve(path);
  assert(full.startsWith(root + sep) && full.endsWith('.json'), 'Gold snapshot path outside private quarantine');
  const bytes = await readFile(full);
  assert.equal(sha(bytes), expectedHash, `Approved snapshot hash drift: ${path}`);
  return JSON.parse(bytes.toString('utf8'));
};

const sources: Ma24SourceSetSnapshot['cases'] = [];
const gold: Ma24GoldSnapshot['cases'] = [];
const seen = new Set<string>();
const families = [];
for (const filename of dispositions) {
  const disposition = JSON.parse(await readFile(resolve('docs/evidence', filename), 'utf8'));
  const p = disposition.privateSnapshots;
  const approvedCases = p?.caseCount ?? disposition.approvedGoldCasesInThisUnit;
  assert(p && Number.isSafeInteger(approvedCases), `Missing reviewed case count: ${filename}`);
  const sourceSet = await readSnapshot(p.sourceSetPath, p.sourceSetSha256) as Ma24SourceSetSnapshot;
  const goldSet = await readSnapshot(p.goldPath, p.goldSha256) as Ma24GoldSnapshot;
  assert.equal(sourceSet.schema, 'ma24-g16-source-set-v1');
  assert.equal(goldSet.schema, 'ma24-g16-gold-snapshot-v1');
  assert.equal(sourceSet.cases.length, approvedCases);
  assert.equal(goldSet.cases.length, approvedCases);
  const goldById = new Map(goldSet.cases.map(item => [item.caseId, item]));
  assert.equal(goldById.size, goldSet.cases.length);
  for (const item of sourceSet.cases) {
    assert(!seen.has(item.caseId), `Duplicate approved Gold case: ${item.caseId}`);
    seen.add(item.caseId);
    const answer = goldById.get(item.caseId);
    assert(answer && item.query.trim() === item.query && item.query.length > 0,
      `Missing approved question or Gold: ${item.caseId}`);
    assert.equal(answer.caseSha256, ma24CaseQuerySha256(item.query));
    assert(answer.expectedAnswer.trim() && answer.reviewer.trim() &&
      Number.isFinite(Date.parse(answer.reviewedAt)) && answer.note.trim() &&
      answer.expectedSources.length > 0 && answer.expectedSources.every(goldSourceIsPrecise),
    `Incomplete approved Gold: ${item.caseId}`);
    sources.push(item);
    gold.push(answer);
  }
  families.push({ disposition: filename, approvedCases: sourceSet.cases.length,
    sourceSetSha256: p.sourceSetSha256, goldSha256: p.goldSha256 });
}
assert.equal(sources.length, 5, 'Approved Gold count changed; update the audit deliberately');
const output = async (filename: string, value: unknown) => {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  const path = resolve(root, filename);
  await writeFile(path, bytes);
  return { path: `tmp/ma24-independent-quarantine/${filename}`, sha256: sha(bytes) };
};
const sourceSet = await output('approved-five-source-set-staging-v1.json',
  { schema: 'ma24-g16-source-set-v1', cases: sources });
const goldSet = await output('approved-five-gold-staging-v1.json',
  { schema: 'ma24-g16-gold-snapshot-v1', cases: gold });
console.log(JSON.stringify({ schema: 'ma24-g14-approved-subsets-staging-v1',
  approvedCases: sources.length, connectedExposureUnits: families.length,
  families, sourceSet, goldSet, fullSetFrozen: false,
  g15ReadyForModelCalls: false, realDualArmRuns: 0,
  g17ToG20Advanced: false }, null, 2));
