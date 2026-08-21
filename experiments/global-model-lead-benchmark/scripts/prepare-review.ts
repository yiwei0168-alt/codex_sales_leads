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
import { loadPilotPrompt } from "../lib/benchmark";

const root = path.resolve("experiments/global-model-lead-benchmark");
const rawDirectory = path.join(root, "runs", "raw");
const workingDirectory = path.join(root, "reviews", "working");
const saltPath = path.join(root, "reviews", ".blind-salt");
const { pilot } = await loadPilotPrompt();
const escapedArtifactTag = pilot.artifactTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const eligibleFilePattern = new RegExp(`^\\d{4}-\\d{2}-\\d{2}-${pilot.countryCode}-${escapedArtifactTag}-(openai|claude|deepseek|kimi|grok|gemini|sales-lead-copilot)-r[123](?:-a\\d+)?\\.json$`);

await mkdir(workingDirectory, { recursive: true });
const secretSalt = loadOrCreateBlindSalt(saltPath);
const filenames = (await readdir(rawDirectory)).filter((name) => eligibleFilePattern.test(name)).sort();
const runs: Array<{ filename: string; run: MeasuredRun }> = [];

for (const filename of filenames) {
  const parsed = JSON.parse(await readFile(path.join(rawDirectory, filename), "utf8")) as MeasuredRun;
  if (parsed.nativeSearchEvidence !== "observed") continue;
  runs.push({ filename, run: parsed });
}

const assessedRuns = runs.map(({ filename, run }) => {
  const occurrences = extractCandidateOccurrences(run, secretSalt);
  return {
    filename,
    providerId: run.providerId,
    modelId: run.modelId,
    repetition: run.repetition,
    attempt: run.attempt ?? 1,
    answerSha256: answerDigest(run.answerText),
    degenerateProcessOutput: isDegenerateProcessOutput(run.answerText),
    extractedCandidateCount: occurrences.length,
    occurrences,
  };
});
const effectiveRuns = assessedRuns.filter((result) => !result.degenerateProcessOutput && result.extractedCandidateCount > 0);
const selectedByRound = new Map<string, (typeof effectiveRuns)[number]>();
for (const result of effectiveRuns.sort((left, right) => left.attempt - right.attempt || left.filename.localeCompare(right.filename))) {
  const key = `${result.providerId}\u0000${result.modelId}\u0000${result.repetition}`;
  if (!selectedByRound.has(key)) selectedByRound.set(key, result);
}
const runResults = [...selectedByRound.values()].sort((left, right) => left.filename.localeCompare(right.filename));
const allOccurrences = runResults.flatMap((result) => result.occurrences);
const deduplicated = deduplicateOccurrences(allOccurrences);

const identityMap = {
  generatedAt: new Date().toISOString(),
  protocolVersion: pilot.protocolVersion,
  artifactTag: pilot.artifactTag,
  warning: "LOCAL SECRET: contains provider/run identities and must never be committed.",
  selectionPolicy: "For each provider/model/repetition, use the earliest native-search attempt with a non-degenerate answer and at least one extractable candidate.",
  excludedRuns: assessedRuns.filter((result) => !runResults.includes(result)).map((result) => ({
    filename: result.filename,
    providerId: result.providerId,
    modelId: result.modelId,
    repetition: result.repetition,
    attempt: result.attempt,
    degenerateProcessOutput: result.degenerateProcessOutput,
    extractedCandidateCount: result.extractedCandidateCount,
  })),
  runs: runResults.map(({ filename, providerId, modelId, repetition, attempt, answerSha256, degenerateProcessOutput, extractedCandidateCount, occurrences }) => ({
    filename,
    providerId,
    modelId,
    repetition,
    attempt,
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
  protocolVersion: pilot.protocolVersion,
  artifactTag: pilot.artifactTag,
  countryCode: pilot.countryCode,
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
    mergedOfficialWebsiteUrls: candidate.mergedOfficialWebsiteUrls,
    submissions: candidate.occurrences.map((occurrence) => ({
      blindRunId: occurrence.blindRunId,
      answerRank: occurrence.answerRank,
      categoryRank: occurrence.categoryRank,
      claimedCategory: occurrence.claimedCategory,
      claimedChannelClass: occurrence.claimedChannelClass,
      claimedCudyRelationship: occurrence.claimedCudyRelationship,
      exactAnswerExcerpt: occurrence.answerExcerpt,
      citedUrls: occurrence.sourceUrls,
      codexPreVerification: occurrence.codexPreVerification,
    })),
    codexAuditStatus: "pending",
  })),
};

const markdown = [
  `# ${pilot.countryName} potential-partner evidence packet`,
  "",
  "Provider, model, and product identities are intentionally hidden. Codex must verify only the submitted candidates and claims; it must not add or repair leads.",
  "",
  `- Distinct candidates: ${deduplicated.length}`,
  `- Candidate occurrences: ${allOccurrences.length}`,
  "- Current Cudy relationship is metadata with zero potential-fit scoring weight.",
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
    "Claimed official company website URLs:",
    "",
    ...(candidate.mergedOfficialWebsiteUrls.length > 0 ? candidate.mergedOfficialWebsiteUrls.map((url) => `- ${url}`) : ["- None supplied in the final answer"]),
    "",
    ...candidate.occurrences.flatMap((occurrence, index) => [
      `### Submission ${index + 1} (${occurrence.blindRunId}, answer rank ${occurrence.answerRank})`,
      "",
      `Claimed category: ${occurrence.claimedCategory}; category rank: ${occurrence.categoryRank ?? "unclear"}; claimed Cudy relationship: ${occurrence.claimedCudyRelationship}`,
      "",
      occurrence.answerExcerpt,
      "",
    ]),
    "Codex evidence assessment: pending",
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
  excludedNativeSearchRuns: assessedRuns.length - runResults.length,
  degenerateProcessRuns: assessedRuns.filter((result) => result.degenerateProcessOutput).length,
  candidateOccurrences: allOccurrences.length,
  deduplicatedCandidates: deduplicated.length,
  perRun: runResults.map((result) => ({
    filename: result.filename,
    degenerateProcessOutput: result.degenerateProcessOutput,
    extractedCandidateCount: result.extractedCandidateCount,
  })),
}, null, 2));
