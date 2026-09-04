import { describe, expect, it } from "vitest";

import type { LeadSearchPlan } from "@/lib/assistant/types";
import type { DiscoveryProvider, DiscoveryProviderResult, DiscoveryQuery } from "@/providers/discovery-contracts";
import { DiscoveryProviderError } from "@/providers/discovery";
import type { DiscoveryGateResult } from "./discovery-gate";
import { createHybridDiscoverySession, executeHybridDiscovery } from "./hybrid-discovery-executor";
import type { HybridSearchRouteStep } from "./hybrid-search-policy";
import type { LeadMarketPlaybook, LeadWorkflowCandidate } from "./types";

const plan: LeadSearchPlan = { countryCode: "DE", countryName: "Germany", objective: "new-market",
  roles: ["Distributor"], targetCount: 2, queryLanguage: "de", userRequest: "Search Germany distributors" };
const playbook: LeadMarketPlaybook = { marketHypothesis: "Germany channel", productAngles: ["SMB"],
  preferredCompanyTraits: ["networking"], exclusions: [], rolePriorities: [{ family: "distribution",
    roles: ["Distributor"], weight: 1, reason: "test" }], searchQueries: [{ family: "distribution",
    roles: ["Distributor"], query: "German networking distributor", priority: 1 }], ragCitationIds: [],
  generatedBy: "deterministic-fallback", warnings: [] };

class FakeProvider implements DiscoveryProvider {
  constructor(readonly id: DiscoveryProvider["id"], private readonly domain: string | null) {}
  async search(query: DiscoveryQuery): Promise<DiscoveryProviderResult> {
    const items = this.domain ? [{ providerId: this.id, title: `${this.domain} GmbH`, url: `https://${this.domain}`,
      snippet: "Networking distributor", rank: 1, sourceKind: "web" as const }] : [];
    return { providerId: this.id, query, items, sourceUrls: items.map((item) => item.url), requestCount: 1,
      retryCount: 0, latencyMs: 1, usage: { paidSearchCredits: 1, inputTokens: 0, outputTokens: 0, totalTokens: 0 } };
  }
}

const passGate = { evaluate: async (candidates: LeadWorkflowCandidate[]): Promise<DiscoveryGateResult> => ({
  candidates: candidates.map((candidate) => ({ ...candidate, discoveryGate: { status: "pass", reasonCodes: ["test"],
    missingEvidence: [], roleHints: ["Distributor"], model: "test" } })), rejected: [], usage: [], warnings: [],
}) };

