import { describe, expect, it } from "vitest";
import { selectPrimaryChannel } from "../primary-channel";
import { correctionCompletion } from "./correction-completion";
import type { LeadCandidateCorrection } from "./types";

const correction: LeadCandidateCorrection = {
  originalCompanyName: "Example", originalDomain: "example.test", originalOfficialWebsiteUrl: "https://example.test",
  resolvedRoles: ["SI"], resolvedFamilies: ["services"], primaryRole: "SI", primaryFamily: "services",
  primaryChannelReason: "Evidence", usedSmallLongTailChannelException: false, identityChanged: false,
  routingChanged: false, supplementalEvidenceIds: [], reliedEvidenceIds: [], findings: [], reasons: [],
  confidence: 80, model: "fixture", promptVersion: "fixture", escalated: false, warnings: [],
};
describe("correction processing completion", () => {
  it("validates legacy records and rejects falsely completed family/subtype contracts", () => {
    expect(correctionCompletion(correction)).toBe("completed");
    expect(correctionCompletion({ ...correction, completionStatus: "completed", resolvedFamilies: ["resale"] })).toBe("retry-required");
    expect(correctionCompletion({ ...correction, primaryRole: "Reseller" })).toBe("retry-required");
    expect(correctionCompletion({ ...correction, model: "deterministic-fallback" })).toBe("retry-required");
  });
  it("distinguishes unsupported Hybrid from evidence ambiguity and legitimate multi-family Hybrid", () => {
    expect(selectPrimaryChannel({ roles: [], agentPrimaryRole: "Hybrid" }).primaryRole).toBe("Unresolved");
    expect(correctionCompletion({ ...correction, primaryRole: "Hybrid", resolvedRoles: [], resolvedFamilies: [], primaryFamily: null })).toBe("retry-required");
    expect(correctionCompletion({ ...correction, primaryRole: "Unresolved", primaryFamily: null })).toBe("unresolved");
    expect(correctionCompletion({ ...correction, primaryRole: "Hybrid", primaryFamily: null,
      resolvedRoles: ["SI", "Reseller"], resolvedFamilies: ["services", "resale"] })).toBe("completed");
  });
});
