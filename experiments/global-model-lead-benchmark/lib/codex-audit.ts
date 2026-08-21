import { createHash } from "node:crypto";

export const POTENTIAL_FIT_DIMENSION_MAXIMUMS = {
  channelRoleAndCustomerAccess: 30,
  productAndUseCaseFit: 25,
  targetMarketCoverage: 20,
  partnershipExecutionCapability: 15,
  strategicComplementarity: 10,
} as const;

export type PotentialFitDimensions = {
  [Key in keyof typeof POTENTIAL_FIT_DIMENSION_MAXIMUMS]: number;
};

export type EvidenceGates = {
  submittedIdentityUsable: boolean;
  companyExists: boolean;
  targetCountryPresence: boolean;
  relevantChannel: boolean;
  sufficientEvidence: boolean;
  independentProspect: boolean;
};

export type RelationshipStatus = "confirmed_existing" | "no_public_evidence" | "unknown";
export type EvidenceStrength = "strong" | "medium" | "weak";
export type PotentialFitBand = "high_fit" | "strong_fit" | "follow_up" | "unqualified" | "invalid";
export type PrimaryPoolStatus = "qualified_net_new" | "unqualified_net_new" | "existing_relationship_reference" | "invalid";
export type AuditRiskFlag =
  | "score_near_threshold"
  | "weak_evidence"
  | "identity_ambiguity"
  | "source_conflict"
  | "high_score_without_official_source"
  | "relationship_unclear";

export type ScoredNamedContact = {
  claimId: string;
  name: string;
  role: string;
  sourceUrl: string;
  relevanceScore: 0 | 1 | 2 | 3;
  notes: string | null;
};

export type ScoredContactMethod = {
  claimId: string;
  value: string;
  sourceUrl: string;
  usefulnessScore: 0 | 1 | 2;
  notes: string | null;
};

export type PotentialPartnerAssessment = {
  blindCandidateId: string;
  assessedAt: string;
  evidenceGates: EvidenceGates;
  relationshipStatus: RelationshipStatus;
  evidenceStrength: EvidenceStrength;
  fitDimensions: PotentialFitDimensions | null;
  independentEvidenceUrls: string[];
  namedContacts: ScoredNamedContact[];
  contactMethods: ScoredContactMethod[];
  riskFlags: AuditRiskFlag[];
  notes: string[];
};

export type HumanAuditDecision = {
  blindCandidateId: string;
  reviewedAt: string;
  evidenceGates: EvidenceGates;
  relationshipStatus: RelationshipStatus;
  fitDimensions: PotentialFitDimensions | null;
  reviewerNotes: string | null;
};

export type AuditAcceptanceThresholds = {
  qualifiedStatusAgreement: number;
  fitBandExactAgreement: number;
  weightedKappa: number;
  potentialFitMeanAbsoluteErrorMaximum: number;
};

export type HumanAuditAgreement = {
  auditedCandidates: number;
  qualifiedStatusAgreement: number;
  fitBandExactAgreement: number;
  weightedKappa: number;
  potentialFitMeanAbsoluteError: number | null;
  evidenceGateAgreement: number;
  relationshipStatusAgreement: number;
  passed: boolean;
  failedThresholds: string[];
};

const fitBandIndex: Record<PotentialFitBand, number> = {
  invalid: 0,
  unqualified: 1,
  follow_up: 2,
  strong_fit: 3,
  high_fit: 4,
};

function assertUrl(value: string): void {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Audit evidence URL must be HTTP(S)");
}

function assertIntegerRange(value: number, minimum: number, maximum: number, label: string): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
}

function assertBlindCandidateId(value: string): void {
  if (!/^C-[A-F0-9]{12}$/.test(value)) throw new Error("Invalid blind candidate ID");
}

function assertClaimId(value: string): void {
  if (!/^[NM]-[A-F0-9]{12}$/.test(value)) throw new Error("Invalid contact claim ID");
}

