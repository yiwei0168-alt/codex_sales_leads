import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  selectHighRiskAuditIds,
  selectStratifiedBlindAuditIds,
  validatePotentialPartnerAssessment,
  type PotentialPartnerAssessment,
} from "../lib/codex-audit";

type VerifiedPacket = {
  schemaVersion: number;
  generatedAt: string;
  countryCode: string;
  providerIdentityHidden: boolean;
  occurrenceCount: number;
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
      exactAnswerExcerpt: string;
      citedUrls: string[];
    }>;
  }>;
};

type AssessmentDocument = {
  schemaVersion: number;
  rubricVersion: "four-channel-company-fit-v4";
  assessments: PotentialPartnerAssessment[];
};

type JudgingConfig = {
  humanInTheLoop: {
    blindHumanAuditPercent: number;
    blindHumanAuditMinimum: number;
    highRiskSupplementMaximumPercent: number;
    auditSeed: string;
  };
};

const root = path.resolve("experiments/global-model-lead-benchmark");
const working = path.join(root, "reviews", "working");
const readJson = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, "utf8")) as T;

const [packet, document, config] = await Promise.all([
  readJson<VerifiedPacket>(path.join(working, "evidence-packet.verified.local.json")),
  readJson<AssessmentDocument>(path.join(working, "codex-assessments.local.json")),
  readJson<JudgingConfig>(path.join(root, "config", "judging.json")),
]);
if (!packet.providerIdentityHidden) throw new Error("Human audit input must hide provider identity");
if (document.schemaVersion !== 1 || document.rubricVersion !== "four-channel-company-fit-v4") throw new Error("Unsupported Codex assessment document");
document.assessments.forEach(validatePotentialPartnerAssessment);
const assessmentById = new Map(document.assessments.map((assessment) => [assessment.blindCandidateId, assessment]));
if (assessmentById.size !== document.assessments.length) throw new Error("Duplicate Codex assessment candidate");
const packetIds = new Set(packet.candidates.map((candidate) => candidate.blindCandidateId));
if (packetIds.size !== assessmentById.size || [...packetIds].some((id) => !assessmentById.has(id))) {
  throw new Error("Codex must assess every candidate in the verified evidence packet exactly once");
}

const audit = config.humanInTheLoop;
const statisticalSampleIds = selectStratifiedBlindAuditIds(
  document.assessments,
  audit.blindHumanAuditPercent,
  audit.blindHumanAuditMinimum,
  audit.auditSeed,
);
const highRiskMaximum = Math.ceil(document.assessments.length * audit.highRiskSupplementMaximumPercent / 100);
const riskSupplementIds = selectHighRiskAuditIds(document.assessments, statisticalSampleIds, audit.auditSeed).slice(0, highRiskMaximum);
const selectedIds = [...statisticalSampleIds, ...riskSupplementIds];
const selected = selectedIds.map((id) => {
  const candidate = packet.candidates.find((item) => item.blindCandidateId === id);
  const assessment = assessmentById.get(id);
  if (!candidate || !assessment) throw new Error(`Missing human audit candidate ${id}`);
  return {
    blindCandidateId: id,
    companyName: candidate.companyName,
    countryCode: candidate.countryCode,
    occurrenceCount: candidate.occurrenceCount,
    submittedSourceUrls: candidate.mergedSourceUrls,
    submittedOfficialWebsiteUrls: candidate.mergedOfficialWebsiteUrls,
    independentEvidenceUrls: assessment.independentEvidenceUrls,
    submissions: candidate.submissions.map(({ blindRunId, answerRank, categoryRank, claimedCategory, exactAnswerExcerpt, citedUrls }) => ({
      blindRunId, answerRank, categoryRank, claimedCategory, exactAnswerExcerpt, citedUrls,
    })),
  };
});

