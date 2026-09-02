import { describe, expect, it } from "vitest";

import { calculateBlindAuditMetrics, type BlindDecision, type BlindPacketMapping } from "./blind-audit";

describe("formal blind-audit calibration", () => {
  it("passes identical independent decisions", () => {
    const mappings: BlindPacketMapping[] = Array.from({ length: 32 }, (_, index) => ({
      packetId: `packet-${String(index).padStart(3, "0")}`, companyKey: `company-${index}`,
      cellId: `cell-${index % 8}`, stratum: "test", presentInArms: ["product-e2e"],
      unifiedPrimaryRole: "Reseller", unifiedScore: 60 + index, unifiedQualified: 60 + index >= 65,
    }));
    const decisions = mappings.map((mapping) => ({ packetId: mapping.packetId, requestedModel: "claude-opus-5",
      actualModel: "claude-opus-5", modelReportedTotal: mapping.unifiedScore,
      deterministicTotal: mapping.unifiedScore, output: { packetId: mapping.packetId,
        isRealOperatingCompany: true, operatesInTargetMarket: true, supportedRoles: ["Reseller"],
        primaryRole: "Reseller", requestedCategoryMatch: true,
        dimensions: { productAndUseCaseFit: mapping.unifiedScore, channelAndBuyingInfluence: 0,
          sameRoleScaleAndCoverage: 0, executionAndEnablement: 0, opportunityAndRisk: 0 },
        totalScore: mapping.unifiedScore, eligibility: "eligible", dimensionReasons: [],
        unsupportedOrContradictoryClaims: [], citationAlignment: true }, costEvent: {} } as unknown as BlindDecision));
    const result = calculateBlindAuditMetrics(mappings, decisions);
    expect(result.passed).toBe(true);
    expect(result.spearman).toBeCloseTo(1, 8);
  });
});