describe("hybrid discovery executor", () => {
  it("runs the category core, shares the registry and records conditional calls", async () => {
    const output = await executeHybridDiscovery("run-1", plan, playbook, { gate: passGate,
      providerFactory: (step) => new FakeProvider(step.provider, step.sequence === 0 ? "example.de" : "example.de"),
      concurrency: 2 });
    expect(output.candidates).toHaveLength(1);
    expect(output.candidates[0].discoveryOccurrences?.length).toBeGreaterThan(1);
    expect(output.calls[0]).toMatchObject({ status: "completed", newUniqueCompanies: 1 });
    expect(output.calls.some((call) => call.existingCompanyHits > 0)).toBe(true);
  });

  it("stops a track after two no-value batches and records skipped cost", async () => {
    const output = await executeHybridDiscovery("run-2", { ...plan, targetCount: 20 }, playbook, { gate: passGate,
      providerFactory: (step) => new FakeProvider(step.provider, null), concurrency: 1 });
    expect(output.stopReason).toBe("marginal-value-stop");
    expect(output.calls.filter((call) => call.status === "skipped").length).toBeGreaterThan(0);
    expect(output.calls.filter((call) => call.status === "skipped").every((call) => call.paidSearchCredits === 0)).toBe(true);
  });

  it("does not count provider failures as no-value batches and continues with a complementary fallback", async () => {
    const output = await executeHybridDiscovery("run-fallback", { ...plan, targetCount: 20 }, playbook, {
      gate: passGate, concurrency: 2,
      providerFactory: (step) => ({ id: step.provider, search: async (query) => {
        if (step.sequence === 0) throw new DiscoveryProviderError("gateway unavailable", {
          provider: step.provider, kind: "transport", attempts: 2, latencyMs: 25,
          retryable: true, circuitScope: "route",
        });
        return new FakeProvider(step.provider, step.sequence === 1 ? "fallback.example" : null).search(query);
      } }),
    });
    expect(output.calls.find((call) => call.status === "failed")).toMatchObject({
      failureClass: "transport", requestCount: 2, retryCount: 1,
    });
    expect(output.calls.some((call) => call.status === "completed" && call.fallbackUsed
      && call.newUniqueCompanies === 1)).toBe(true);
    expect(output.candidates.map((candidate) => candidate.domain)).toContain("fallback.example");
  });

  it("opens a provider circuit after an authentication failure without treating skips as no-value", async () => {
    const retailPlan: LeadSearchPlan = { ...plan, countryCode: "MX", countryName: "Mexico", queryLanguage: "es",
      roles: ["Retailer", "E-tailer"], targetCount: 30 };
    const output = await executeHybridDiscovery("run-circuit", retailPlan, { ...playbook,
      searchQueries: [{ family: "retail", roles: ["Retailer"], query: "tiendas de routers", priority: 1 }] }, {
      gate: passGate, concurrency: 3,
      providerFactory: (step) => ({ id: step.provider, search: async (query) => {
        if (step.provider === "searchapi") throw new DiscoveryProviderError("invalid key", {
          provider: "searchapi", kind: "authentication", attempts: 1, latencyMs: 2,
          retryable: false, circuitScope: "provider",
        });
        return new FakeProvider(step.provider, null).search(query);
      } }),
    });
    expect(output.calls.filter((call) => call.route.provider === "searchapi" && call.status === "failed")).toHaveLength(1);
    expect(output.calls.some((call) => call.route.provider === "searchapi" && call.status === "skipped"
      && call.discardedReasonCounts["circuit-open"] === 1)).toBe(true);
    expect(output.calls.some((call) => call.route.provider === "google-places")).toBe(true);
    expect(output.calls.some((call) => call.route.provider === "gemini-product")).toBe(false);
  });

  it("reuses an identical current-task search call without charging tokens or search credits twice", async () => {
    const session = createHybridDiscoverySession();
    let providerCalls = 0;
    const factory = (step: HybridSearchRouteStep) => ({
      id: step.provider, search: async (query: DiscoveryQuery) => {
        providerCalls += 1;
        return new FakeProvider(step.provider, "cached.example").search(query);
      },
    });
    const first = await executeHybridDiscovery("cache-1", plan, playbook,
      { gate: passGate, providerFactory: factory, concurrency: 2, session });
    const callsAfterFirst = providerCalls;
    const second = await executeHybridDiscovery("cache-2", plan, playbook,
      { gate: passGate, providerFactory: factory, concurrency: 2, session });
    expect(callsAfterFirst).toBeGreaterThan(0);
    expect(providerCalls).toBe(callsAfterFirst);
    expect(second.calls.filter((call) => call.cacheStatus === "hit")).not.toHaveLength(0);
    expect(second.calls.filter((call) => call.cacheStatus === "hit")
      .every((call) => call.paidSearchCredits === 0 && call.inputTokens === 0 && call.outputTokens === 0)).toBe(true);
    expect(second.candidates).toHaveLength(0);
    expect(first.calls.some((call) => call.cacheStatus === "miss")).toBe(true);
  });

  it("uses only the OEM customer opportunity chain for an explicit OEM task", async () => {
    const output = await executeHybridDiscovery("run-3", { ...plan, roles: ["Brand Owner", "ISP"],
      userRequest: "Search Germany OEM ODM private label customer leads", opportunityTargets: ["OEM/ODM"] }, playbook,
    { gate: passGate, providerFactory: (step) => new FakeProvider(step.provider, null), concurrency: 1 });
    expect(new Set(output.calls.map((call) => call.route.category))).toEqual(new Set(["oem-odm-opportunity"]));
    expect(output.calls.some((call) => call.route.provider === "gemini-product")).toBe(false);
  });
});
