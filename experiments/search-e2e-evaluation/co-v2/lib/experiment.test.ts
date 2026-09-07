import { describe, expect, it } from "vitest";

import { calculateExperimentMetrics } from "./evaluation-metrics";
import { EXPERIMENT_CONFIG, experimentCells, leadPlanForCell, validateExperimentConfig } from "./experiment";

describe("Colombia E2E v2 frozen configuration", () => {
  it("freezes four 50-slot cells and the requested budget checkpoints", () => {
    expect(() => validateExperimentConfig()).not.toThrow();
    expect(experimentCells().map((cell) => cell.cellId)).toEqual([
      "CO-retail", "CO-distribution", "CO-si-msp", "CO-resale",
    ]);
    expect(EXPERIMENT_CONFIG.sample).toMatchObject({ cells: 4, slotsPerArmPerCell: 50,
      slotsPerArm: 200, totalSlots: 400 });
    expect(EXPERIMENT_CONFIG.cost).toMatchObject({ hardBudgetUsd: 50, reviewThresholdUsd: [10, 20, 30] });
    expect(experimentCells().every((cell) => leadPlanForCell(cell).targetCount === 50)).toBe(true);
  });

  it("calculates metrics over all 50 slots", () => {
    const report = calculateExperimentMetrics(experimentCells().map((cell) => {
      const candidates = Array.from({ length: 50 }, (_, index) => ({ companyKey: `${cell.cellId}-${index}`,
        totalScore: 60, isRealOperatingCompany: true, operatesInTargetMarket: true,
        requestedCategoryMatch: true }));
      return { cellId: cell.cellId, countryCode: cell.countryCode, arms: { "gemini-native": candidates,
        "product-e2e": candidates.map((candidate) => ({ ...candidate, totalScore: 70 })) } };
    }), true);
    expect(report.byCell.every((cell) => cell.arms["product-e2e"].slotUtilities.length === 50)).toBe(true);
    expect(report.macroDelta).toBe(10);
  });
});
