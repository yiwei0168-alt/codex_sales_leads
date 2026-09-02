import { describe, expect, it } from "vitest";

import { EXPERIMENT_CONFIG, experimentCells, intentRolesStayWithinCategory, leadPlanForCell } from "./experiment";

describe("formal experiment intent normalization", () => {
  it("accepts one or all roles inside a frozen category", () => {
    expect(intentRolesStayWithinCategory(["Distributor"], ["Distributor", "VAD"])).toBe(true);
    expect(intentRolesStayWithinCategory(["Distributor", "VAD"], ["Distributor", "VAD"])).toBe(true);
  });

  it("rejects empty or out-of-category role output", () => {
    expect(intentRolesStayWithinCategory([], ["Distributor", "VAD"])).toBe(false);
    expect(intentRolesStayWithinCategory(["Distributor", "Retailer"], ["Distributor", "VAD"])).toBe(false);
  });

  it("keeps formal intent prompts on the positive frozen boundary", () => {
    for (const cell of experimentCells()) {
      const prompt = leadPlanForCell(cell).userRequest;
      expect(prompt).toContain(cell.categoryLabel);
      expect(prompt).not.toMatch(/agent|brand owner|oem|odm|agente|propietario de marca/i);
    }
  });

  it("freezes the user-approved blind-review fallback chain", () => {
    expect(EXPERIMENT_CONFIG.blindAudit).toMatchObject({ primaryModel: "claude-opus-5",
      gatewayFallbackModel: "gpt-5.6-sol", unavailableFallbackMode: "codex-in-session",
      fallbackActivated: true, allowWebSearch: false, requireDecisionCommitAndPushBeforeDeblind: true });
  });
});
