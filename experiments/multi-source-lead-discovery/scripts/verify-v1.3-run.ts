import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { providerNeutralScoringEvidence, type SharedDossierArtifact } from "../lib/evidence-dossier";

interface MasterArtifact extends SharedDossierArtifact {
  sourceSeedSha256: string;
  collectionResults: Array<{
    dossierId: string;
    officialPagesAttempted: number;
    officialPagesCollected: number;
    fallbackSourcesCollected: number;
  }>;
  summary: { canonicalTotal: number; completed: number; remaining: number };
}

interface ScoreArtifact {
  runId: string;
  summary: {
    canonicalCompanies: number;
    uniqueSystemLaneCompanyOccurrences: number;
    duplicateCanonicalOccurrencesSuppressed: number;
    eligibleOccurrences: number;
    rejectedOccurrences: number;
  };
  scores: Array<{ dossierId: string; systemId: string; channelId: string; score: number; failedGates: string[] }>;
}

interface BlindPacket {
  runId: string;
  candidates: Array<{
    blindCandidateId: string;
    reviewLane: string;
    evidenceItems: Array<{ sourceType: string }>;
  }>;
}

interface HumanDecisionCheckpoint {
  runId: string;
  decisions: unknown[];
}

interface HumanAuditComparison {
  runId: string;
  evaluationView: string;
  humanAuditCheckpointCommit: string;
  humanDecisionsFrozenBeforeDeblinding: boolean;
  passed: boolean;
  failedThresholds: string[];
  metrics: {
    coreSampleSize: number;
    problemDiagnosticSize: number;
    gateFieldAgreement: number;
    submittedLaneAgreement: number;
    quadraticWeightedKappa: number;
    scoreMeanAbsoluteError: number;
  };
  calibrationDecision: { status: string; leaderboardStatus: string };
}

