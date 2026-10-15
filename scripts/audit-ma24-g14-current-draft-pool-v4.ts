/** Add the reviewed NTIA candidate to the prior G14 pre-freeze draft inventory. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

const priorPath = resolve(process.argv[2] ??
  "tmp/ma24-independent-quarantine/g14-current-draft-pool-v3-2026-10-15.json");
const outputPath = resolve(process.argv[3] ??
  "tmp/ma24-independent-quarantine/g14-current-draft-pool-v4-2026-10-15.json");
const quarantine = resolve("tmp/ma24-independent-quarantine") + sep;
assert(priorPath.startsWith(quarantine) && priorPath.endsWith(".json"));
assert(outputPath.startsWith(quarantine) && outputPath.endsWith(".json"));
assert.notEqual(priorPath, outputPath);
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const priorBytes = await readFile(priorPath);
assert.equal(sha(priorBytes), "4703226adc9b8531ccae6fa840fb35c300cc1a6cd5f3259dad9b06a5d1a24a8b");
const prior = JSON.parse(priorBytes.toString("utf8")) as {
  schema: string; draftCount: number; publicationFamiliesBeforeFinalEligibility: number;
  rows: Array<{ id: string; question: string; file: string; families: string[];
    primaryFormat: string; wholeQuestionNoAnswer: boolean; wholeQuestionCrossDocument: boolean }>;
  proposedTargetsNotFrozen: Record<string, number>;
};
assert.equal(prior.schema, "ma24-g14-current-draft-pool-v3");
assert.equal(prior.draftCount, 22);
assert.equal(prior.rows.length, 22);
assert.equal(prior.publicationFamiliesBeforeFinalEligibility, 12);
assert.equal(new Set(prior.rows.map(row => row.id)).size, 22);
const sourceFile = "ma24-g14-ntia-18ghz-pdf-candidate-2026-10-15.json";
const sourceBytes = await readFile(resolve("docs/evidence", sourceFile));
const source = JSON.parse(sourceBytes.toString("utf8")) as {
  sha256: string; draftQuestions: Array<{ id: string; question: string; primaryFormat: string }>;
  goldCreated: number;
};
assert.equal(source.sha256, "ff6074c82f7c6abbab80a792ad3d1fae111074f64a492395d2c3c7b78f0c8e42");
assert.equal(source.goldCreated, 0);
assert.equal(source.draftQuestions.length, 1);
const draft = source.draftQuestions[0];
assert.equal(draft.id, "ntia-18ghz-g117-iss-footnote-and-manual-recommendation");
assert.equal(draft.primaryFormat, "pdf");
assert.equal(draft.question, draft.question.trim());
assert(draft.question.length > 0 && !prior.rows.some(row => row.id === draft.id));
const sourceUseFile = "ma24-g14-ntia-18ghz-source-use-and-exposure-2026-10-15.json";
const sourceUseBytes = await readFile(resolve("docs/evidence", sourceUseFile));
const sourceUse = JSON.parse(sourceUseBytes.toString("utf8")) as {
  sourceSha256: string; eligibleForFullSetFreezeReview: boolean;
  fullSetFreezeCompleted: boolean; approvedIndependentGold: boolean;
};
assert.equal(sourceUse.sourceSha256, source.sha256);
assert.equal(sourceUse.eligibleForFullSetFreezeReview, true);
assert.equal(sourceUse.fullSetFreezeCompleted, false);
assert.equal(sourceUse.approvedIndependentGold, false);
const rows = [...prior.rows, {
  id: draft.id, question: draft.question, file: sourceFile,
  families: ["NTIA/NASA Report 25-01"], primaryFormat: "pdf",
  wholeQuestionNoAnswer: false, wholeQuestionCrossDocument: false,
}].sort((a, b) => a.id.localeCompare(b.id));
assert.equal(new Set(rows.map(row => row.id)).size, 23);
const countBy = (values: string[]) => Object.fromEntries([...new Set(values)].sort()
  .map(value => [value, values.filter(item => item === value).length]));
const primaryFormatDrafts = countBy(rows.map(row => row.primaryFormat));
assert.deepEqual(primaryFormatDrafts, { "long-pdf": 7, pdf: 2, pptx: 8, xlsx: 6 });
const publicationFamiliesBeforeFinalEligibility = new Set(rows.flatMap(row => row.families)).size;
assert.equal(publicationFamiliesBeforeFinalEligibility, 13);
const hardCaseDrafts = {
  "cross-document": rows.filter(row => row.wholeQuestionCrossDocument).length,
  "new-or-revised": 0, conflict: 0,
  "no-answer": rows.filter(row => row.wholeQuestionNoAnswer).length,
  permission: 0, injection: 0,
};
assert.equal(hardCaseDrafts["cross-document"], 2);
assert.equal(hardCaseDrafts["no-answer"], 1);
const unmetHardCaseTargets = Object.fromEntries(Object.entries(hardCaseDrafts)
  .map(([tag, count]) => [tag, Math.max(0, prior.proposedTargetsNotFrozen[tag] - count)]));
const report = {
  schema: "ma24-g14-current-draft-pool-v4", priorSha256: sha(priorBytes),
  addedSourceSha256: sha(sourceBytes), sourceUseReceiptSha256: sha(sourceUseBytes),
  scope: "Twenty-three current drafts, not Gold eligibility or an approved final stratification",
  draftCount: rows.length, publicationFamiliesBeforeFinalEligibility, primaryFormatDrafts,
  hardCaseDrafts, proposedTargetsNotFrozen: prior.proposedTargetsNotFrozen,
  unmetHardCaseTargets, rows, goldCreated: 0, modelAnswerCalls: 0,
};
await writeFile(outputPath, JSON.stringify(report, null, 2), { flag: "wx" });
console.log(JSON.stringify({ output: outputPath, sha256: sha(await readFile(outputPath)),
  draftCount: report.draftCount, families: publicationFamiliesBeforeFinalEligibility,
  primaryFormatDrafts, hardCaseDrafts, unmetHardCaseTargets }));
