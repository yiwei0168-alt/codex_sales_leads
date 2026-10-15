/** Read-only regression of source grouping against the five reviewed private Gold cases. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { assertMa24GoldMatchesManifest,
  type Ma24FrozenManifest, type Ma24GoldSnapshot } from "../src/lib/knowledge/evaluation/ma24-independent-comparison";

const readBound = async (path: string, expectedSha256: string) => {
  const bytes = await readFile(path);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), expectedSha256,
    `MA24 private source drift: ${path}`);
  return JSON.parse(bytes.toString("utf8"));
};
const gold = await readBound(
  "tmp/ma24-independent-quarantine/approved-five-gold-staging-v1.json",
  "90a72b52dac0a646e4d5ca9d3974c52d9e8b1706246e0ed277de873605d40d96") as Ma24GoldSnapshot;
const family = await readBound(
  "tmp/ma24-independent-quarantine/g14-family-readiness-v8-2026-10-16.json",
  "e611dee90a2c64ccda15ebe2795ac7a5460f3b2c5e5faf8c7ecceab66b0d3957") as {
    units: Array<{ groupId: string; approvedGoldIds: string[] }>;
  };
const pool = await readBound(
  "tmp/ma24-independent-quarantine/g14-current-draft-pool-v8-nist-corrected-2026-10-16.json",
  "4572c140e64aa992a666c90729fb1ca6c3a8ef6a6922b3a8b5c7a6dfb3e984d8") as {
    publicationRows: Array<{ id: string; wholeQuestionNoAnswer: boolean }>;
  };
const cases = gold.cases.map(item => {
  const units = family.units.filter(unit => unit.approvedGoldIds.includes(item.caseId));
  const draft = pool.publicationRows.filter(row => row.id === item.caseId);
  assert.equal(units.length, 1, `Unique family group required for ${item.caseId}`);
  assert.equal(draft.length, 1, `Current draft required for ${item.caseId}`);
  return { caseId: item.caseId, caseSha256: item.caseSha256, group: units[0].groupId,
    expectedOutcome: draft[0].wholeQuestionNoAnswer ? "no-answer" as const : "route" as const };
});
assertMa24GoldMatchesManifest({ cases } as Ma24FrozenManifest, gold);
console.log(JSON.stringify({ schema: "ma24-g14-approved-source-groups-local-v1",
  approvedGoldCases: cases.length, connectedGroups: new Set(cases.map(item => item.group)).size,
  sharedBinaryGroupCheck: "passed", modelCalls: 0 }));
