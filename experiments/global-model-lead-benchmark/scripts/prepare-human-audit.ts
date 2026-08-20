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
    claimedPublicEmails: string[];
    claimedPublicPhones: string[];
    submissions: Array<{
      blindRunId: string;
      answerRank: number;
      exactAnswerExcerpt: string;
      citedUrls: string[];
    }>;
  }>;
};

type AssessmentDocument = {
  schemaVersion: number;
  rubricVersion: "potential-fit-v3";
  assessments: PotentialPartnerAssessment[];
};

type JudgingConfig = {
  humanInTheLoop: {
    blindHumanAuditPercent: number;
    blindHumanAuditMinimum: number;
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
if (document.schemaVersion !== 1 || document.rubricVersion !== "potential-fit-v3") throw new Error("Unsupported Codex assessment document");
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
const riskSupplementIds = selectHighRiskAuditIds(document.assessments, statisticalSampleIds, audit.auditSeed);
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
    independentEvidenceUrls: assessment.independentEvidenceUrls,
    namedContactClaims: assessment.namedContacts.map(({ claimId, name, role, sourceUrl }) => ({ claimId, name, role, sourceUrl })),
    contactMethodClaims: assessment.contactMethods.map(({ claimId, value, sourceUrl }) => ({ claimId, value, sourceUrl })),
    submissions: candidate.submissions.map(({ blindRunId, answerRank, exactAnswerExcerpt, citedUrls }) => ({
      blindRunId, answerRank, exactAnswerExcerpt, citedUrls,
    })),
  };
});

const humanPacket = {
  schemaVersion: 1,
  rubricVersion: "potential-fit-v3",
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
  rubricVersion: "potential-fit-v3",
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
    namedContactScores: candidate.namedContactClaims.map((claim) => ({ claimId: claim.claimId, relevanceScore: null })),
    contactMethodScores: candidate.contactMethodClaims.map((claim) => ({ claimId: claim.claimId, usefulnessScore: null })),
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
  "Fit dimensions: channel/customer access 0–30; product/use-case fit 0–25; target-market coverage 0–20; execution capability 0–15; strategic complementarity 0–10.",
  "",
  "Named contacts: 0–3. Contact methods: 0–2.",
  "",
  ...selected.flatMap((candidate) => [
    `## ${candidate.blindCandidateId} — ${candidate.companyName}`,
    "",
    `Occurrences: ${candidate.occurrenceCount}`,
    "",
    "Independent evidence:",
    "",
    ...candidate.independentEvidenceUrls.map((url) => `- ${url}`),
    "",
    "Named-contact claims:",
    "",
    ...(candidate.namedContactClaims.length > 0
      ? candidate.namedContactClaims.map((claim) => `- ${claim.claimId}: ${claim.name} — ${claim.role} — ${claim.sourceUrl} — score: ___ / 3`)
      : ["- None"]),
    "",
    "Contact-method claims:",
    "",
    ...(candidate.contactMethodClaims.length > 0
      ? candidate.contactMethodClaims.map((claim) => `- ${claim.claimId}: ${claim.value} — ${claim.sourceUrl} — score: ___ / 2`)
      : ["- None"]),
    "",
    ...candidate.submissions.flatMap((submission) => [
      `### Submitted answer (${submission.blindRunId}, rank ${submission.answerRank})`,
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
