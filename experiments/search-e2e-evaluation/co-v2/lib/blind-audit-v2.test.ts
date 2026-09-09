import { describe, expect, it } from "vitest";

import { blindAuditRoleFamily, blindAuditV2DecisionCacheKey, type BlindAuditV2Packet,
  type BlindJudgeV2Decision } from "./blind-audit-v2";

describe("Colombia blind-audit role-family normalization", () => {
  it.each([
    ["distribution", "distribution"], ["Distributor", "distribution"], ["VAD", "distribution"],
    ["resale", "resale"], ["Reseller", "resale"], ["VAR", "resale"],
    ["retail", "retail"], ["Retailer", "retail"], ["E-tailer", "retail"],
    ["services", "services"], ["SI", "services"], ["MSP", "services"],
    ["isp", "isp"], ["agent", "agent"], ["brand", "brand"],
    ["Hybrid", "hybrid"], ["Unverified", "unresolved"],
  ])("maps %s to %s", (role, expected) => {
    expect(blindAuditRoleFamily(role)).toBe(expected);
  });
});

it("does not bind arbitration cache identity to derived role-family fields", () => {
  const packet = { packetId: "blind-v2-cache", protocolVersion: "2.1.0" } as BlindAuditV2Packet;
  const decision = { actualModel: "model-a", roleFamily: "unresolved",
    requestedCategoryFamilyMatch: false, output: { packetId: packet.packetId } } as BlindJudgeV2Decision;
  const corrected = { ...decision, roleFamily: "retail" as const, requestedCategoryFamilyMatch: true };

  expect(blindAuditV2DecisionCacheKey(packet, "arbitrator", "model-b", [decision]))
    .toBe(blindAuditV2DecisionCacheKey(packet, "arbitrator", "model-b", [corrected]));
});
