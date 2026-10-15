/** Add the synthetic security annex to the pre-freeze inventory without counting it as a publication. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

const quarantine = resolve("tmp/ma24-independent-quarantine") + sep;
const priorPath = resolve(process.argv[2] ??
  "tmp/ma24-independent-quarantine/g14-current-draft-pool-v4-2026-10-15.json");
const outputPath = resolve(process.argv[3] ??
  "tmp/ma24-independent-quarantine/g14-current-draft-pool-v5-2026-10-15.json");
assert(priorPath.startsWith(quarantine) && priorPath.endsWith(".json"));
assert(outputPath.startsWith(quarantine) && outputPath.endsWith(".json"));
assert.notEqual(priorPath, outputPath);
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const priorBytes = await readFile(priorPath);
assert.equal(sha(priorBytes), "0bb3bba346d26759d773310874e359bcf8ea0f80898148455f3c6ebfe2323fa2");
const prior = JSON.parse(priorBytes.toString("utf8")) as {
  schema: string; draftCount: number; publicationFamiliesBeforeFinalEligibility: number;
  rows: Array<{ id: string; question: string; file: string; primaryFormat: string }>;
  primaryFormatDrafts: Record<string, number>; hardCaseDrafts: Record<string, number>;
  proposedTargetsNotFrozen: Record<string, number>; goldCreated: number; modelAnswerCalls: number;
};
assert.equal(prior.schema, "ma24-g14-current-draft-pool-v4");
assert.equal(prior.draftCount, 23);
assert.equal(prior.rows.length, 23);
assert.equal(prior.publicationFamiliesBeforeFinalEligibility, 13);
assert.equal(prior.goldCreated, 0);
assert.equal(prior.modelAnswerCalls, 0);
const sourceFile = "ma24-g14-security-permission-injection-fixture-2026-10-15.json";
const sourceBytes = await readFile(resolve("docs/evidence", sourceFile));
assert.equal(sha(sourceBytes), "4f8b9b3d0241d6b225e42da043330638bc129d6eb2255944db1d0e362eb49b69");
const source = JSON.parse(sourceBytes.toString("utf8")) as {
  source: { sourceSha256: string; localQuarantinePath: string };
  draftQuestions: Array<{ id: string; question: string; executionProfile: string;
    expectedOutcome: string; tags: string[]; sourceCoordinate: string | null }>;
  independentGoldApproved: boolean; realDualArmRuns: number;
};
assert.equal(source.source.sourceSha256, "d58ae5222337dd8ee8e801018083848297a8cb209da464767f7e5859b18d4396");
assert.equal(sha(await readFile(source.source.localQuarantinePath)), source.source.sourceSha256);
assert.equal(source.independentGoldApproved, false);
assert.equal(source.realDualArmRuns, 0);
assert.equal(source.draftQuestions.length, 3);
const [owner, outsider, injection] = source.draftQuestions;
assert.equal(owner.question, outsider.question);
assert.equal(owner.executionProfile, "owning-account");
assert.equal(outsider.executionProfile, "different-account-without-access");
assert.equal(injection.executionProfile, "owning-account");
assert.deepEqual(source.draftQuestions.map(item => item.expectedOutcome), ["route", "deny", "route"]);
assert.deepEqual(source.draftQuestions.map(item => item.tags), [["permission"], ["permission"], ["injection"]]);
assert(owner.sourceCoordinate && !outsider.sourceCoordinate && injection.sourceCoordinate);
assert(source.draftQuestions.every(item => item.question === item.question.trim() && item.question.length > 0));
assert(source.draftQuestions.every(item => !prior.rows.some(row => row.question === item.question)));
const existingIds = new Set(prior.rows.map(row => row.id));
assert.equal(existingIds.size, 23);
assert(source.draftQuestions.every(item => !existingIds.has(item.id)));
assert.equal(new Set(source.draftQuestions.map(item => item.id)).size, 3);
const annex = source.draftQuestions.map(item => ({ ...item, file: sourceFile,
  primaryFormat: "pdf", sourceClass: "synthetic-private-fixture" as const,
  sourceSha256: source.source.sourceSha256, accountIdFrozen: false,
  independentGoldApproved: false }));
const hardCaseDrafts = { ...prior.hardCaseDrafts,
  permission: prior.hardCaseDrafts.permission + 2,
  injection: prior.hardCaseDrafts.injection + 1 };
const unmetHardCaseTargets = Object.fromEntries(Object.entries(hardCaseDrafts)
  .map(([tag, count]) => [tag, Math.max(0, prior.proposedTargetsNotFrozen[tag] - count)]));
const report = {
  schema: "ma24-g14-current-draft-pool-v5", priorSha256: sha(priorBytes),
  securityReceiptSha256: sha(sourceBytes), sourceSha256: source.source.sourceSha256,
  scope: "23 publication drafts plus 3 synthetic security drafts; none are frozen Gold",
  draftCount: 26, publicationDraftCount: 23, syntheticSecurityDraftCount: 3,
  publicationFamiliesBeforeFinalEligibility: 13, syntheticFixtureFamilies: 1,
  primaryFormatDrafts: { ...prior.primaryFormatDrafts, pdf: prior.primaryFormatDrafts.pdf + 3 },
  hardCaseDrafts, proposedTargetsNotFrozen: prior.proposedTargetsNotFrozen,
  unmetHardCaseTargets, publicationRows: prior.rows, securityAnnex: annex,
  goldCreated: 0, modelAnswerCalls: 0, accountIdsFrozen: false,
};
await writeFile(outputPath, JSON.stringify(report, null, 2), { flag: "wx" });
console.log(JSON.stringify({ output: outputPath, sha256: sha(await readFile(outputPath)),
  draftCount: report.draftCount, publicationDraftCount: report.publicationDraftCount,
  syntheticSecurityDraftCount: report.syntheticSecurityDraftCount,
  hardCaseDrafts, unmetHardCaseTargets, goldCreated: 0 }));
