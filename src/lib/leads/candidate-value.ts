import { ACTIVE_LEAD_SCORING_POLICY } from "./scoring-policy";
import type {
  CompanyScaleClass,
  CooperationPathCandidate,
  LeadFitDimensions,
  LeadResearchDepth,
  RecommendationPriority,
  SalesAccountTier,
} from "./workflow/types";

export const DIMENSION_MAXIMA: Record<keyof LeadFitDimensions, number> = {
  productFamilyMatch: 25,
  customerAndScenarioOverlap: 15,
  positioningCompatibility: 10,
  cooperationPathAndBuyingInfluence: 15,
  scaleAndChannelCoverage: 15,
  executionAndEnablement: 10,
  opportunityAndRisk: 10,
};

export function clampDimension<K extends keyof LeadFitDimensions>(dimension: K, score: number): number {
  return Math.max(0, Math.min(DIMENSION_MAXIMA[dimension], Math.round(score)));
}

export function candidateValueScore(dimensions: LeadFitDimensions): number {
  return Math.round(Object.values(dimensions).reduce((sum, value) => sum + value, 0));
}

export function roleAwareProductTrackScore(input: {
  enabledTracks: string[];
  familyCoefficients: Record<string, number>;
  operatingDepth: Record<string, number>;
  fullPortfolioMode?: boolean;
}) {
  const tracks = Object.entries(ACTIVE_LEAD_SCORING_POLICY.productTracks)
    .filter(([track]) => input.enabledTracks.includes(track))
    .map(([track, definition]) => {
      const coverage = Object.entries(definition.families).reduce((sum, [family, weight]) => {
        const coefficient = Math.max(0, Math.min(1, input.familyCoefficients[family] ?? 0));
        return sum + weight * coefficient;
      }, 0) / 100;
      const depth = Math.max(0, Math.min(5, input.operatingDepth[track] ?? 0));
      return { track, score: Math.min(25, Math.round((coverage * 20 + depth) * 10) / 10) };
    });
  const ranked = tracks.sort((left, right) => right.score - left.score || left.track.localeCompare(right.track));
  if (!input.fullPortfolioMode) return { score: ranked[0]?.score ?? 0, selectedTrack: ranked[0]?.track ?? null, tracks: ranked };
  const score = ranked.length === 0 ? 0 : Math.round((ranked.reduce((sum, item) => sum + item.score, 0) / ranked.length) * 10) / 10;
  return { score, selectedTrack: "full-portfolio", tracks: ranked };
}

export function selectResearchDepth(input: {
  scaleClass: CompanyScaleClass;
  strongRelevanceSignal: boolean;
  userNominated: boolean;
  topNBoundary: boolean;
  hasConflict: boolean;
}): LeadResearchDepth {
  if (["Global/Enterprise", "National"].includes(input.scaleClass) || input.strongRelevanceSignal
    || input.userNominated || input.topNBoundary || input.hasConflict) return "deep";
  if (input.scaleClass === "Local/Small" && !input.strongRelevanceSignal) return "limited";
  return "standard";
}

export function recommendationPriority(score: number, eligibilityStatus: string): RecommendationPriority {
  if (eligibilityStatus !== "eligible") return "Hold/Research Required";
  if (score >= ACTIVE_LEAD_SCORING_POLICY.accountTierPolicy.priorityThreshold) return "High";
  if (score >= 60) return "Medium";
  return "Low";
}

export function salesAccountTier(input: {
  score: number;
  scaleAndChannelCoverage: number;
  cooperationPathAndBuyingInfluence: number;
  selectedPath?: CooperationPathCandidate;
  eligibilityStatus: string;
  scaleClass: CompanyScaleClass;
}): SalesAccountTier {
  const tier1 = input.selectedPath?.pathType === "Direct Distribution";
  if (input.eligibilityStatus !== "eligible") return tier1 ? "Standard Distributor" : "Standard";
  const strategic = input.score >= ACTIVE_LEAD_SCORING_POLICY.accountTierPolicy.strategicThreshold
    && input.scaleAndChannelCoverage >= 12 && input.cooperationPathAndBuyingInfluence >= 11;
  if (tier1) {
    if (strategic) return "Strategic Distributor";
    if (input.score >= ACTIVE_LEAD_SCORING_POLICY.accountTierPolicy.priorityThreshold) return "Priority Distributor";
    return input.scaleClass === "Local/Small" && input.score < 60 ? "Long-tail Distributor" : "Standard Distributor";
  }
  if (strategic || (input.score >= 80 && input.cooperationPathAndBuyingInfluence >= 12)) return "KA";
  if (input.score >= ACTIVE_LEAD_SCORING_POLICY.accountTierPolicy.priorityThreshold) return "Priority";
  return input.scaleClass === "Local/Small" && input.score < 60 ? "Long-tail" : "Standard";
}
