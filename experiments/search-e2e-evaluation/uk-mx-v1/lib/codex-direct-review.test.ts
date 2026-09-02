import { describe, expect, it } from "vitest";

import type { BlindPacket } from "./blind-audit";
import { codexDirectBlindDecision, codexPacketSha256, validateCodexDirectDecision } from "./codex-direct-review";

const packet: BlindPacket = { packetId: "blind-test", targetMarket: { countryCode: "GB",
  countryName: "United Kingdom" }, requestedCategory: "distribution", cudyBrief: "test",
company: { name: "Example", domain: "example.com", officialWebsiteUrl: "https://example.com" },
evidence: [{ evidenceId: "e1", sourceType: "official-website", url: "https://example.com",
  title: "Example", excerpt: "Example evidence." }] };

function artifact() {
  return { schemaVersion: 1 as const, packetId: packet.packetId, reviewer: "codex-in-session" as const,
    externalSearchUsed: false as const, packetSha256: codexPacketSha256(packet),
    reviewStartedAt: "2026-09-02T06:00:00.000Z", reviewCompletedAt: "2026-09-02T06:00:12.000Z",
    output: { packetId: packet.packetId, primaryRole: "Distributor", supportedRoles: ["Distributor"],
      isRealOperatingCompany: true, operatesInTargetMarket: true, requestedCategoryMatch: true,
      dimensions: { productAndUseCaseFit: 40, channelAndBuyingInfluence: 13,
        sameRoleScaleAndCoverage: 12, executionAndEnablement: 8, opportunityAndRisk: 8 },
      dimensionReasons: ["productAndUseCaseFit", "channelAndBuyingInfluence", "sameRoleScaleAndCoverage",
        "executionAndEnablement", "opportunityAndRisk"].map((dimension) => ({ dimension,
        reason: "Supported by the supplied evidence.", evidenceIds: ["e1"] })),
      totalScore: 99, eligibility: "eligible" as const, unsupportedOrContradictoryClaims: [],
      citationAlignment: true } };
}

describe("Codex direct blind review", () => {
  it("validates packet identity and recomputes the deterministic total", () => {
    const parsed = validateCodexDirectDecision(packet, artifact());
    const decision = codexDirectBlindDecision(packet, parsed, "test-run");
    expect(decision.deterministicTotal).toBe(81);
    expect(decision.output.totalScore).toBe(81);
    expect(decision.costEvent).toMatchObject({ provider: "codex-in-session", latencyMs: 12_000,
      budgetCostUsd: 0, accountCashCostUsd: 0, attempts: 1, retries: 0 });
    expect(decision.costEvent.costAnomalies).toContain("in-session-codex-token-usage-unavailable");
  });

  it("rejects an evidence ID that is absent from the frozen packet", () => {
    const invalid = artifact();
    invalid.output.dimensionReasons[0].evidenceIds = ["unknown"];
    expect(() => validateCodexDirectDecision(packet, invalid)).toThrow("unknown evidence ID");
  });
});
