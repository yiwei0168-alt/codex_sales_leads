/** Add one source-checked revision draft to the provisional G14 inventory. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

const root = resolve("tmp/ma24-independent-quarantine") + sep;
const output = resolve(process.argv[2] ?? "tmp/ma24-independent-quarantine/g14-current-draft-pool-v6-2026-10-15.json");
assert(output.startsWith(root) && output.endsWith(".json"));
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const priorBytes = await readFile("tmp/ma24-independent-quarantine/g14-current-draft-pool-v5-2026-10-15.json");
assert.equal(sha(priorBytes), "2cb4c56dd2f35e88a43ebdb1eaa2e15246438ee5727d9d6c7d31b9c86d3184c7");
const prior = JSON.parse(priorBytes.toString("utf8"));
assert.equal(prior.schema, "ma24-g14-current-draft-pool-v5");
assert.equal(prior.draftCount, 26);
assert.equal(prior.publicationRows.length, 23);
assert.equal(prior.securityAnnex.length, 3);
assert.equal(prior.goldCreated, 0);
assert.equal(prior.modelAnswerCalls, 0);

const sourceBytes = await readFile("docs/evidence/ma24-g14-etsi-zod-revision-source-audit-2026-10-15.json");
assert.equal(sha(sourceBytes), "683ec61dd73a2921f8154c2541f9e5b3852d5f252a09f1fe03fe5ce482f70b75");
const source = JSON.parse(sourceBytes.toString("utf8"));
assert.equal(source.sources.length, 2);
for (const item of source.sources)
  assert.equal(sha(await readFile(item.localQuarantinePath)), item.sha256);

const reviewBytes = await readFile("docs/evidence/ma24-g14-etsi-zod-revision-followup-2026-10-15.json");
const review = JSON.parse(reviewBytes.toString("utf8"));
assert.equal(review.status, "bounded-source-and-question-review-complete-provisional-draft");
assert.equal(review.goldApproved, false);
assert.equal(review.review.wholeSetIndependenceProven, false);
assert.equal(review.review.productCitationVerified, false);
assert.deepEqual(review.sourceSha256s, source.sources.map((item: { sha256: string }) => item.sha256));

const candidateBytes = await readFile("tmp/ma24-independent-quarantine/etsi-zod-revision-candidate-v1.json");
assert.equal(sha(candidateBytes), "9167bf2410a3767b7a8333f44bca09a229243426d87185cd76463b6fead9b781");
const candidate = JSON.parse(candidateBytes.toString("utf8"));
assert.equal(candidate.id, review.draft.id);
assert.equal(candidate.question, review.draft.question);
assert(candidate.question.trim() && candidate.question === candidate.question.trim());
assert(!prior.publicationRows.some((row: { id: string; question: string }) =>
  row.id === candidate.id || row.question === candidate.question));
assert(!prior.securityAnnex.some((row: { id: string }) => row.id === candidate.id));

const formatDrafts = { ...prior.primaryFormatDrafts,
  "long-pdf": prior.primaryFormatDrafts["long-pdf"] + 1 };
const hardDrafts = { ...prior.hardCaseDrafts,
  "new-or-revised": prior.hardCaseDrafts["new-or-revised"] + 1 };
const unmet = { ...prior.unmetHardCaseTargets,
  "new-or-revised": Math.max(0, prior.proposedTargetsNotFrozen["new-or-revised"] - hardDrafts["new-or-revised"]) };
const report = {
  ...prior,
  schema: "ma24-g14-current-draft-pool-v6",
  priorSha256: sha(priorBytes),
  revisionSourceAuditSha256: sha(sourceBytes),
  revisionReviewSha256: sha(reviewBytes),
  scope: "24 publication drafts plus 3 synthetic security drafts; none are frozen Gold",
  draftCount: 27, publicationDraftCount: 24,
  primaryFormatDrafts: formatDrafts,
  hardCaseDrafts: hardDrafts,
  unmetHardCaseTargets: unmet,
  publicationRows: [...prior.publicationRows, {
    id: candidate.id, question: candidate.question,
    file: "ma24-g14-etsi-zod-revision-followup-2026-10-15.json",
    families: ["ETSI TR 138 901 V19.5.0"], primaryFormat: "long-pdf",
    sourceSha256s: source.sources.map((item: { sha256: string }) => item.sha256),
    hardCaseTags: ["new-or-revised"], wholeQuestionNoAnswer: false,
    wholeQuestionCrossDocument: false, independentGoldApproved: false,
    productCitationVerified: false,
  }],
  goldCreated: 0, modelAnswerCalls: 0,
};
assert.equal(report.publicationRows.length, report.publicationDraftCount);
assert.equal(report.publicationFamiliesBeforeFinalEligibility, 13);
assert.equal(report.hardCaseDrafts["new-or-revised"], 1);
await writeFile(output, JSON.stringify(report, null, 2), { flag: "wx" });
console.log(JSON.stringify({ output, sha256: sha(await readFile(output)),
  draftCount: report.draftCount, newOrRevisedDrafts: 1,
  independentGoldApproved: 0, modelAnswerCalls: 0 }));
