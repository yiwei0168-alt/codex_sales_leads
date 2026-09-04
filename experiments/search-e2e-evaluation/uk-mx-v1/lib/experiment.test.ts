import { describe, expect, it } from "vitest";

import { EXPERIMENT_CONFIG, experimentCells, intentRolesRecognizeCategory, leadPlanForCell } from "./experiment";

describe("formal experiment intent normalization", () => {
  it("accepts model role plans that recognize the frozen category", () => {
    expect(intentRolesRecognizeCategory(["Distributor"], ["Distributor", "VAD"])).toBe(true);
    expect(intentRolesRecognizeCategory(["Distributor", "VAD"], ["Distributor", "VAD"])).toBe(true);
    expect(intentRolesRecognizeCategory(["Retailer", "Reseller"], ["Retailer", "E-tailer"])).toBe(true);
  });

  it("rejects empty or entirely out-of-category role output", () => {
    expect(intentRolesRecognizeCategory([], ["Distributor", "VAD"])).toBe(false);
    expect(intentRolesRecognizeCategory(["Retailer", "Reseller"], ["Distributor", "VAD"])).toBe(false);
  });

  it("keeps formal intent prompts on the positive frozen boundary", () => {
    for (const cell of experimentCells()) {
      const prompt = leadPlanForCell(cell).userRequest;
      expect(prompt).toContain(cell.categoryLabel);
      expect(prompt).not.toMatch(/agent|brand owner|oem|odm|agente|propietario de marca/i);
      if (cell.countryCode === "MX") expect(prompt).toContain("Busca y evalúa 30 empresas");
    }
  });

  it("freezes the user-approved blind-review fallback chain", () => {
    expect(EXPERIMENT_CONFIG.blindAudit).toMatchObject({ primaryModel: "claude-opus-5",
      gatewayFallbackModel: "gpt-5.6-sol", gatewayFallbackProvider: "openrouter-openai-chat-completions",
      unavailableFallbackMode: "codex-in-session", fallbackActivated: false,
      allowWebSearch: false, requireDecisionCommitAndPushBeforeDeblind: true });
  });

  it("separates inherited preflight source cost from cumulative carry-forward cost", () => {
    expect(EXPERIMENT_CONFIG.preflightReuse.sourceProductBudgetUsd)
      .toBeLessThanOrEqual(EXPERIMENT_CONFIG.cost.priorProductPreflightAdjustmentUsd);
    expect(EXPERIMENT_CONFIG.preflightReuse.sourceGeminiControlBudgetUsd)
      .toBeLessThanOrEqual(EXPERIMENT_CONFIG.cost.priorGeminiControlAdjustmentUsd);
    expect(EXPERIMENT_CONFIG.cost.priorProductPreflightAdjustmentUsd
      + EXPERIMENT_CONFIG.cost.priorGeminiControlAdjustmentUsd).toBeCloseTo(1.7460204110519397, 12);
  });
});
