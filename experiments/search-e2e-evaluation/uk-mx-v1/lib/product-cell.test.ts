import { describe, expect, it } from "vitest";

import type { WorkflowModelUsage } from "@/lib/leads/workflow/types";

import type { ExperimentCell } from "./experiment";
import { modelUsageEvents } from "./product-cell";

const cell: ExperimentCell = {
  sequence: 1,
  cellId: "MX-retail",
  countryCode: "MX",
  countryName: "Mexico",
  primaryLanguage: "es",
  supplementaryLanguages: ["en"],
  categoryId: "retail",
  categoryLabel: "Retailer/E-tailer",
  categoryDefinition: "Retail test",
  roles: ["Retailer", "E-tailer"],
  armStartOrder: ["gemini-native", "product-e2e"],
};

function usage(model: string): WorkflowModelUsage {
  return { stage: "qualification", requestedModel: model, actualModel: model, providerId: "deepseek",
    promptTokens: 100, completionTokens: 20, reasoningTokens: 0, totalTokens: 120,
    latencyMs: 10, fallbackUsed: false, attempts: 1, retries: 0 };
}

describe("formal product-cell telemetry", () => {
  it("attributes aggregate stage output once across routine and escalation model events", () => {
    const events = modelUsageEvents(cell, "qualification-score-only-r1",
      [usage("deepseek-v4-flash"), usage("deepseek-v4-pro")],
      "2026-09-06T00:00:00.000Z", "2026-09-06T00:00:01.000Z",
      { inputItems: 26, rawOutputItems: 26, validOutputItems: 25, downstreamUsedItems: 26,
        discardedReasonCounts: { retryRequired: 1 } });
    expect(events).toHaveLength(2);
    expect(events[0].volume).toMatchObject({ inputItems: 26, rawOutputItems: 26,
      validOutputItems: 25, downstreamUsedItems: 25 });
    expect(events[1].volume).toMatchObject({ inputItems: 0, rawOutputItems: 0,
      validOutputItems: 0, downstreamUsedItems: 0 });
    expect(events.reduce((sum, event) => sum + event.volume.rawOutputItems, 0)).toBe(26);
    expect(events.every((event) => event.volume.downstreamUsedItems <= event.volume.validOutputItems)).toBe(true);
  });
});
