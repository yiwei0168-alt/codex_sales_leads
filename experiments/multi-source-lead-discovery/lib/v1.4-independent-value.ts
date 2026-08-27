import type { BenchmarkLane, SharedEvidenceDossier } from "./evidence-dossier";
import type { V13OccurrenceScore } from "./v1.3-rescoring";

export type IndependentDecisionStatus = "verified-pass" | "verified-fail" | "unresolved";

export interface IndependentValueGates {
  companyExists: boolean;
  germanyPresence: boolean;
  activeNetworking: boolean;
  submittedLaneMembership: boolean;
  uniqueCanonicalCompany: boolean;
}

export interface IndependentValueLevels {
  productUseCaseFit: number;
  cooperationPath: number;
  independentInformationConfidence: number;
}

export interface IndependentValueDecision {
  dossierId: string;
  companyName: string;
  resolvedOfficialUrl?: string;
  channelId: BenchmarkLane;
  status: IndependentDecisionStatus;
  valueGates: IndependentValueGates;
  supportedRoles: string[];
  levels: IndependentValueLevels;
  evidence: Array<{ url: string; supports: string[] }>;
  reason: string;
}

export interface IndependentDecisionArtifact {
  schemaVersion: 1;
  protocolVersion: "independent-candidate-value-v1.4";
  runId: string;
  targetSystemId: "gemini-full";
  decisions: IndependentValueDecision[];
}

export interface V14OccurrenceScore {
  dossierId: string;
  companyName: string;
  officialUrl: string | null;
  systemId: string;
  channelId: BenchmarkLane;
  submittedRank: number;
  supportedRoles: string[];
  valueEligibility: IndependentValueGates;
  failedValueGates: Array<keyof IndependentValueGates>;
  levels: IndependentValueLevels;
  score: number;
  evaluationBasis: "v1.3.1-shared-evidence" | "v1.4-independent-adjudication";
  independentDecisionStatus: IndependentDecisionStatus | null;
  independentDecisionReason: string | null;
  independentEvidence: IndependentValueDecision["evidence"];
  providerEvidenceComplete: boolean;
  providerEvidenceItemCount: number;
}

export function independentDecisionKey(dossierId: string, channelId: BenchmarkLane): string {
  return `${dossierId}\u0000${channelId}`;
}

export function scoreIndependentLevels(levels: IndependentValueLevels): number {
  return levels.productUseCaseFit * 9 + levels.cooperationPath * 7
    + levels.independentInformationConfidence * 4;
}

export function providerEvidenceDiagnostic(options: {
  dossier: SharedEvidenceDossier;
  systemId: string;
}): { complete: boolean; itemCount: number } {
  const items = options.dossier.evidence.filter((item) => item.sourceType === "discovery-summary"
    && item.sourceSystems.includes(options.systemId) && item.url.trim().length > 0 && item.excerpt.trim().length > 0);
  return { complete: items.length > 0, itemCount: items.length };
}

function failedValueGates(valueEligibility: IndependentValueGates): Array<keyof IndependentValueGates> {
  return (Object.entries(valueEligibility) as Array<[keyof IndependentValueGates, boolean]>)
    .filter(([, passed]) => !passed).map(([gate]) => gate);
}

