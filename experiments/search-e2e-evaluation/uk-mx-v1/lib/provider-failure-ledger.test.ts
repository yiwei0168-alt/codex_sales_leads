import { afterEach, describe, expect, it, vi } from "vitest";

import { judgeBlindPacket, type BlindPacket } from "./blind-audit";
import { runControlCell } from "./control-cell";
import type { ExperimentCostEvent } from "./cost-ledger";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_BASE_URL;
});

describe("formal experiment provider-failure ledger", () => {
  it("records an exhausted Gemini transport failure before keeping the arm retryable", async () => {
    process.env.GEMINI_API_KEY = "test-only";
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const events: ExperimentCostEvent[] = [];
    await expect(runControlCell({ sequence: 1, cellId: "GB-distribution", countryCode: "GB",
      countryName: "United Kingdom", primaryLanguage: "en", supplementaryLanguages: [],
      categoryId: "distribution", categoryLabel: "Distributor/VAD", categoryDefinition: "test",
      roles: ["Distributor", "VAD"], armStartOrder: ["product-e2e", "gemini-native"] },
    { onCostEvents: (items) => { events.push(...items); } })).rejects.toThrow("transport failure after 2 attempt");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ status: "failed", attempts: 2, retries: 1, budgetCostUsd: 0,
      volume: { rawOutputItems: 0, validOutputItems: 0, downstreamUsedItems: 0,
        discardedReasonCounts: { transportFailure: 1 } } });
  });

  it("records an exhausted Claude transport failure before keeping the blind packet retryable", async () => {
    process.env.OPENROUTER_API_KEY = "test-only";
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const events: ExperimentCostEvent[] = [];
    const packet: BlindPacket = { packetId: "blind-test", targetMarket: { countryCode: "GB",
      countryName: "United Kingdom" }, requestedCategory: "distribution", cudyBrief: "test",
    company: { name: "Example", domain: "example.com", officialWebsiteUrl: "https://example.com" },
    evidence: [{ evidenceId: "e1", sourceType: "official-website", url: "https://example.com",
      title: "Example", excerpt: "Example evidence." }] };
    await expect(judgeBlindPacket(packet, "anthropic/claude-opus-5",
      { onCostEvents: (items) => { events.push(...items); } })).rejects.toThrow("transport failure after 2 attempt");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ status: "failed", attempts: 2, retries: 1, budgetCostUsd: 0,
      volume: { rawOutputItems: 0, validOutputItems: 0, downstreamUsedItems: 0,
        discardedReasonCounts: { transportFailure: 1 } } });
  });
});
