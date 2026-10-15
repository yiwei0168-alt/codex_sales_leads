/** Freeze planning: every question connected by a shared source family stays in one exposure unit. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

const quarantine = resolve("tmp/ma24-independent-quarantine") + sep;
const sourcePath = resolve(process.argv[2] ??
  "tmp/ma24-independent-quarantine/g14-current-draft-pool-v6-2026-10-15.json");
const outputPath = resolve(process.argv[3] ??
  "tmp/ma24-independent-quarantine/g14-family-closure-v6-2026-10-15.json");
assert(sourcePath.startsWith(quarantine) && sourcePath.endsWith(".json"));
assert(outputPath.startsWith(quarantine) && outputPath.endsWith(".json"));
assert.notEqual(sourcePath, outputPath);
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const bytes = await readFile(sourcePath);
assert.equal(sha(bytes), "2be471883c10e9c7672efd4fbd681fe47560205a5fb03341250827ba64399ddb");
const pool = JSON.parse(bytes.toString("utf8")) as {
  schema: string; draftCount: number; publicationDraftCount: number; syntheticSecurityDraftCount: number;
  publicationRows: Array<{ id: string; families: string[] }>;
  securityAnnex: Array<{ id: string; sourceClass: string; sourceSha256: string }>;
};
assert.equal(pool.schema, "ma24-g14-current-draft-pool-v6");
assert.equal(pool.draftCount, 27);
assert.equal(pool.publicationRows.length, pool.publicationDraftCount);
assert.equal(pool.securityAnnex.length, pool.syntheticSecurityDraftCount);
const familyNames = [...new Set(pool.publicationRows.flatMap(row => row.families))].sort();
assert.equal(familyNames.length, 13);
assert(pool.publicationRows.every(row => row.families.length > 0 &&
  new Set(row.families).size === row.families.length));
const parent = new Map(familyNames.map(name => [name, name]));
function root(name: string): string {
  const current = parent.get(name);
  assert(current, `Unknown family ${name}`);
  if (current === name) return name;
  const found = root(current);
  parent.set(name, found);
  return found;
}
function join(a: string, b: string) {
  const left = root(a), right = root(b);
  if (left !== right) parent.set(left < right ? right : left, left < right ? left : right);
}
for (const row of pool.publicationRows) for (const family of row.families.slice(1))
  join(row.families[0], family);
const components = [...new Set(familyNames.map(root))].sort().map(groupId => {
  const families = familyNames.filter(name => root(name) === groupId);
  const draftIds = pool.publicationRows.filter(row => row.families.some(name => families.includes(name)))
    .map(row => row.id).sort();
  return { groupId, families, draftIds, draftCount: draftIds.length,
    containsCrossDocumentBridge: families.length > 1 };
});
const syntheticSha = new Set(pool.securityAnnex.map(row => row.sourceSha256));
assert.equal(syntheticSha.size, 1);
assert(pool.securityAnnex.every(row => row.sourceClass === "synthetic-private-fixture"));
const allIds = [...components.flatMap(row => row.draftIds), ...pool.securityAnnex.map(row => row.id)];
assert.equal(allIds.length, 27);
assert.equal(new Set(allIds).size, 27);
const report = {
  schema: "ma24-g14-family-closure-v6", sourcePoolSha256: sha(bytes),
  rule: "Treat each connected component of shared publication families as one exposure unit; keep the synthetic private fixture separate.",
  publicationFamilyCount: familyNames.length, publicationExposureUnitCount: components.length,
  publicationComponents: components,
  syntheticFixtureExposureUnit: {
    groupId: "synthetic-private-fixture", sourceSha256: [...syntheticSha][0],
    draftIds: pool.securityAnnex.map(row => row.id).sort(), draftCount: pool.securityAnnex.length,
  },
  allDraftCount: allIds.length, sourceEligibilityApproved: false,
  accountIdsFrozen: false, goldCreated: 0,
};
assert.equal(report.publicationExposureUnitCount, 11);
assert.equal(components.filter(item => item.containsCrossDocumentBridge).length, 2);
await writeFile(outputPath, JSON.stringify(report, null, 2), { flag: "wx" });
console.log(JSON.stringify({ output: outputPath, sha256: sha(await readFile(outputPath)),
  publicationFamilyCount: report.publicationFamilyCount,
  publicationExposureUnitCount: report.publicationExposureUnitCount,
  crossDocumentBridgeUnits: components.filter(item => item.containsCrossDocumentBridge)
    .map(item => ({ families: item.families, draftCount: item.draftCount })),
  syntheticFixtureDraftCount: pool.securityAnnex.length, allDraftCount: report.allDraftCount }));
