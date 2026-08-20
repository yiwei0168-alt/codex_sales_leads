import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  answerDigest,
  deduplicateOccurrences,
  extractCandidateOccurrences,
  isDegenerateProcessOutput,
  loadOrCreateBlindSalt,
  type MeasuredRun,
} from "../lib/normalization";

const root = path.resolve("experiments/global-model-lead-benchmark");
const rawDirectory = path.join(root, "runs", "raw");
const workingDirectory = path.join(root, "reviews", "working");
const saltPath = path.join(root, "reviews", ".blind-salt");
const eligibleFilePattern = /^2026-08-20-DE-(openai|deepseek|kimi|grok|sales-lead-copilot)-r[123]\.json$/;

await mkdir(workingDirectory, { recursive: true });
const secretSalt = loadOrCreateBlindSalt(saltPath);
const filenames = (await readdir(rawDirectory)).filter((name) => eligibleFilePattern.test(name)).sort();
const runs: Array<{ filename: string; run: MeasuredRun }> = [];

for (const filename of filenames) {
  const parsed = JSON.parse(await readFile(path.join(rawDirectory, filename), "utf8")) as MeasuredRun;
  if (parsed.nativeSearchEvidence !== "observed") continue;
  runs.push({ filename, run: parsed });
}

const runResults = runs.map(({ filename, run }) => {
  const occurrences = extractCandidateOccurrences(run, secretSalt);
  return {
    filename,
    providerId: run.providerId,
    modelId: run.modelId,
    repetition: run.repetition,
    answerSha256: answerDigest(run.answerText),
    degenerateProcessOutput: isDegenerateProcessOutput(run.answerText),
    extractedCandidateCount: occurrences.length,
    occurrences,
  };
});
const allOccurrences = runResults.flatMap((result) => result.occurrences);
const deduplicated = deduplicateOccurrences(allOccurrences);

const identityMap = {
  generatedAt: new Date().toISOString(),
  warning: "LOCAL SECRET: contains provider/run identities and must never be committed.",
  runs: runResults.map(({ filename, providerId, modelId, repetition, answerSha256, degenerateProcessOutput, extractedCandidateCount, occurrences }) => ({
    filename,
    providerId,
    modelId,
    repetition,
    answerSha256,
    degenerateProcessOutput,
    extractedCandidateCount,
    blindRunId: occurrences[0]?.blindRunId ?? null,
  })),
  candidates: deduplicated.map((candidate) => ({
    blindCandidateId: candidate.blindCandidateId,
    canonicalKey: candidate.canonicalKey,
    companyName: candidate.companyName,
    occurrences: candidate.occurrences.map((occurrence) => ({
      blindRunId: occurrence.blindRunId,
      answerRank: occurrence.answerRank,
    })),
  })),
};

const evidencePacket = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  countryCode: "DE",
  providerIdentityHidden: true,
  extractionPolicy: "Only discrete numbered headings, numbered table rows, and standalone bold candidate entries in the final answer are eligible; incidental prose and search plans are excluded.",
  runCount: runResults.length,
  occurrenceCount: allOccurrences.length,
  deduplicatedCandidateCount: deduplicated.length,
  candidates: deduplicated.map((candidate) => ({
    blindCandidateId: candidate.blindCandidateId,
    companyName: candidate.companyName,
    countryCode: candidate.countryCode,
    occurrenceCount: candidate.occurrenceCount,
    mergedSourceUrls: candidate.mergedSourceUrls,
    claimedPublicEmails: candidate.mergedClaimedEmails,
    claimedPublicPhones: candidate.mergedClaimedPhones,
    submissions: candidate.occurrences.map((occurrence) => ({
      blindRunId: occurrence.blindRunId,
      answerRank: occurrence.answerRank,
      claimedChannelClass: occurrence.claimedChannelClass,
      claimedCudyRelationship: occurrence.claimedCudyRelationship,
      exactAnswerExcerpt: occurrence.answerExcerpt,
      citedUrls: occurrence.sourceUrls,
      codexPreVerification: occurrence.codexPreVerification,
    })),
    reviewerDecision: {
      candidateClass: null,
      reason: null,
      companyExists: null,
      operatesInCountry: null,
      channelRelevant: null,
      evidenceSufficient: null,
      contactsVerified: null,
      publicContactMethodsVerified: null,
      duplicateOfBlindCandidateId: null,
      reviewerNotes: null,
      reviewedAt: null,
    },
  })),
};

const markdown = [
  "# Germany blinded evidence review",
  "",
  "Provider, model, and product identities are intentionally hidden. Review only the cited evidence and exact submitted excerpts.",
  "",
  `- Distinct candidates: ${deduplicated.length}`,
  `- Candidate occurrences: ${allOccurrences.length}`,
  "- Review classes: confirmed_current_cudy, qualified_tier1, important_downstream, invalid",
  "- Invalid reasons: industry_mismatch, country_mismatch, insufficient_evidence, duplicate, not_a_company, not_independent_sales_lead",
  "",
  ...deduplicated.flatMap((candidate) => [
    `## ${candidate.blindCandidateId} — ${candidate.companyName}`,
    "",
    `Occurrences: ${candidate.occurrenceCount}`,
    "",
    "Cited URLs:",
    "",
    ...(candidate.mergedSourceUrls.length > 0 ? candidate.mergedSourceUrls.map((url) => `- ${url}`) : ["- None supplied in the final answer"]),
    "",
    "Claimed public contact methods:",
    "",
    ...(candidate.mergedClaimedEmails.length + candidate.mergedClaimedPhones.length > 0
      ? [...candidate.mergedClaimedEmails, ...candidate.mergedClaimedPhones].map((value) => `- ${value}`)
      : ["- None"]),
    "",
    ...candidate.occurrences.flatMap((occurrence, index) => [
      `### Submission ${index + 1} (${occurrence.blindRunId}, answer rank ${occurrence.answerRank})`,
      "",
      `Claimed class: ${occurrence.claimedChannelClass}; claimed Cudy relationship: ${occurrence.claimedCudyRelationship}`,
      "",
      occurrence.answerExcerpt,
      "",
    ]),
    "Reviewer decision: ____________________",
    "",
    "Reason: ____________________",
    "",
    "Verified contacts / public methods: ____________________",
    "",
    "Notes: ____________________",
    "",
  ]),
].join("\n");

await Promise.all([
  writeFile(path.join(workingDirectory, "identity-map.local.json"), `${JSON.stringify(identityMap, null, 2)}\n`, "utf8"),
  writeFile(path.join(workingDirectory, "evidence-packet.local.json"), `${JSON.stringify(evidencePacket, null, 2)}\n`, "utf8"),
  writeFile(path.join(workingDirectory, "evidence-packet.local.md"), `${markdown}\n`, "utf8"),
]);

console.log(JSON.stringify({
  eligibleAnswerRuns: runResults.length,
  degenerateProcessRuns: runResults.filter((result) => result.degenerateProcessOutput).length,
  candidateOccurrences: allOccurrences.length,
  deduplicatedCandidates: deduplicated.length,
  perRun: runResults.map((result) => ({
    filename: result.filename,
    degenerateProcessOutput: result.degenerateProcessOutput,
    extractedCandidateCount: result.extractedCandidateCount,
  })),
}, null, 2));
