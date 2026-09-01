import { describe, expect, it } from "vitest";

import type { DiscoveryItem, DiscoveryQuery } from "@/providers/discovery-contracts";
import type { HybridSearchRouteStep } from "./hybrid-search-policy";
import { normalizedCompanyDomain, RealtimeCandidateRegistry } from "./candidate-registry";

const query: DiscoveryQuery = { query: "network company", countryCode: "DE", countryName: "Germany",
  languageCode: "de", maxResults: 10, category: "si-msp", track: "local-smb", engine: "google",
  mechanism: "web-serp" };
const route: HybridSearchRouteStep = { category: "si-msp", track: "local-smb", sequence: 0,
  provider: "searchapi", engine: "google", mechanism: "web-serp", trigger: "core", invocationReason: "core" };
function item(overrides: Partial<DiscoveryItem> = {}): DiscoveryItem {
  return { providerId: "searchapi", title: "Example GmbH", url: "https://www.example.de/about", snippet: "WLAN",
    rank: 1, sourceKind: "web", ...overrides };
}

describe("real-time candidate registry", () => {
  it("normalizes root domains without collapsing public suffixes", () => {
    expect(normalizedCompanyDomain("https://shop.example.co.uk/products")).toBe("example.co.uk");
    expect(normalizedCompanyDomain("https://maps.google.com/example")).toBeNull();
  });

  it("merges provider occurrences and preserves first-discovery attribution", () => {
    const registry = new RealtimeCandidateRegistry("run-1", "DE");
    expect(registry.add(item(), query, route, ["SI"]).firstDiscovery).toBe(true);
    const secondRoute = { ...route, provider: "brave" as const, engine: "brave" as const, sequence: 1 };
    expect(registry.add(item({ providerId: "brave", url: "https://example.de/solutions" }),
      { ...query, engine: "brave", mechanism: "web-index" }, secondRoute, ["MSP"]).firstDiscovery).toBe(false);
    const [candidate] = registry.toWorkflowCandidates(10);
    expect(candidate.queryRoles).toEqual(["SI", "MSP"]);
    expect(candidate.discoveryOccurrences?.map((occurrence) => occurrence.firstDiscovery)).toEqual([true, false]);
  });

  it("retains a map-only place for later website resolution without sending it to scoring", () => {
    const registry = new RealtimeCandidateRegistry("run-1", "DE");
    registry.add(item({ providerId: "google-places", title: "Sparse IT", url: "https://maps.google.com/sparse",
      externalId: "place-1", sourceKind: "place" }), { ...query, engine: "google-places" },
    { ...route, provider: "google-places", engine: "google-places", mechanism: "local-text-search" }, ["Installer"]);
    expect(registry.unresolvedPlaceCount).toBe(1);
    expect(registry.toWorkflowCandidates(10)).toEqual([]);
  });
});
