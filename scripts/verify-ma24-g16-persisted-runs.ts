/** Read-only binding of frozen MA24 inputs to persisted main Agent executions. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { verifyMa24PersistedRunBinding } from "../src/lib/knowledge/evaluation/ma24-persisted-run-binding";
import { assertMa24CorpusSnapshotBytes } from "../src/lib/knowledge/evaluation/ma24-corpus-snapshot";
import { assertMa24SourceSetMatchesManifest, ma24ManifestSha256, type Ma24FrozenManifest,
  type Ma24Run, type Ma24SourceSetSnapshot } from "../src/lib/knowledge/evaluation/ma24-independent-comparison";

const root = resolve("tmp/ma24-independent-evaluation");
const paths = process.argv.slice(2).map(path => resolve(path));
assert.equal(paths.length, 4,
  "Usage: verify-ma24-g16-persisted-runs <manifest.json> <source-set.json> <runs.json> <corpus.json>");
for (const path of paths) assert(path.startsWith(root + sep) && path.endsWith(".json"),
  "Only local MA24 independent-evaluation JSON files may be verified");
const bytes = await Promise.all(paths.map(path => readFile(path)));
const [manifest, sourceSet, runs] = bytes.map(value => JSON.parse(value.toString("utf8"))) as
  [Ma24FrozenManifest, Ma24SourceSetSnapshot, Ma24Run[]];
assert.equal(createHash("sha256").update(bytes[1]).digest("hex"), manifest.sourceSetSha256,
  "MA24 frozen source-set bytes drift");
assertMa24SourceSetMatchesManifest(manifest, sourceSet);
assertMa24CorpusSnapshotBytes(manifest, bytes[3], manifest.corpusSnapshotSha256);
assert(Array.isArray(runs) && runs.length === manifest.cases.length * 2,
  "MA24 persisted run list must contain both arms for every case");
const cases = new Map(manifest.cases.map(item => [item.caseId, item]));
const questions = new Map(sourceSet.cases.map(item => [item.caseId, item.query]));
const seen = new Set<string>();
const verified = [];
for (const run of runs) {
  const frozen = cases.get(run.caseId), query = questions.get(run.caseId);
  assert(frozen && query && run.manifestSha256 === ma24ManifestSha256(manifest) &&
    ["baseline", "candidate"].includes(run.arm) &&
    !seen.has(`${run.caseId}:${run.arm}`), "Unknown or duplicate MA24 execution");
  seen.add(`${run.caseId}:${run.arm}`);
  if (run.status === "unknown") continue; // Unknown runs are never attested as executed.
  verified.push({ caseId: run.caseId, arm: run.arm,
    ...await verifyMa24PersistedRunBinding(frozen, query, run) });
}
console.log(JSON.stringify({ schema: "ma24-g16-persisted-run-binding-v1", readOnly: true,
  manifestSha256: createHash("sha256").update(bytes[0]).digest("hex"),
  runsSha256: createHash("sha256").update(bytes[2]).digest("hex"),
  verified,
  frozenCorpusBytesVerified: true,
  corpusSnapshotVerified: false, citationsVerified: false, providerReceiptsVerified: false,
}, null, 2));
