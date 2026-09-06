import { describe, expect, it } from "vitest";

import { calculateProviderContributions } from "./final-report";
import type { FrozenCellBundle } from "./unified-evaluation";

describe("formal report provider attribution", () => {
  it("uses the public attribution projection and splits final credit across providers", () => {
    const bundles = [{ product: {
      discoveryCalls: [
        { route: { provider: "brave" }, requestCount: 1, rawResults: 10, normalizedCompanies: 5,
          newUniqueCompanies: 3, existingCompanyHits: 2, paidSearchCredits: 0 },
        { route: { provider: "searchapi" }, requestCount: 1, rawResults: 8, normalizedCompanies: 4,
          newUniqueCompanies: 2, existingCompanyHits: 2, paidSearchCredits: 1 },
      ],
      finalCandidates: [{ candidateId: "lead-1" }, { candidateId: "lead-2" }],
      attributionCandidates: [
        { candidateId: "lead-1", discoveryOccurrences: [{ provider: "brave" }, { provider: "searchapi" }] },
        { candidateId: "lead-2", discoveryOccurrences: [{ provider: "brave" }] },
      ],
      raw: { corrected: null },
    } }] as unknown as FrozenCellBundle[];

    const rows = calculateProviderContributions(bundles, []);

    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: "brave", downstreamFinalCredit: 1.5 }),
      expect.objectContaining({ provider: "searchapi", downstreamFinalCredit: 0.5 }),
    ]));
    expect(rows.reduce((sum, row) => sum + row.downstreamFinalCredit, 0)).toBe(2);
  });

  it("fails closed before optimization when a final candidate has no provider provenance", () => {
    const bundles = [{ product: { discoveryCalls: [], finalCandidates: [{ candidateId: "lead-missing" }],
      attributionCandidates: [], raw: { corrected: null } } }] as unknown as FrozenCellBundle[];
    expect(() => calculateProviderContributions(bundles, [])).toThrow("Missing provider attribution");
  });
});