function assertBlind(value: unknown, location = "packet"): void {
  const forbidden = new Set(["systemId", "provider", "providerId", "rank", "submittedRank", "score", "modelScore", "occurrenceCount", "sampleType"]);
  if (Array.isArray(value)) return value.forEach((item, index) => assertBlind(item, `${location}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    assert(!forbidden.has(key), `Blind packet leaked ${location}.${key}`);
    assertBlind(child, `${location}.${key}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const runId = process.argv.find((value) => value.startsWith("--run-id="))?.slice(9) ?? "2026-08-27-de-v1.3";
const root = path.resolve("experiments/multi-source-lead-discovery/artifacts/runs", runId);
const seedBytes = await readFile(path.join(root, "evidence/shared-evidence-dossiers.seed.json"));
const seed = JSON.parse(seedBytes.toString("utf8")) as SharedDossierArtifact;
const master = JSON.parse(await readFile(path.join(root, "evidence/shared-evidence-dossiers.v1.json"), "utf8")) as MasterArtifact;
const scores = JSON.parse(await readFile(path.join(root, "scoring/all-candidate-scores.json"), "utf8")) as ScoreArtifact;
const calibratedScores = JSON.parse(await readFile(path.join(root, "scoring/calibrated/all-candidate-scores.v1.3.1.json"), "utf8")) as ScoreArtifact;
const blindPacket = JSON.parse(await readFile(path.join(root, "scoring/blind-audit-packet.json"), "utf8")) as BlindPacket;
const decisionBytes = await readFile(path.join(root, "scoring/human-audit-decisions.blind.json"));
const decisions = JSON.parse(decisionBytes.toString("utf8")) as HumanDecisionCheckpoint;
const initialAudit = JSON.parse(await readFile(path.join(root, "scoring/human-audit-comparison.json"), "utf8")) as HumanAuditComparison;
const calibrationFit = JSON.parse(await readFile(path.join(root, "scoring/calibrated/human-audit-recalibration-fit.v1.3.1.json"), "utf8")) as HumanAuditComparison;

assert(seed.runId === runId && master.runId === runId && scores.runId === runId, "Every artifact must use the target run ID");
assert(seed.canonicalCompanyCount === 465 && seed.submittedOccurrenceCount === 555,
  "The v1.3 seed must preserve the frozen 465 canonical companies and 555 occurrences");
assert(master.sourceSeedSha256 === createHash("sha256").update(seedBytes).digest("hex"), "Master evidence must bind to the exact seed bytes");
assert(master.companies.length === 465 && master.summary.canonicalTotal === 465, "Master evidence must contain all 465 canonical companies");
assert(master.collectionResults.length === 465 && master.summary.completed === 465 && master.summary.remaining === 0,
  "Shared evidence collection must be complete before scoring");
assert(new Set(master.companies.map((company) => company.dossierId)).size === 465, "Dossier IDs must be unique");
assert(master.collectionResults.every((result) => result.officialPagesAttempted <= 5
  && result.officialPagesCollected <= result.officialPagesAttempted && result.fallbackSourcesCollected <= 2),
"No company may exceed the frozen 5+2 shared evidence budget");
assert(master.companies.flatMap(providerNeutralScoringEvidence).every((item) => item.sourceType !== "discovery-summary"),
  "Discovery-only material must not enter the scoring view");
assert(master.companies.flatMap(providerNeutralScoringEvidence).every((item) =>
  !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(item.excerpt)
  && !/(?:\+?\d[\d\s()./-]{7,}\d)/.test(item.excerpt)), "Scoring evidence contains an unredacted contact");
assert(scores.summary.canonicalCompanies === 465, "Scoring must cover every canonical company");
assert(scores.scores.length === scores.summary.uniqueSystemLaneCompanyOccurrences, "Score row summary is inconsistent");
assert(scores.scores.length + scores.summary.duplicateCanonicalOccurrencesSuppressed === 555,
  "Every submitted occurrence must be scored or explicitly suppressed as a canonical duplicate");
assert(scores.summary.eligibleOccurrences + scores.summary.rejectedOccurrences === scores.scores.length,
  "Eligibility summary is inconsistent");
assert(new Set(scores.scores.map((item) => `${item.systemId}\u0000${item.channelId}\u0000${item.dossierId}`)).size === scores.scores.length,
  "A canonical company may occur at most once per system and lane");
assert(scores.scores.every((item) => item.score >= 0 && item.score <= 100
  && (item.failedGates.length === 0 || item.score === 0)), "Scores must respect the eligibility gates and 0-100 scale");
assert(calibratedScores.runId === runId && calibratedScores.summary.canonicalCompanies === 465,
  "Calibrated scoring must cover the same run and all canonical companies");
assert(calibratedScores.scores.length === 555 && calibratedScores.summary.uniqueSystemLaneCompanyOccurrences === 555,
  "Calibrated scoring must cover all 555 frozen occurrences");
assert(calibratedScores.summary.eligibleOccurrences === 51 && calibratedScores.summary.rejectedOccurrences === 504,
  "The verified v1.3.1 rule revision must preserve its published eligibility totals");
assert(calibratedScores.scores.every((item) => item.score >= 0 && item.score <= 100
  && (item.failedGates.length === 0 || item.score === 0)), "Calibrated scores must respect the gates and 0-100 scale");
assert(blindPacket.runId === runId && blindPacket.candidates.length === 12, "Blind packet must contain the frozen 12 cases");
assert(new Set(blindPacket.candidates.map((item) => item.blindCandidateId)).size === 12, "Blind case IDs must be unique");
for (const lane of ["tier1-distribution", "b2b-resale", "project-services"]) {
  assert(blindPacket.candidates.filter((item) => item.reviewLane === lane).length === 4, `Blind packet must contain four ${lane} cases`);
}
assert(blindPacket.candidates.flatMap((item) => item.evidenceItems).every((item) => item.sourceType !== "discovery-summary"),
  "Blind packet must use provider-neutral evidence only");
assertBlind(blindPacket);
assert(decisions.runId === runId && decisions.decisions.length === 12, "Human checkpoint must contain all 12 frozen decisions");
assert(createHash("sha256").update(decisionBytes).digest("hex") === "44f6983305ab8560dd112e53b2d0222596f4fc11e2063eed242e0cc3aac3eafd",
  "Human checkpoint bytes no longer match the pre-deblinding SHA-256");
assert(initialAudit.runId === runId && initialAudit.humanAuditCheckpointCommit === "95df76d"
  && initialAudit.humanDecisionsFrozenBeforeDeblinding && !initialAudit.passed,
"Initial human comparison must remain bound to the frozen checkpoint and preserve the failed pre-revision result");
assert(calibrationFit.runId === runId && calibrationFit.evaluationView === "post-human-rule-revision-v1.3.1-in-sample-fit",
  "Calibration-fit artifact has the wrong run or evaluation view");
assert(calibrationFit.passed && calibrationFit.failedThresholds.length === 0
  && calibrationFit.calibrationDecision.status === "in-sample-rule-calibration-fit-passed"
  && calibrationFit.calibrationDecision.leaderboardStatus === "post-rule-revision-independent-validation-pending",
"v1.3.1 must pass the frozen in-sample fit while remaining pending independent validation");
assert(calibrationFit.metrics.coreSampleSize === 6 && calibrationFit.metrics.problemDiagnosticSize === 6
  && calibrationFit.metrics.gateFieldAgreement === 1 && calibrationFit.metrics.submittedLaneAgreement === 1
  && calibrationFit.metrics.quadraticWeightedKappa === 1 && calibrationFit.metrics.scoreMeanAbsoluteError === 1.1667,
"Published v1.3.1 calibration metrics changed unexpectedly");

console.log(JSON.stringify({
  runId,
  canonicalCompanies: master.companies.length,
  submittedOccurrences: seed.submittedOccurrenceCount,
  uniqueScoredOccurrences: scores.scores.length,
  eligibleOccurrences: scores.summary.eligibleOccurrences,
  calibratedEligibleOccurrences: calibratedScores.summary.eligibleOccurrences,
  providerNeutralEvidenceItems: master.companies.flatMap(providerNeutralScoringEvidence).length,
  blindAuditCases: blindPacket.candidates.length,
  calibratedAuditStatus: calibrationFit.calibrationDecision.leaderboardStatus,
}, null, 2));
