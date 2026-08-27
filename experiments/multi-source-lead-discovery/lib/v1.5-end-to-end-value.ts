import type { BenchmarkLane, SharedEvidenceDossier } from "./evidence-dossier";
import type { V14OccurrenceScore } from "./v1.4-independent-value";

export interface V15OutputQuality {
  roleIdentificationQuality: number;
  channelClassificationQuality: number;
  maximum: 4;
}

export interface V15EndToEndScore extends Omit<V14OccurrenceScore, "score" | "failedValueGates" | "channelId"> {
  sourceChannelId: BenchmarkLane;
  channelId: BenchmarkLane;
  correctionApplied: boolean;
  correctedRoles: string[];
  correctedRoutes: BenchmarkLane[];
  originalFailedValueGates: V14OccurrenceScore["failedValueGates"];
  hardValueEligibility: {
    companyExists: boolean;
    germanyPresence: boolean;
    activeNetworking: boolean;
  };
  failedHardValueGates: Array<"companyExists" | "germanyPresence" | "activeNetworking">;
  scoreComponents: {
    productUseCaseFit: number;
    cooperationPath: number;
    independentInformationConfidence: number;
    roleIdentificationQuality: number;
    channelClassificationQuality: number;
  };
  outputQuality: V15OutputQuality;
  score: number;
}

const roleRoutes: Array<{ lane: BenchmarkLane; roles: string[] }> = [
  { lane: "tier1-distribution", roles: ["Distributor", "VAD"] },
  { lane: "b2b-resale", roles: ["VAR", "Dealer", "Reseller", "Retailer", "E-tailer"] },
  { lane: "project-services", roles: ["SI", "Installer", "MSP", "ISP"] },
];

export function evidenceSupportedRoles(dossier: SharedEvidenceDossier): string[] {
  return [...new Set(Object.values(dossier.claimCoverage.laneMembership).flatMap((lane) => lane.supportedRoles))];
}

export function routesForRoles(roles: string[]): BenchmarkLane[] {
  return roleRoutes.filter((route) => roles.some((role) => route.roles.includes(role))).map((route) => route.lane);
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

export function evaluateV15EndToEnd(options: {
  baseline: V14OccurrenceScore;
  dossier: SharedEvidenceDossier;
  correctedChannelId: BenchmarkLane;
  productCorrectionApplied: boolean;
}): V15EndToEndScore {
  const { baseline, dossier, correctedChannelId, productCorrectionApplied } = options;
  const evidenceRoles = evidenceSupportedRoles(dossier);
  const correctedRoles = productCorrectionApplied ? evidenceRoles : baseline.supportedRoles;
  const correctedRoutes = routesForRoles(correctedRoles);
  const hardValueEligibility = {
    companyExists: baseline.valueEligibility.companyExists,
    germanyPresence: baseline.valueEligibility.germanyPresence,
    activeNetworking: baseline.valueEligibility.activeNetworking,
  };
  const failedHardValueGates = (Object.entries(hardValueEligibility) as Array<[
    keyof typeof hardValueEligibility, boolean,
  ]>).filter(([, passed]) => !passed).map(([gate]) => gate);
  const truthRoles = new Set(!productCorrectionApplied && baseline.evaluationBasis === "v1.4-independent-adjudication"
    ? baseline.supportedRoles : evidenceRoles);
  const supportedOutputRoles = correctedRoles.filter((role) => truthRoles.has(role));
  const unsupportedOutputRoles = correctedRoles.filter((role) => !truthRoles.has(role));
  const roleIdentificationQuality = correctedRoles.length === 0 ? 0
    : supportedOutputRoles.length === 0 ? 0
      : unsupportedOutputRoles.length > 0 ? 2 : 3;
  const channelClassificationQuality = correctedRoutes.includes(correctedChannelId) ? 1 : 0;
  const scoreComponents = {
    productUseCaseFit: round(baseline.levels.productUseCaseFit * 8.8),
    cooperationPath: round(baseline.levels.cooperationPath * 6.4),
    independentInformationConfidence: round(baseline.levels.independentInformationConfidence * 4),
    roleIdentificationQuality,
    channelClassificationQuality,
  };
  const score = failedHardValueGates.length > 0 ? 0 : round(Object.values(scoreComponents).reduce((sum, value) => sum + value, 0));
  return {
    ...baseline,
    sourceChannelId: baseline.channelId,
    channelId: correctedChannelId,
    correctionApplied: productCorrectionApplied,
    correctedRoles,
    correctedRoutes,
    originalFailedValueGates: baseline.failedValueGates,
    hardValueEligibility,
    failedHardValueGates,
    scoreComponents,
    outputQuality: { roleIdentificationQuality, channelClassificationQuality, maximum: 4 },
    score,
  };
}