export function deterministicClaimId(kind: "N" | "M", blindCandidateId: string, stableValue: string): string {
  const digest = createHash("sha256").update(`${blindCandidateId}:${kind}:${stableValue}`).digest("hex").slice(0, 12).toUpperCase();
  return `${kind}-${digest}`;
}

export function evidenceGatesPass(gates: EvidenceGates): boolean {
  return Object.values(gates).every(Boolean);
}

export function potentialFitScore(value: Pick<PotentialPartnerAssessment | HumanAuditDecision, "evidenceGates" | "fitDimensions">): number | null {
  if (!evidenceGatesPass(value.evidenceGates) || value.fitDimensions === null) return null;
  return Object.values(value.fitDimensions).reduce((sum, score) => sum + score, 0);
}

export function potentialFitBand(value: Pick<PotentialPartnerAssessment | HumanAuditDecision, "evidenceGates" | "fitDimensions">): PotentialFitBand {
  const score = potentialFitScore(value);
  if (score === null) return "invalid";
  if (score >= 80) return "high_fit";
  if (score >= 65) return "strong_fit";
  if (score >= 50) return "follow_up";
  return "unqualified";
}

export function primaryPoolStatus(
  value: Pick<PotentialPartnerAssessment | HumanAuditDecision, "evidenceGates" | "fitDimensions" | "relationshipStatus">,
): PrimaryPoolStatus {
  const score = potentialFitScore(value);
  if (score === null) return "invalid";
  if (value.relationshipStatus === "confirmed_existing") return "existing_relationship_reference";
  return score >= 50 ? "qualified_net_new" : "unqualified_net_new";
}

export function potentialFitRelevance(value: PotentialPartnerAssessment): number {
  if (primaryPoolStatus(value) === "existing_relationship_reference" || potentialFitScore(value) === null) return 0;
  return (potentialFitScore(value) ?? 0) / 25;
}

function validateFitDimensions(dimensions: PotentialFitDimensions | null, gates: EvidenceGates): void {
  if (!evidenceGatesPass(gates)) {
    if (dimensions !== null) throw new Error("Gate-invalid candidates must not receive potential-fit scores");
    return;
  }
  if (dimensions === null) throw new Error("Gate-valid candidates require potential-fit dimension scores");
  for (const [key, maximum] of Object.entries(POTENTIAL_FIT_DIMENSION_MAXIMUMS)) {
    assertIntegerRange(dimensions[key as keyof PotentialFitDimensions], 0, maximum, key);
  }
}

export function validatePotentialPartnerAssessment(assessment: PotentialPartnerAssessment): void {
  assertBlindCandidateId(assessment.blindCandidateId);
  if (Number.isNaN(Date.parse(assessment.assessedAt))) throw new Error("assessedAt must be an ISO date-time");
  validateFitDimensions(assessment.fitDimensions, assessment.evidenceGates);
  if (assessment.independentEvidenceUrls.length === 0) throw new Error("Independent audit evidence is required");
  assessment.independentEvidenceUrls.forEach(assertUrl);
  const claimIds = new Set<string>();
  for (const contact of assessment.namedContacts) {
    assertClaimId(contact.claimId);
    if (claimIds.has(contact.claimId)) throw new Error(`Duplicate contact claim ID ${contact.claimId}`);
    claimIds.add(contact.claimId);
    if (!contact.name.trim() || !contact.role.trim()) throw new Error("Named contacts require a name and role");
    assertIntegerRange(contact.relevanceScore, 0, 3, "Named-contact score");
    assertUrl(contact.sourceUrl);
  }
  for (const method of assessment.contactMethods) {
    assertClaimId(method.claimId);
    if (claimIds.has(method.claimId)) throw new Error(`Duplicate contact claim ID ${method.claimId}`);
    claimIds.add(method.claimId);
    if (!method.value.trim()) throw new Error("Contact methods require a value");
    assertIntegerRange(method.usefulnessScore, 0, 2, "Contact-method score");
    assertUrl(method.sourceUrl);
  }
  if (new Set(assessment.riskFlags).size !== assessment.riskFlags.length) throw new Error("Duplicate audit risk flag");
}

