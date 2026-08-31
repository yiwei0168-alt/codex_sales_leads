import { describe, expect, it } from "vitest";

import { candidateValueScore, roleAwareProductTrackScore, salesAccountTier, selectResearchDepth } from "./candidate-value";

describe("candidate value policy", () => {
  it("scores the best enabled product track without broad-portfolio dilution", () => {
    const result = roleAwareProductTrackScore({
      enabledTracks: ["home-retail", "smb", "isp-fwa"],
      familyCoefficients: {
        "ap-controller-cloud": 1, "switching-poe-fiber": 1, "gateway-vpn": 1, "outdoor-fwa-backup": 0.7,
      },
      operatingDepth: { smb: 5 },
    });
    expect(result.selectedTrack).toBe("smb");
    expect(result.score).toBeGreaterThan(23);
  });

  it("uses the confirmed 100 point dimensions", () => {
    expect(candidateValueScore({ productFamilyMatch: 25, customerAndScenarioOverlap: 15,
      positioningCompatibility: 10, cooperationPathAndBuyingInfluence: 15,
      scaleAndChannelCoverage: 15, executionAndEnablement: 10, opportunityAndRisk: 10 })).toBe(100);
  });

  it("never assigns KA to a tier-1 distribution path", () => {
    const accountTier = salesAccountTier({ score: 95, scaleAndChannelCoverage: 15,
      cooperationPathAndBuyingInfluence: 15, eligibilityStatus: "eligible", scaleClass: "Global/Enterprise",
      primaryRole: "Distributor",
      selectedPath: { pathId: "p1", pathType: "Direct Tier-1 Supply", candidateRole: "Distributor",
        fitComponents: { roleStructureFit: 30, userStageAndSupplyFit: 25, productCustomerScenarioFit: 20,
          procurementAndInfluence: 15, executionFeasibility: 5 }, fitScore: 95, rank: 1,
        findingIds: [], evidenceIds: [], reason: "Direct distributor onboarding.", prerequisites: [],
        risks: [], unknowns: [], allowedInExternalEmail: true } });
    expect(accountTier).toBe("Strategic Distributor");
  });

  it("routes large or strongly relevant candidates to deep research", () => {
    expect(selectResearchDepth({ scaleClass: "Global/Enterprise", strongRelevanceSignal: false,
      userNominated: false, hasConflict: false })).toBe("deep");
    expect(selectResearchDepth({ scaleClass: "Local/Small", strongRelevanceSignal: true,
      userNominated: false, hasConflict: false })).toBe("deep");
  });
});
