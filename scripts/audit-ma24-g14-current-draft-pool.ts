/** Reconcile the retained G14 drafts and selected XLSX alternatives before any Gold freeze. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

const root = resolve("docs/evidence");
const output = resolve(process.argv[2] ?? "tmp/ma24-independent-quarantine/g14-current-draft-pool-v3.json");
assert(output.startsWith(resolve("tmp") + sep) && output.endsWith(".json"));
const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const oldAuditPath = join(root, "ma24-g14-draft-pool-exclusion-audit-2026-10-15.json");
const oldCoveragePath = join(root, "ma24-g14-draft-coverage-gap-2026-10-15.json");
const oldAuditBytes = await readFile(oldAuditPath);
const oldCoverageBytes = await readFile(oldCoveragePath);
const oldAudit = JSON.parse(oldAuditBytes.toString("utf8")) as {
  remainingDraftsForFullSetReview: { ids: string[] };
};
const oldCoverage = JSON.parse(oldCoverageBytes.toString("utf8")) as {
  sourceAuditSha256: string;
  sourceFamilies: Array<{
    family: string; primaryFormat?: string; primaryFormatById?: Record<string, string>; ids: string[];
  }>;
  proposedTargetNotYetFrozen: Record<string, number>;
};
assert.equal(digest(oldAuditBytes), oldCoverage.sourceAuditSha256);
const retainedIds = new Set(oldAudit.remainingDraftsForFullSetReview.ids);
assert.equal(retainedIds.size, 18);
const oldTags = new Map<string, { family: string; primaryFormat: string }>();
for (const family of oldCoverage.sourceFamilies) for (const id of family.ids) {
  const primaryFormat = family.primaryFormatById?.[id] ?? family.primaryFormat;
  assert(primaryFormat && !oldTags.has(id));
  oldTags.set(id, { family: family.family, primaryFormat });
}
assert.deepEqual(new Set(oldTags.keys()), retainedIds);
const newSources = [
  { file: "ma24-g14-bpi-2018-xlsx-candidate-2026-10-15.json", id: "bpi-2018-cash-accruals",
    families: ["BDUK Broadband Performance Indicator March 2018"], primaryFormat: "xlsx",
    wholeQuestionCrossDocument: false },
  { file: "ma24-g14-taking-part-internet-xlsx-no-answer-candidate-2026-10-15.json",
    id: "taking-part-2019-20-rural-age75-intersection-unavailable",
    families: ["Taking Part 2019/20 Internet"], primaryFormat: "xlsx",
    wholeQuestionCrossDocument: false },
  { file: "ma24-g14-govuk-two-xlsx-cross-document-revised-draft-2026-10-15.json",
    id: "govuk-bduk-taking-part-premises-vs-regional-ability",
    families: ["BDUK Broadband Performance Indicator March 2018", "Taking Part 2019/20 Internet"],
    primaryFormat: "xlsx", wholeQuestionCrossDocument: true },
  { file: "ma24-g14-nist-two-source-delay-vs-coupling-draft-2026-10-15.json",
    id: "nist-ran-propagation-vs-dipole-range-alignment",
    families: ["NIST TN 2363", "NIST 2015 industrial wireless measurement workbook"],
    primaryFormat: "xlsx", wholeQuestionCrossDocument: true },
] as const;
const newFiles = new Set<string>(newSources.map(item => item.file));
const oldDrafts: Array<{ id: string; file: string; question: string }> = [];
for (const file of (await readdir(root)).filter(name => /^ma24-g14-.*\.json$/.test(name)).sort()) {
  if (newFiles.has(file)) continue;
  const source = JSON.parse(await readFile(join(root, file), "utf8")) as {
    draftQuestions?: Array<{ id: string; question: string }>;
    draftQuestion?: { id: string; question: string } | string;
  };
  const drafts = [...(source.draftQuestions ?? []),
    ...(source.draftQuestion && typeof source.draftQuestion === "object" ? [source.draftQuestion] : [])];
  oldDrafts.push(...drafts.filter(item => retainedIds.has(item.id))
    .map(item => ({ id: item.id, question: item.question, file })));
}
assert.equal(oldDrafts.length, 18);
assert.deepEqual(new Set(oldDrafts.map(item => item.id)), retainedIds);
const rows = oldDrafts.map(item => ({ ...item, families: [oldTags.get(item.id)!.family],
  primaryFormat: oldTags.get(item.id)!.primaryFormat, wholeQuestionNoAnswer: false,
  wholeQuestionCrossDocument: false }));
const newSourceSha256: Record<string, string> = {};
for (const item of newSources) {
  const raw = await readFile(join(root, item.file));
  newSourceSha256[item.file] = digest(raw);
  const source = JSON.parse(raw.toString("utf8")) as {
    draftQuestion?: string;
    draft?: { id: string; question: string; wholeQuestionNoAnswer?: boolean };
  };
  const draft = source.draft ?? { id: item.id, question: source.draftQuestion, wholeQuestionNoAnswer: false };
  assert.equal(draft.id, item.id);
  const question = draft.question;
  assert(typeof question === "string" && question.trim());
  rows.push({ id: item.id, question, file: item.file,
    families: [...item.families], primaryFormat: item.primaryFormat,
    wholeQuestionNoAnswer: draft.wholeQuestionNoAnswer === true,
    wholeQuestionCrossDocument: item.wholeQuestionCrossDocument });
}
assert.equal(rows.length, 22);
assert.equal(new Set(rows.map(item => item.id)).size, rows.length);
assert.equal(rows.filter(item => item.wholeQuestionNoAnswer).length, 1);
assert.equal(rows.filter(item => item.wholeQuestionCrossDocument).length, 2);
const countBy = (values: string[]) => Object.fromEntries([...new Set(values)].sort()
  .map(value => [value, values.filter(item => item === value).length]));
const primaryFormatDrafts = countBy(rows.map(item => item.primaryFormat));
assert.deepEqual(primaryFormatDrafts, { "long-pdf": 7, pdf: 1, pptx: 8, xlsx: 6 });
const proposed = oldCoverage.proposedTargetNotYetFrozen;
const hardCaseDrafts = {
  "cross-document": rows.filter(item => item.wholeQuestionCrossDocument).length,
  "new-or-revised": 0, conflict: 0,
  "no-answer": rows.filter(item => item.wholeQuestionNoAnswer).length,
  permission: 0, injection: 0,
};
const unmetHardCaseTargets = Object.fromEntries(Object.entries(hardCaseDrafts)
  .map(([tag, count]) => [tag, Math.max(0, proposed[tag] - count)]));
const report = {
  schema: "ma24-g14-current-draft-pool-v3",
  priorAuditSha256: digest(oldAuditBytes), priorCoverageSha256: digest(oldCoverageBytes), newSourceSha256,
  scope: "Twenty-two current drafts, not Gold eligibility or an approved final stratification",
  draftCount: rows.length, publicationFamiliesBeforeFinalEligibility:
    new Set(rows.flatMap(item => item.families)).size,
  primaryFormatDrafts, hardCaseDrafts, proposedTargetsNotFrozen: proposed, unmetHardCaseTargets,
  rows: rows.sort((a, b) => a.id.localeCompare(b.id)),
  goldCreated: 0, modelAnswerCalls: 0,
};
assert.equal(report.publicationFamiliesBeforeFinalEligibility, 12);
await writeFile(output, JSON.stringify(report, null, 2), { flag: "wx" });
console.log(JSON.stringify({ output, sha256: digest(await readFile(output)),
  draftCount: report.draftCount, families: report.publicationFamiliesBeforeFinalEligibility,
  primaryFormatDrafts, hardCaseDrafts, unmetHardCaseTargets }));
