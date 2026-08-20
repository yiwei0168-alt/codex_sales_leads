import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  compareHumanAudit,
  potentialFitBand,
  primaryPoolStatus,
  selectStratifiedBlindAuditIds,
  validateHumanAuditDecision,
  validatePotentialPartnerAssessment,
  type AuditAcceptanceThresholds,
  type HumanAuditDecision,
  type PotentialPartnerAssessment,
} from "../lib/codex-audit";

type AssessmentDocument = { schemaVersion: number; rubricVersion: string; assessments: PotentialPartnerAssessment[] };
type DecisionDocument = { schemaVersion: number; rubricVersion: string; decisions: HumanAuditDecision[] };
type Manifest = { schemaVersion: number; statisticalSampleIds: string[]; riskSupplementIds: string[] };
type JudgingConfig = {
  humanInTheLoop: {
    failedAuditExpansionPercent: number;
    auditSeed: string;
    acceptanceThresholds: AuditAcceptanceThresholds;
  };
};

const root = path.resolve("experiments/global-model-lead-benchmark");
const working = path.join(root, "reviews", "working");
const readJson = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, "utf8")) as T;
const [assessmentDocument, decisionDocument, manifest, config] = await Promise.all([
  readJson<AssessmentDocument>(path.join(working, "codex-assessments.local.json")),
  readJson<DecisionDocument>(path.join(working, "human-audit-decisions.local.json")),
  readJson<Manifest>(path.join(working, "human-audit-manifest.local.json")),
  readJson<JudgingConfig>(path.join(root, "config", "judging.json")),
]);
if (assessmentDocument.schemaVersion !== 1 || decisionDocument.schemaVersion !== 1 || manifest.schemaVersion !== 1) {
  throw new Error("Unsupported audit document schema");
}
assessmentDocument.assessments.forEach(validatePotentialPartnerAssessment);
const assessmentById = new Map(assessmentDocument.assessments.map((assessment) => [assessment.blindCandidateId, assessment]));
const selectedIds = [...manifest.statisticalSampleIds, ...manifest.riskSupplementIds];
const decisionById = new Map(decisionDocument.decisions.map((decision) => [decision.blindCandidateId, decision]));
if (decisionDocument.decisions.length !== selectedIds.length || decisionById.size !== selectedIds.length
  || selectedIds.some((id) => !decisionById.has(id))) {
  throw new Error("Human decisions must cover every sampled candidate exactly once");
}
for (const id of selectedIds) {
  const assessment = assessmentById.get(id);
  const decision = decisionById.get(id);
  if (!assessment || !decision) throw new Error(`Missing audit data for ${id}`);
  validateHumanAuditDecision(decision, assessment);
}

const agreement = compareHumanAudit(
  assessmentDocument.assessments,
  decisionDocument.decisions,
  manifest.statisticalSampleIds,
  config.humanInTheLoop.acceptanceThresholds,
);
const riskDisagreements = manifest.riskSupplementIds.filter((id) => {
  const assessment = assessmentById.get(id)!;
  const decision = decisionById.get(id)!;
  return potentialFitBand(assessment) !== potentialFitBand(decision)
    || primaryPoolStatus(assessment) !== primaryPoolStatus(decision)
    || assessment.relationshipStatus !== decision.relationshipStatus;
});
const alreadySampled = new Set(selectedIds);
const unsampled = assessmentDocument.assessments.filter((assessment) => !alreadySampled.has(assessment.blindCandidateId));
const expansionCount = agreement.passed
  ? 0
  : Math.min(unsampled.length, Math.ceil(assessmentDocument.assessments.length * config.humanInTheLoop.failedAuditExpansionPercent / 100));
const expansionPercentOfRemainder = unsampled.length === 0 ? 0 : (expansionCount / unsampled.length) * 100;
const expansionIds = expansionCount === 0 ? [] : selectStratifiedBlindAuditIds(
  unsampled,
  expansionPercentOfRemainder,
  expansionCount,
  `${config.humanInTheLoop.auditSeed}:expansion`,
);
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  statisticalAgreement: agreement,
  targetedHighRiskCandidatesReviewed: manifest.riskSupplementIds.length,
  targetedHighRiskDisagreementIds: riskDisagreements,
  disposition: agreement.passed ? "accepted" : "expand_blind_human_audit",
  expansionIds,
};
await writeFile(path.join(working, "human-audit-agreement.local.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