export function evaluateV14Occurrence(options: {
  baseline: Omit<V13OccurrenceScore, "evidence">;
  dossier: SharedEvidenceDossier;
  decision?: IndependentValueDecision;
}): V14OccurrenceScore {
  const { baseline, dossier, decision } = options;
  const providerEvidence = providerEvidenceDiagnostic({ dossier, systemId: baseline.systemId });
  const valueEligibility: IndependentValueGates = decision?.valueGates ?? {
    companyExists: baseline.eligibility.companyExists,
    germanyPresence: baseline.eligibility.germanyPresence,
    activeNetworking: baseline.eligibility.activeNetworking,
    submittedLaneMembership: baseline.eligibility.submittedLaneMembership,
    uniqueCanonicalCompany: baseline.eligibility.uniqueCanonicalCompany,
  };
  const levels: IndependentValueLevels = decision?.levels ?? {
    productUseCaseFit: baseline.levels.productUseCaseFit,
    cooperationPath: baseline.levels.cooperationPath,
    independentInformationConfidence: baseline.levels.evidenceReliability,
  };
  const failed = failedValueGates(valueEligibility);
  const resolvedPass = decision ? decision.status === "verified-pass" : true;
  const score = failed.length === 0 && resolvedPass ? scoreIndependentLevels(levels) : 0;
  return {
    dossierId: baseline.dossierId,
    companyName: baseline.companyName,
    officialUrl: decision?.resolvedOfficialUrl ?? baseline.officialUrl,
    systemId: baseline.systemId,
    channelId: baseline.channelId,
    submittedRank: baseline.submittedRank,
    supportedRoles: decision?.supportedRoles ?? baseline.supportedRoles,
    valueEligibility,
    failedValueGates: failed,
    levels,
    score,
    evaluationBasis: decision ? "v1.4-independent-adjudication" : "v1.3.1-shared-evidence",
    independentDecisionStatus: decision?.status ?? null,
    independentDecisionReason: decision?.reason ?? null,
    independentEvidence: decision?.evidence ?? [],
    providerEvidenceComplete: providerEvidence.complete,
    providerEvidenceItemCount: providerEvidence.itemCount,
  };
}

export function validateIndependentDecisions(options: {
  artifact: IndependentDecisionArtifact;
  dossiers: SharedEvidenceDossier[];
}): void {
  const dossierById = new Map(options.dossiers.map((dossier) => [dossier.dossierId, dossier]));
  const seen = new Set<string>();
  for (const decision of options.artifact.decisions) {
    const key = independentDecisionKey(decision.dossierId, decision.channelId);
    if (seen.has(key)) throw new Error(`Duplicate independent decision: ${key}`);
    seen.add(key);
    const dossier = dossierById.get(decision.dossierId);
    if (!dossier) throw new Error(`Unknown dossier in independent decision: ${decision.dossierId}`);
    const targetOccurrence = dossier.submittedOccurrences.some((occurrence) => occurrence.systemId === options.artifact.targetSystemId
      && occurrence.channelId === decision.channelId);
    if (!targetOccurrence) throw new Error(`Decision does not match a target-system occurrence: ${key}`);
    if (decision.status === "unresolved") throw new Error(`Unresolved decision prevents finalization: ${key}`);
    for (const [level, value] of Object.entries(decision.levels)) {
      if (!Number.isInteger(value) || value < 0 || value > 5) throw new Error(`Invalid ${level} for ${key}: ${value}`);
    }
    const failed = failedValueGates(decision.valueGates);
    if (decision.status === "verified-pass" && failed.length > 0) {
      throw new Error(`verified-pass decision has failed value gates: ${key}`);
    }
    if (decision.status === "verified-fail" && failed.length === 0) {
      throw new Error(`verified-fail decision must identify at least one failed value gate: ${key}`);
    }
    if (decision.status === "verified-pass" && decision.evidence.length === 0) {
      throw new Error(`verified-pass decision needs independent evidence: ${key}`);
    }
  }
  const targetOccurrences = options.dossiers.flatMap((dossier) => dossier.submittedOccurrences
    .filter((occurrence) => occurrence.systemId === options.artifact.targetSystemId)
    .map((occurrence) => independentDecisionKey(dossier.dossierId, occurrence.channelId)));
  const uniqueTargets = new Set(targetOccurrences);
  const missing = [...uniqueTargets].filter((key) => !seen.has(key));
  if (missing.length > 0) throw new Error(`Missing independent decisions: ${missing.join(", ")}`);
  const extras = [...seen].filter((key) => !uniqueTargets.has(key));
  if (extras.length > 0) throw new Error(`Unexpected independent decisions: ${extras.join(", ")}`);
}
