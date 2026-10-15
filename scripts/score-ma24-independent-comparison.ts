/** Read-only, no-provider scorer for a frozen MA24 G16 comparison. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { verifyMa24PersistedRunBinding } from "../src/lib/knowledge/evaluation/ma24-persisted-run-binding";
import { assertMa24CorpusSnapshotBytes } from "../src/lib/knowledge/evaluation/ma24-corpus-snapshot";
import { assertMa24FrozenSnapshotBytes, assertMa24SourceSetMatchesManifest,
  scoreMa24IndependentComparison, type Ma24FrozenManifest, type Ma24Run,
  type Ma24GoldSnapshot, type Ma24SourceSetSnapshot, type Ma24Verdict } from "../src/lib/knowledge/evaluation/ma24-independent-comparison";

const root = resolve("tmp/ma24-independent-evaluation");
const paths = process.argv.slice(2).map(value => resolve(value));
assert.equal(paths.length, 7, "Usage: score-ma24-independent-comparison <manifest.json> <runs.json> <verdicts.json> <source-set.json> <gold.json> <code-and-config.json> <corpus.json>");
for (const path of paths) assert(path.startsWith(root + sep) && path.endsWith(".json"),
  "Only local MA24 independent-evaluation JSON files may be scored");
const bytes = await Promise.all(paths.map(path => readFile(path)));
const [manifest, runs, verdicts] = bytes.slice(0, 3).map(value => JSON.parse(value.toString("utf8"))) as
  [Ma24FrozenManifest, Ma24Run[], Ma24Verdict[]];
assertMa24FrozenSnapshotBytes(manifest, {
  sourceSet: bytes[3], gold: bytes[4], codeAndConfig: bytes[5], corpus: bytes[6],
});
assertMa24CorpusSnapshotBytes(manifest, bytes[6], manifest.corpusSnapshotSha256);
const sourceSet = JSON.parse(bytes[3].toString("utf8")) as Ma24SourceSetSnapshot;
assertMa24SourceSetMatchesManifest(manifest, sourceSet);
const frozenCases = new Map(manifest.cases.map(item => [item.caseId, item]));
const questions = new Map(sourceSet.cases.map(item => [item.caseId, item.query]));
const persistedBindings = [];
for (const run of runs) {
  if (run.status === "unknown") continue; // Unknown runs block the quality gate without a task claim.
  const frozen = frozenCases.get(run.caseId), question = questions.get(run.caseId);
  assert(frozen && question, "MA24 run has no frozen question");
  persistedBindings.push({ caseId: run.caseId, arm: run.arm,
    ...await verifyMa24PersistedRunBinding(frozen, question, run) });
}
const gold = JSON.parse(bytes[4].toString("utf8")) as Ma24GoldSnapshot;
const result = scoreMa24IndependentComparison({ manifest, gold, runs, verdicts });
const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
console.log(JSON.stringify({ schema: "ma24-g16-scored-comparison-v1", readOnly: true,
  inputSha256: { manifest: hash(bytes[0]), runs: hash(bytes[1]), verdicts: hash(bytes[2]),
    sourceSet: hash(bytes[3]), gold: hash(bytes[4]), codeAndConfig: hash(bytes[5]),
    corpus: hash(bytes[6]) },
  persistedBindings, ...result }, null, 2));
