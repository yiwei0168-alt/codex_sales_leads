import { describe, expect, it } from "vitest";

import rateCardJson from "../config/official-rate-card.v1.json";
import { evaluateBudget, forecastCompletionCost, priceCostEvent, summarizeCostEvents,
  type ExperimentCostEventInput, type ExperimentRateCard } from "./cost-ledger";

const rateCard = rateCardJson as ExperimentRateCard;

function input(overrides: Partial<ExperimentCostEventInput> = {}): ExperimentCostEventInput {
  return {
    eventId: "e1", runId: "r1", cellId: "GB-distribution", arm: "product-e2e",
    ledger: "product-e2e-arm", stage: "qualification", provider: "deepseek",
    requestedModel: "deepseek-v4-flash", actualModel: "deepseek-v4-flash",
    startedAt: "2026-09-02T00:00:00.000Z", completedAt: "2026-09-02T00:00:01.000Z",
    latencyMs: 1_000, attempts: 1, retries: 0, fallbackUsed: false, status: "completed",
    usage: { inputTokens: 1_000_000, outputTokens: 100_000 },
    volume: { inputItems: 10, rawOutputItems: 10, validOutputItems: 9,
      downstreamUsedItems: 8, discardedReasonCounts: { invalid: 1 } },
    ...overrides,
  };
}

describe("formal experiment cost ledger", () => {
  it("prices model tokens using the official rate card", () => {
    const event = priceCostEvent(input(), rateCard);
    expect(event.officialListPriceUsd).toBeCloseTo(0.168, 8);
    expect(event.budgetCostUsd).toBeCloseTo(0.168, 8);
    expect(event.cashCostBasis).toBe("official-conservative");
    expect(event.costAnomalies).toEqual([]);
  });

  it("prices provider-qualified OpenRouter model IDs against the frozen model rate", () => {
    const event = priceCostEvent(input({ provider: "openrouter", requestedModel: "anthropic/claude-opus-5",
      actualModel: "anthropic/claude-opus-5", usage: { inputTokens: 1_000, outputTokens: 100 },
      accountCashCostUsd: 0.0076 }), rateCard);
    expect(event.officialListPriceUsd).toBeCloseTo(0.0075, 8);
    expect(event.budgetCostUsd).toBe(0.0076);
    expect(event.cashCostBasis).toBe("account-observed");
  });

  it("adds Gemini grounding queries to token cost", () => {
    const event = priceCostEvent(input({ provider: "gemini-full", requestedModel: "gemini-3.6-flash",
      actualModel: "gemini-3.6-flash", usage: { inputTokens: 10_000, outputTokens: 2_000, groundingQueries: 3 } }), rateCard);
    expect(event.officialListPriceUsd).toBeCloseTo(0.057, 8);
  });

  it("prices Gemini grounding even when the adapter reports no model tokens", () => {
    const event = priceCostEvent(input({ provider: "gemini-full", requestedModel: "gemini-3.6-flash",
      actualModel: "gemini-3.6-flash", usage: { inputTokens: 0, outputTokens: 0, groundingQueries: 4 } }), rateCard);
    expect(event.officialListPriceUsd).toBeCloseTo(0.056, 8);
  });

  it("does not silently price unknown models or missing grounding counts at zero", () => {
    const unknown = priceCostEvent(input({ actualModel: "unknown-model" }), rateCard);
    const missingGrounding = priceCostEvent(input({ provider: "gemini-full", requestedModel: "gemini-3.6-flash",
      actualModel: "gemini-3.6-flash", usage: { inputTokens: 1, outputTokens: 1 } }), rateCard);
    expect(unknown.budgetCostUsd).toBeNull();
    expect(unknown.costAnomalies).toContain("unknown-model-rate:unknown-model");
    expect(missingGrounding.budgetCostUsd).toBeNull();
    expect(missingGrounding.costAnomalies).toContain("missing-grounding-query-count:gemini-3.6-flash");
  });

  it("prices paid search providers independently from model usage", () => {
    const tavily = priceCostEvent(input({ provider: "tavily", requestedModel: undefined, actualModel: undefined,
      usage: { paidSearchCredits: 3 } }), rateCard);
    const places = priceCostEvent(input({ provider: "google-places", requestedModel: undefined, actualModel: undefined,
      usage: { searchRequests: 2 } }), rateCard);
    expect(tavily.budgetCostUsd).toBeCloseTo(0.024, 8);
    expect(places.budgetCostUsd).toBeCloseTo(0.07, 8);
  });

  it("crosses each checkpoint once and stops when forecast may exceed 100 dollars", () => {
    const events = [priceCostEvent(input({ accountCashCostUsd: 21 }), rateCard)];
    const forecast = forecastCompletionCost(events, { completedCellIds: ["GB-distribution"], totalCells: 8,
      fixedRemainingUsd: 5, initialEstimateUsd: 60 });
    const decision = evaluateBudget(events, forecast, { totalBudgetUsd: 100,
      thresholdsUsd: [20, 40, 60, 80], previouslyReportedThresholdsUsd: [] });
    expect(decision.newlyCrossedThresholdsUsd).toEqual([20]);
    expect(decision.warning).toBe(true);
    expect(decision.requiresUserDecision).toBe(true);
    expect(decision.reasons).toContain("forecast-may-exceed-budget");
  });

  it("does not infer a zero run rate from a completed frozen-arm reuse cell", () => {
    const events = [priceCostEvent(input({ eventId: "historical", cellId: undefined,
      stage: "prior-preflight-adjustment", accountCashCostUsd: 6.25 }), rateCard)];
    const forecast = forecastCompletionCost(events, { completedCellIds: ["MX-retail"], totalCells: 8,
      fixedRemainingUsd: 10, initialEstimateUsd: 30 });
    expect(forecast).toMatchObject({ completedCells: 1, method: "initial-estimate",
      expectedCompletionUsd: 30, upperUsd: 40.5 });
  });

  it("summarizes separate ledgers and anomalies", () => {
    const product = priceCostEvent(input({ accountCashCostUsd: 2 }), rateCard);
    const gemini = priceCostEvent(input({ eventId: "e2", ledger: "gemini-native-arm", arm: "gemini-native",
      provider: "gemini-full", requestedModel: "gemini-3.6-flash", actualModel: "gemini-3.6-flash",
      usage: { inputTokens: 10, outputTokens: 10, groundingQueries: 1 }, accountCashCostUsd: 1 }), rateCard);
    const summary = summarizeCostEvents([product, gemini]);
    expect(summary.budgetCostUsd).toBe(3);
    expect(summary.byLedger["product-e2e-arm"]).toBe(2);
    expect(summary.byLedger["gemini-native-arm"]).toBe(1);
  });
});