const humanPacket = {
  schemaVersion: 1,
  rubricVersion: "four-channel-company-fit-v4",
  generatedAt: new Date().toISOString(),
  countryCode: packet.countryCode,
  providerIdentityHidden: true,
  codexScoresHidden: true,
  relationshipStatusHasZeroScoringWeight: true,
  sampledCandidates: selected.length,
  candidates: selected,
};
const decisionTemplate = {
  schemaVersion: 1,
  rubricVersion: "four-channel-company-fit-v4",
  decisions: selected.map((candidate) => ({
    blindCandidateId: candidate.blindCandidateId,
    reviewedAt: null,
    evidenceGates: {
      submittedIdentityUsable: null,
      companyExists: null,
      targetCountryPresence: null,
      relevantChannel: null,
      sufficientEvidence: null,
      independentProspect: null,
    },
    relationshipStatus: null,
    fitDimensions: null,
    reviewerNotes: null,
  })),
};
const manifest = {
  schemaVersion: 1,
  warning: "LOCAL SECRET: do not show sampling strata or Codex decisions to the human reviewer before completion.",
  generatedAt: new Date().toISOString(),
  candidatePoolSize: document.assessments.length,
  statisticalSampleIds,
  riskSupplementIds,
};
const markdown = [
  "# Potential-partner blind human audit",
  "",
  "Provider/product identity and Codex scores are hidden. Score only the supplied answer excerpts and public evidence.",
  "",
  "Company gates must all pass before assigning fit points. Relationship status is metadata with zero scoring weight.",
  "",
  "Fit dimensions: channel/customer access 0–30; product/use-case fit 0–25; target-market coverage 0–20; execution capability 0–15; strategic complementarity 0–10. A submitted-category mismatch remains eligible: deduct 3 channel points for a credible secondary role or 8 for a material mismatch within the four categories, plus 0–5 product/use-case points only when the mismatch weakens use-case fit; floor dimensions at zero.",
  "",
  "Human review covers company identity, submitted-category alignment, relationship metadata and potential fit. Category mismatch lowers fit but does not independently invalidate a candidate. Contacts and contact methods are outside this protocol.",
  "",
  ...selected.flatMap((candidate) => [
    `## ${candidate.blindCandidateId} — ${candidate.companyName}`,
    "",
    `Occurrences: ${candidate.occurrenceCount}`,
    `Official website: ${candidate.submittedOfficialWebsiteUrls.join(", ") || "not supplied"}`,
    "",
    "Independent evidence:",
    "",
    ...candidate.independentEvidenceUrls.map((url) => `- ${url}`),
    "",
    ...candidate.submissions.flatMap((submission) => [
      `### Submitted answer (${submission.blindRunId}, ${submission.claimedCategory} rank ${submission.categoryRank ?? "unclear"}, overall ${submission.answerRank})`,
      "",
      submission.exactAnswerExcerpt,
      "",
    ]),
    "Gates: identity ___; company ___; country ___; channel ___; evidence ___; independent prospect ___",
    "",
    "Relationship: confirmed_existing / no_public_evidence / unknown",
    "",
    "Fit: channel ___/30; product ___/25; market ___/20; execution ___/15; complementarity ___/10",
    "",
    "Reviewer notes: ____________________",
    "",
  ]),
].join("\n");

await mkdir(working, { recursive: true });
await Promise.all([
  writeFile(path.join(working, "human-audit-packet.local.json"), `${JSON.stringify(humanPacket, null, 2)}\n`, "utf8"),
  writeFile(path.join(working, "human-audit-packet.local.md"), `${markdown}\n`, "utf8"),
  writeFile(path.join(working, "human-audit-decisions.local.template.json"), `${JSON.stringify(decisionTemplate, null, 2)}\n`, "utf8"),
  writeFile(path.join(working, "human-audit-manifest.local.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
]);

console.log(JSON.stringify({
  candidatePoolSize: document.assessments.length,
  statisticalSampleSize: statisticalSampleIds.length,
  highRiskSupplementSize: riskSupplementIds.length,
  totalBlindHumanAuditCandidates: selected.length,
}, null, 2));
