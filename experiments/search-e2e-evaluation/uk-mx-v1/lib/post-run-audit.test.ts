import { describe, expect, it } from "vitest";

import { calculateAuditedProviderContributions, summarizeBlindAuditByCell } from "./post-run-audit";

describe("completed-run audit", () => {
  it("attributes each final company fractionally across all observed discovery providers", () => {
    const rows = calculateAuditedProviderContributions([{
      discoveryCalls: [
        { route: { provider: "brave" }, requestCount: 1, rawResults: 3, normalizedCompanies: 3,
          newUniqueCompanies: 2, existingCompanyHits: 1, paidSearchCredits: 1 },
        { route: { provider: "exa" }, requestCount: 1, rawResults: 2, normalizedCompanies: 2,
          newUniqueCompanies: 1, existingCompanyHits: 1, paidSearchCredits: 1 },
      ],
      finalCandidates: [{ candidateId: "lead-a" }, { candidateId: "lead-b" }],
      correctedCandidates: [
        { candidateId: "lead-a", discoveryOccurrences: [{ provider: "brave" }, { provider: "exa" }] },
        { candidateId: "lead-b", discoveryOccurrences: [{ provider: "brave" }] },
      ],
      discoveryCostByProvider: { brave: 0.01, exa: 0.02 },
    }]);
    expect(rows).toEqual([
      expect.objectContaining({ provider: "brave", fractionalFinalCredit: 1.5, productiveDiscoveryCostUsd: 0.01 }),
      expect.objectContaining({ provider: "exa", fractionalFinalCredit: 0.5, productiveDiscoveryCostUsd: 0.02 }),
    ]);
    expect(rows.reduce((sum, row) => sum + row.fractionalFinalCredit, 0)).toBe(2);
  });

  it("separates exact subtype agreement from role-family agreement", () => {
    const rows = summarizeBlindAuditByCell([{
      packetId: "packet-1", cellId: "GB-distribution", unifiedPrimaryRole: "Distributor",
      unifiedScore: 80, unifiedQualified: true,
    }], [{ packetId: "packet-1", output: { primaryRole: "VAD", totalScore: 75, eligibility: "eligible" } }]);
    expect(rows[0]).toMatchObject({ exactRoleAgreement: 0, roleFamilyAgreement: 1,
      qualifiedStatusAgreement: 1, meanAbsoluteError: 5, meanBias: -5 });
  });
});
