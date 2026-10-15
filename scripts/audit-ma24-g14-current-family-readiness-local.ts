/** Recompute connected G14 source units and place approved Gold inside their draft families. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const poolReceipt = JSON.parse(await readFile(
  'docs/evidence/ma24-g14-dbs-current-28-pool-screen-2026-10-16.json', 'utf8'));
const goldReceipt = JSON.parse(await readFile(
  'docs/evidence/ma24-g14-approved-five-staging-integrity-2026-10-16.json', 'utf8'));
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const readBound = async (path: string, expectedHash: string) => {
  const bytes = await readFile(path);
  assert.equal(hash(bytes), expectedHash, `MA24 G14 input drift: ${path}`);
  return JSON.parse(bytes.toString('utf8'));
};
const pool = await readBound(poolReceipt.inputPool, poolReceipt.inputPoolSha256) as {
  schema: string; draftCount: number; publicationDraftCount: number;
  syntheticSecurityDraftCount: number;
  publicationRows: Array<{ id: string; families: string[] }>;
  securityAnnex: Array<{ id: string; sourceSha256: string }>;
};
const gold = await readBound(goldReceipt.privateStagingSnapshots.sourceSetPath,
  goldReceipt.privateStagingSnapshots.sourceSetSha256) as {
    schema: string; cases: Array<{ caseId: string }>;
  };
assert.equal(pool.schema, 'ma24-g14-current-draft-pool-v7');
assert.equal(gold.schema, 'ma24-g16-source-set-v1');
assert.equal(pool.publicationRows.length, pool.publicationDraftCount);
assert.equal(pool.securityAnnex.length, pool.syntheticSecurityDraftCount);
assert.equal(pool.draftCount, pool.publicationRows.length + pool.securityAnnex.length);
assert.equal(gold.cases.length, goldReceipt.approvedCases);
const allDraftIds = [...pool.publicationRows.map(row => row.id),
  ...pool.securityAnnex.map(row => row.id)];
assert.equal(new Set(allDraftIds).size, pool.draftCount, 'Duplicate draft case ID');
const publicationIds = new Set(pool.publicationRows.map(row => row.id));
const approvedIds = new Set(gold.cases.map(item => item.caseId));
assert.equal(approvedIds.size, gold.cases.length, 'Duplicate approved Gold case ID');
for (const id of approvedIds)
  assert(publicationIds.has(id), `Approved Gold absent from current publication pool: ${id}`);

const familyNames = [...new Set(pool.publicationRows.flatMap(row => row.families))].sort();
assert(pool.publicationRows.every(row => row.families.length > 0 &&
  new Set(row.families).size === row.families.length));
const parent = new Map(familyNames.map(name => [name, name]));
function root(name: string): string {
  const value = parent.get(name);
  assert(value, `Unknown publication family: ${name}`);
  if (value === name) return name;
  const result = root(value);
  parent.set(name, result);
  return result;
}
function join(left: string, right: string) {
  const a = root(left), b = root(right);
  if (a !== b) parent.set(a < b ? b : a, a < b ? a : b);
}
for (const row of pool.publicationRows) for (const family of row.families.slice(1))
  join(row.families[0], family);
const units = [...new Set(familyNames.map(root))].sort().map(groupId => {
  const families = familyNames.filter(name => root(name) === groupId);
  const draftIds = pool.publicationRows.filter(row => row.families.some(name =>
    families.includes(name))).map(row => row.id).sort();
  const approvedGoldIds = draftIds.filter(id => approvedIds.has(id));
  return { groupId, families, draftIds, approvedGoldIds,
    pendingDraftIds: draftIds.filter(id => !approvedIds.has(id)),
    state: approvedGoldIds.length === 0 ? 'no-approved-gold' :
      approvedGoldIds.length === draftIds.length ? 'all-drafts-approved' :
        'mixed-approved-and-provisional' };
});
assert.equal(units.length, 12);
assert.equal(familyNames.length, 14);
assert.equal(units.flatMap(row => row.draftIds).length, pool.publicationDraftCount);
assert.equal(units.flatMap(row => row.approvedGoldIds).length, approvedIds.size);
assert.equal(new Set(pool.securityAnnex.map(item => item.sourceSha256)).size, 1);
const outputPath = resolve('tmp/ma24-independent-quarantine/g14-family-readiness-v7-2026-10-16.json');
const report = { schema: 'ma24-g14-family-readiness-v7',
  poolSha256: poolReceipt.inputPoolSha256,
  approvedSourceSetSha256: goldReceipt.privateStagingSnapshots.sourceSetSha256,
  rule: 'A connected publication family is one exposure unit; a provisional same-unit draft cannot be treated as an independent source if later used for development.',
  publicationFamilies: familyNames.length, publicationExposureUnits: units.length,
  publicationDrafts: pool.publicationDraftCount, syntheticSecurityDrafts: pool.syntheticSecurityDraftCount,
  approvedGoldCases: approvedIds.size,
  approvedExposureUnits: units.filter(row => row.approvedGoldIds.length > 0).length,
  fullyApprovedDraftUnits: units.filter(row => row.state === 'all-drafts-approved').length,
  mixedApprovedAndProvisionalUnits: units.filter(row => row.state === 'mixed-approved-and-provisional').length,
  units, syntheticFixture: { draftIds: pool.securityAnnex.map(row => row.id).sort(),
    sourceSha256: pool.securityAnnex[0].sourceSha256 },
  fullSetFrozen: false, g15ReadyForModelCalls: false, realDualArmRuns: 0,
  g17ToG20Advanced: false };
const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
await writeFile(outputPath, bytes);
console.log(JSON.stringify({ path: outputPath, sha256: hash(bytes),
  publicationExposureUnits: report.publicationExposureUnits,
  approvedExposureUnits: report.approvedExposureUnits,
  fullyApprovedDraftUnits: report.fullyApprovedDraftUnits,
  mixedApprovedAndProvisionalUnits: report.mixedApprovedAndProvisionalUnits,
  mixedUnits: units.filter(row => row.state === 'mixed-approved-and-provisional')
    .map(row => ({ groupId: row.groupId, approvedGoldIds: row.approvedGoldIds,
      pendingDraftIds: row.pendingDraftIds })) }, null, 2));
