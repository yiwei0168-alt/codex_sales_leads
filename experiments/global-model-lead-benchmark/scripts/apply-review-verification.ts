import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { validateCandidateVerification, type CandidateVerification } from "../lib/review-verification";

type EvidencePacket = {
  schemaVersion: number;
  generatedAt: string;
  countryCode: string;
  providerIdentityHidden: boolean;
  extractionPolicy: string;
  runCount: number;
  occurrenceCount: number;
  deduplicatedCandidateCount: number;
  candidates: Array<{
    blindCandidateId: string;
    companyName: string;
    countryCode: string;
    occurrenceCount: number;
    mergedSourceUrls: string[];
    mergedOfficialWebsiteUrls: string[];
    submissions: Array<{
      blindRunId: string;
      answerRank: number;
      categoryRank: number | null;
      claimedCategory: string;
      claimedChannelClass: string;
      claimedCudyRelationship: string;
      exactAnswerExcerpt: string;
      citedUrls: string[];
      codexPreVerification: {
        companyExists: boolean | null;
        operatesInCountry: boolean | null;
        channelRelevant: boolean | null;
        evidenceSufficient: boolean | null;
        notes: string[];
      };
    }>;
    codexAuditStatus?: string;
  }>;
};

const root = path.resolve("experiments/global-model-lead-benchmark");
const working = path.join(root, "reviews", "working");
const packet = JSON.parse(await readFile(path.join(working, "evidence-packet.local.json"), "utf8")) as EvidencePacket;
const verificationDocument = JSON.parse(await readFile(path.join(working, "verification.local.json"), "utf8")) as {
  schemaVersion: number;
  candidates: CandidateVerification[];
};

if (verificationDocument.schemaVersion !== 1) throw new Error("Unsupported verification schema");
const verificationById = new Map<string, CandidateVerification>();
for (const verification of verificationDocument.candidates) {
  validateCandidateVerification(verification);
  if (verificationById.has(verification.blindCandidateId)) throw new Error(`Duplicate verification ${verification.blindCandidateId}`);
  verificationById.set(verification.blindCandidateId, verification);
}
if (verificationById.size !== packet.candidates.length) {
  throw new Error(`Expected ${packet.candidates.length} verification records, received ${verificationById.size}`);
}

const verifiedCandidates = packet.candidates.map((candidate) => {
  const verification = verificationById.get(candidate.blindCandidateId);
  if (!verification) throw new Error(`Missing verification for ${candidate.blindCandidateId}`);
  return {
    ...candidate,
    submissions: candidate.submissions.map((submission) => ({
      ...submission,
      codexPreVerification: {
        companyExists: verification.companyExists,
        operatesInCountry: verification.operatesInCountry,
        channelRelevant: verification.channelRelevant,
        evidenceSufficient: verification.evidenceSufficient,
        notes: verification.notes,
      },
    })),
    independentVerification: verification,
  };
});

const verifiedPacket = {
  ...packet,
  schemaVersion: 2,
  verificationAppliedAt: new Date().toISOString(),
  candidates: verifiedCandidates,
};

const markdown = [
  `# ${packet.countryCode} Codex-verified potential-partner evidence`,
  "",
  "Provider, model, and product identities are hidden. Codex verification used only independent public-web evidence after all measured runs finished. Current Cudy relationship is metadata with zero fit-score weight.",
  "",
  `- Distinct candidates: ${verifiedCandidates.length}`,
  `- Candidate occurrences: ${packet.occurrenceCount}`,
  "- The next stage applies evidence gates and five potential-fit dimensions; contacts are outside this protocol.",
  "",
  ...verifiedCandidates.flatMap((candidate) => {
    const verification = candidate.independentVerification;
    return [
      `## ${candidate.blindCandidateId} — ${candidate.companyName}`,
      "",
      `Occurrences: ${candidate.occurrenceCount}`,
      "",
      `Codex checks: exists=${verification.companyExists}; target-country operation=${verification.operatesInCountry} (${verification.targetMarketPresence}); channel relevant=${verification.channelRelevant}; evidence sufficient=${verification.evidenceSufficient}; Cudy relationship metadata=${verification.cudyRelationshipEvidence}`,
      "",
      ...verification.notes.map((note) => `- ${note}`),
      "",
      "Independent verification sources:",
      "",
      ...verification.independentEvidenceUrls.map((url) => `- ${url}`),
      "",
      "Unverified or contradicted submission claims:",
      "",
      ...(verification.unverifiedOrContradictedClaims.length > 0
        ? verification.unverifiedOrContradictedClaims.map((claim) => `- ${claim}`)
        : ["- None"]),
      "",
      ...candidate.submissions.flatMap((submission, index) => [
        `### Submission ${index + 1} (${submission.blindRunId}, answer rank ${submission.answerRank})`,
        "",
        `Claimed category: ${submission.claimedCategory}; category rank: ${submission.categoryRank ?? "unclear"}; claimed Cudy relationship: ${submission.claimedCudyRelationship}`,
        "",
        submission.exactAnswerExcerpt,
        "",
      ]),
      "Codex potential-fit assessment: pending",
      "",
    ];
  }),
].join("\n");

await Promise.all([
  writeFile(path.join(working, "evidence-packet.verified.local.json"), `${JSON.stringify(verifiedPacket, null, 2)}\n`, "utf8"),
  writeFile(path.join(working, "evidence-packet.verified.local.md"), `${markdown}\n`, "utf8"),
]);

console.log(JSON.stringify({
  verifiedCandidates: verifiedCandidates.length,
  companyExistenceConfirmed: verificationDocument.candidates.filter((item) => item.companyExists === true).length,
  targetCountryOperationConfirmed: verificationDocument.candidates.filter((item) => item.operatesInCountry === true).length,
  channelRelevantConfirmed: verificationDocument.candidates.filter((item) => item.channelRelevant === true).length,
  currentCudyRelationshipsConfirmed: verificationDocument.candidates.filter((item) => item.cudyRelationshipEvidence === "confirmed_current").length,
}, null, 2));
