import { describe, expect, it } from "vitest";

import { calculateExperimentMetrics, rankValues, spearmanCorrelation, type MetricCellInput } from "./evaluation-metrics";

describe("formal experiment metrics", () => {
  it("assigns zero utility to invalid, wrong-role, duplicate and missing slots", () => {
    const slot = (companyKey: string, totalScore: number, overrides = {}) => ({ companyKey, totalScore,
      isRealOperatingCompany: true, operatesInTargetMarket: true, requestedCategoryMatch: true, ...overrides });
    const cells: MetricCellInput[] = Array.from({ length: 8 }, (_, index) => ({ cellId: `cell-${index}`,
      countryCode: index < 4 ? "GB" : "MX", arms: {
        "gemini-native": [slot("duplicate", 80), slot("duplicate", 90), slot("wrong", 99,
          { requestedCategoryMatch: false })],
        "product-e2e": [slot(`product-${index}`, 90)],
      } }));
    const report = calculateExperimentMetrics(cells, true);
    expect(report.byCell[0].arms["gemini-native"].slotUtilities.slice(0, 3)).toEqual([80, 0, 0]);
    expect(report.byCell[0].arms["gemini-native"].missingSlots).toBe(27);
    expect(report.byCell[1].arms["gemini-native"].slotUtilities[0]).toBe(0);
  });

  it("uses average ranks for ties and returns perfect monotonic Spearman correlation", () => {
    expect(rankValues([1, 1, 3])).toEqual([1.5, 1.5, 3]);
    expect(spearmanCorrelation([1, 2, 3], [10, 20, 30])).toBeCloseTo(1, 8);
  });
});