export function validateHumanAuditDecision(decision: HumanAuditDecision, assessment: PotentialPartnerAssessment): void {
  assertBlindCandidateId(decision.blindCandidateId);
  if (decision.blindCandidateId !== assessment.blindCandidateId) throw new Error("Human decision does not match the Codex assessment");
  if (Number.isNaN(Date.parse(decision.reviewedAt))) throw new Error("reviewedAt must be an ISO date-time");
  validateFitDimensions(decision.fitDimensions, decision.evidenceGates);
}

function deterministicOrder(seed: string, value: string): string {
  return createHash("sha256").update(`${seed}:${value}`).digest("hex");
}

function auditStratum(assessment: PotentialPartnerAssessment): string {
  const status = primaryPoolStatus(assessment);
  if (status === "invalid" || status === "existing_relationship_reference") return status;
  return potentialFitBand(assessment);
}

export function selectStratifiedBlindAuditIds(
  assessments: PotentialPartnerAssessment[],
  percent: number,
  minimum: number,
  seed: string,
): string[] {
  if (percent < 0 || percent > 100) throw new Error("Audit percent must be between 0 and 100");
  if (!Number.isInteger(minimum) || minimum < 0) throw new Error("Audit minimum must be a non-negative integer");
  if (assessments.length === 0 || percent === 0) return [];
  assessments.forEach(validatePotentialPartnerAssessment);
  const unique = new Map(assessments.map((assessment) => [assessment.blindCandidateId, assessment]));
  if (unique.size !== assessments.length) throw new Error("Duplicate candidate in Codex assessments");
  const target = Math.min(assessments.length, Math.max(minimum, Math.ceil(assessments.length * percent / 100)));
  const groups = new Map<string, PotentialPartnerAssessment[]>();
  for (const assessment of assessments) {
    const stratum = auditStratum(assessment);
    groups.set(stratum, [...(groups.get(stratum) ?? []), assessment]);
  }
  const selected = new Set<string>();
  if (target >= groups.size) {
    for (const [stratum, items] of [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      const first = [...items].sort((left, right) => deterministicOrder(`${seed}:stratum:${stratum}`, left.blindCandidateId)
        .localeCompare(deterministicOrder(`${seed}:stratum:${stratum}`, right.blindCandidateId)))[0];
      selected.add(first.blindCandidateId);
    }
  }
  const remaining = assessments
    .filter((assessment) => !selected.has(assessment.blindCandidateId))
    .sort((left, right) => deterministicOrder(`${seed}:fill`, left.blindCandidateId)
      .localeCompare(deterministicOrder(`${seed}:fill`, right.blindCandidateId)));
  for (const assessment of remaining) {
    if (selected.size >= target) break;
    selected.add(assessment.blindCandidateId);
  }
  return [...selected].sort((left, right) => deterministicOrder(`${seed}:presentation`, left)
    .localeCompare(deterministicOrder(`${seed}:presentation`, right)));
}

export function selectHighRiskAuditIds(assessments: PotentialPartnerAssessment[], statisticalSampleIds: string[], seed: string): string[] {
  const statistical = new Set(statisticalSampleIds);
  return assessments
    .filter((assessment) => assessment.riskFlags.length > 0 && !statistical.has(assessment.blindCandidateId))
    .sort((left, right) => deterministicOrder(`${seed}:risk`, left.blindCandidateId)
      .localeCompare(deterministicOrder(`${seed}:risk`, right.blindCandidateId)))
    .map((assessment) => assessment.blindCandidateId);
}

function weightedKappa(left: number[], right: number[], categoryCount = 5): number {
  if (left.length !== right.length || left.length === 0) return 0;
  const denominator = (categoryCount - 1) ** 2;
  const weights = Array.from({ length: categoryCount }, (_, row) =>
    Array.from({ length: categoryCount }, (_, column) => ((row - column) ** 2) / denominator));
  let observed = 0;
  const leftMarginal = Array.from({ length: categoryCount }, () => 0);
  const rightMarginal = Array.from({ length: categoryCount }, () => 0);
  for (let index = 0; index < left.length; index += 1) {
    observed += weights[left[index]][right[index]];
    leftMarginal[left[index]] += 1;
    rightMarginal[right[index]] += 1;
  }
  observed /= left.length;
  let expected = 0;
  for (let row = 0; row < categoryCount; row += 1) {
    for (let column = 0; column < categoryCount; column += 1) {
      expected += weights[row][column] * (leftMarginal[row] / left.length) * (rightMarginal[column] / left.length);
    }
  }
  return expected === 0 ? (observed === 0 ? 1 : 0) : 1 - observed / expected;
}

export function compareHumanAudit(
  assessments: PotentialPartnerAssessment[],
  decisions: HumanAuditDecision[],
  statisticalSampleIds: string[],
  thresholds: AuditAcceptanceThresholds,
): HumanAuditAgreement {
  const assessmentById = new Map(assessments.map((assessment) => [assessment.blindCandidateId, assessment]));
  const decisionById = new Map(decisions.map((decision) => [decision.blindCandidateId, decision]));
  const sample = statisticalSampleIds.map((id) => {
    const assessment = assessmentById.get(id);
    const decision = decisionById.get(id);
    if (!assessment || !decision) throw new Error(`Missing assessment or human decision for ${id}`);
    validatePotentialPartnerAssessment(assessment);
    validateHumanAuditDecision(decision, assessment);
    return { assessment, decision };
  });
  if (sample.length === 0) throw new Error("Human audit comparison requires a non-empty statistical sample");
  const codexBands = sample.map(({ assessment }) => potentialFitBand(assessment));
  const humanBands = sample.map(({ decision }) => potentialFitBand(decision));
  const comparableScores = sample.flatMap(({ assessment, decision }) => {
    const codex = potentialFitScore(assessment);
    const human = potentialFitScore(decision);
    return codex === null || human === null ? [] : [Math.abs(codex - human)];
  });
  const allGatePairs = sample.flatMap(({ assessment, decision }) => Object.keys(assessment.evidenceGates).map((key) => [
    assessment.evidenceGates[key as keyof EvidenceGates], decision.evidenceGates[key as keyof EvidenceGates],
  ]));
  const result = {
    auditedCandidates: sample.length,
    qualifiedStatusAgreement: sample.filter(({ assessment, decision }) =>
      (primaryPoolStatus(assessment) === "qualified_net_new") === (primaryPoolStatus(decision) === "qualified_net_new")).length / sample.length,
    fitBandExactAgreement: codexBands.filter((band, index) => band === humanBands[index]).length / sample.length,
    weightedKappa: weightedKappa(codexBands.map((band) => fitBandIndex[band]), humanBands.map((band) => fitBandIndex[band])),
    potentialFitMeanAbsoluteError: comparableScores.length === 0
      ? null
      : comparableScores.reduce((sum, value) => sum + value, 0) / comparableScores.length,
    evidenceGateAgreement: allGatePairs.filter(([left, right]) => left === right).length / allGatePairs.length,
    relationshipStatusAgreement: sample.filter(({ assessment, decision }) => assessment.relationshipStatus === decision.relationshipStatus).length / sample.length,
  };
  const failedThresholds = [
    ...(result.qualifiedStatusAgreement < thresholds.qualifiedStatusAgreement ? ["qualifiedStatusAgreement"] : []),
    ...(result.fitBandExactAgreement < thresholds.fitBandExactAgreement ? ["fitBandExactAgreement"] : []),
    ...(result.weightedKappa < thresholds.weightedKappa ? ["weightedKappa"] : []),
    ...(result.potentialFitMeanAbsoluteError === null
      || result.potentialFitMeanAbsoluteError > thresholds.potentialFitMeanAbsoluteErrorMaximum
      ? ["potentialFitMeanAbsoluteError"] : []),
  ];
  return { ...result, passed: failedThresholds.length === 0, failedThresholds };
}
