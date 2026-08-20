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
    claimedPublicEmails: string[];
    claimedPublicPhones: string[];
    submissions: Array<{
      blindRunId: string;
      answerRank: number;
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
    reviewerDecision: Record<string, unknown>;
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
  "# Germany blinded evidence review",
  "",
  "Provider, model, and product identities are hidden. Codex verification used only independent public-web evidence after all measured runs finished.",
  "",
  `- Distinct candidates: ${verifiedCandidates.length}`,
  `- Candidate occurrences: ${packet.occurrenceCount}`,
  "- Review classes: confirmed_current_cudy, qualified_tier1, important_downstream, invalid",
  "- Invalid reasons: industry_mismatch, country_mismatch, insufficient_evidence, duplicate, not_a_company, not_independent_sales_lead",
  "",
  ...verifiedCandidates.flatMap((candidate) => {
    const verification = candidate.independentVerification;
    return [
      `## ${candidate.blindCandidateId} — ${candidate.companyName}`,
      "",
      `Occurrences: ${candidate.occurrenceCount}`,
      "",
      `Codex checks: exists=${verification.companyExists}; Germany operation=${verification.operatesInCountry} (${verification.targetMarketPresence}); channel relevant=${verification.channelRelevant}; evidence sufficient=${verification.evidenceSufficient}; Cudy relationship=${verification.cudyRelationshipEvidence}`,
      "",
      ...verification.notes.map((note) => `- ${note}`),
      "",
      "Independent verification sources:",
      "",
      ...verification.independentEvidenceUrls.map((url) => `- ${url}`),
      "",
      "Verified named contacts claimed in submissions:",
      "",
      ...(verification.verifiedNamedContactClaims.length > 0
        ? verification.verifiedNamedContactClaims.map((claim) => `- ${claim.name} — ${claim.role} — ${claim.sourceUrl}`)
        : ["- None"]),
      "",
      "Verified public contact methods claimed in submissions:",
      "",
      ...(verification.verifiedPublicContactMethodClaims.length > 0
        ? verification.verifiedPublicContactMethodClaims.map((claim) => `- ${claim.value} — ${claim.sourceUrl}`)
        : ["- None"]),
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
        `Claimed class: ${submission.claimedChannelClass}; claimed Cudy relationship: ${submission.claimedCudyRelationship}`,
        "",
        submission.exactAnswerExcerpt,
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
  GermanyOperationConfirmed: verificationDocument.candidates.filter((item) => item.operatesInCountry === true).length,
  channelRelevantConfirmed: verificationDocument.candidates.filter((item) => item.channelRelevant === true).length,
  currentCudyRelationshipsConfirmed: verificationDocument.candidates.filter((item) => item.cudyRelationshipEvidence === "confirmed_current").length,
  namedContactClaimsVerified: verificationDocument.candidates.reduce((sum, item) => sum + item.verifiedNamedContactClaims.length, 0),
  publicContactMethodClaimsVerified: verificationDocument.candidates.reduce((sum, item) => sum + item.verifiedPublicContactMethodClaims.length, 0),
}, null, 2));
