import type { ChannelRole } from "../../../src/lib/domain";
import { assessChannelMembershipEvidence, type ChannelMembershipLane } from "../../../src/lib/leads/channel-membership";
import { selectPrimaryChannel, type PrimaryChannelSelection } from "../../../src/lib/leads/primary-channel";

import { providerNeutralScoringEvidence, type BenchmarkLane, type SharedEvidenceDossier } from "./evidence-dossier";
import { extractV16Facts, type V16ExtractedFacts } from "./v1.6-unified-rescoring";

const membershipLanes: ChannelMembershipLane[] = ["distribution", "resale", "retail", "services", "isp"];
const benchmarkOrder: BenchmarkLane[] = ["tier1-distribution", "b2b-resale", "project-services"];

export interface V17RoleCorrection {
  facts: V16ExtractedFacts;
  selection: PrimaryChannelSelection;
  primaryRoute: BenchmarkLane | null;
  consensusRoles: ChannelRole[];
}

function routesForSelection(selection: PrimaryChannelSelection): BenchmarkLane[] {
  return benchmarkOrder.filter((route) => selection.supportedFamilies.some((family) => {
    if (route === "tier1-distribution") return family === "distribution";
    if (route === "b2b-resale") return family === "resale" || family === "retail";
    return family === "services" || family === "isp";
  }));
}

export function correctV17Roles(dossier: SharedEvidenceDossier): V17RoleCorrection {
  const evidence = [dossier.canonicalName, dossier.canonicalDomain ?? "",
    ...providerNeutralScoringEvidence(dossier).map((item) => item.excerpt)];
  const evidenceRoles = [...new Set(membershipLanes.flatMap((lane) =>
    assessChannelMembershipEvidence({ lane, evidence }).supportedRoles))] as ChannelRole[];
  const tier1Submissions = dossier.submittedOccurrences.filter((item) => item.channelId === "tier1-distribution");
  const distributorSystems = new Set(tier1Submissions.filter((item) =>
    item.submittedRoles.some((role) => role === "Distributor" || role === "VAD")).map((item) => item.systemId));
  const vadSystems = new Set(tier1Submissions.filter((item) => item.submittedRoles.includes("VAD")).map((item) => item.systemId));
  const consensusRoles: ChannelRole[] = distributorSystems.size >= 2
    ? vadSystems.size >= 2 ? ["Distributor", "VAD"] : ["Distributor"] : [];
  const roles = [...new Set([...evidenceRoles, ...consensusRoles])];
  const selection = selectPrimaryChannel({
    roles,
    agentPrimaryRole: roles.length === 1 ? roles[0] : roles.length > 1 ? "Hybrid" : "Unresolved",
  });
  const facts = extractV16Facts(dossier);
  return {
    facts: { ...facts, supportedRoles: roles, correctedRoutes: routesForSelection(selection) },
    selection,
    primaryRoute: selection.primaryChannel,
    consensusRoles,
  };
}

export function primaryRouteForV17(correction: V17RoleCorrection, submittedRoutes: BenchmarkLane[],
  smallLongTailExceptionEligible: boolean): BenchmarkLane | null {
  if (correction.primaryRoute) return correction.primaryRoute;
  void submittedRoutes;
  void smallLongTailExceptionEligible;
  return null;
}

export function channelCompletionPenalty(options: {
  channelId: BenchmarkLane;
  selectedCount: number;
  originalSubmittedCount: number;
  targetCount?: number;
}) {
  const targetCount = options.targetCount ?? 10;
  const missingCount = Math.max(0, targetCount - options.selectedCount);
  const originalTier1Shortfall = options.channelId === "tier1-distribution"
    && options.originalSubmittedCount < targetCount;
  const ratePerMissing = originalTier1Shortfall ? 0.03 : 0.02;
  const penaltyRate = Math.min(0.3, missingCount * ratePerMissing);
  return {
    targetCount,
    missingCount,
    originalSubmittedCount: options.originalSubmittedCount,
    originalTier1Shortfall,
    ratePerMissing,
    penaltyRate,
  };
}
