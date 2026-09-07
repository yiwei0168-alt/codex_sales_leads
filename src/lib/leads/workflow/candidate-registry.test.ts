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
    expect(normalizedCompanyDomain(" https://www.example.com/products` ")).toBe("example.com");
    expect(normalizedCompanyDomain("https://co.uk/path")).toBeNull();
    expect(normalizedCompanyDomain("https://com.mx/path")).toBeNull();
    expect(normalizedCompanyDomain("https://shop.technology.com.pe/products")).toBe("technology.com.pe");
    expect(normalizedCompanyDomain("https://store.example.com.co/products")).toBe("example.com.co");
    expect(normalizedCompanyDomain("https://exa.ai/library/organization/example")).toBeNull();
    expect(normalizedCompanyDomain("https://bad_domain.co.uk/path")).toBeNull();
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

  it("does not merge different Exa library profiles into an existing company identity", () => {
    const registry = new RealtimeCandidateRegistry("run-1", "CO");
    registry.add(item({ title: "Teklotengo", url: "https://teklotengo.com" }), query, route, ["E-tailer"]);
    const exaRoute = { ...route, provider: "exa" as const, engine: "exa" as const };
    registry.add(item({ providerId: "exa", title: "Teklotengo",
      url: "https://exa.ai/library/organization/teklotengo", externalId: "exa-1" }),
    { ...query, engine: "exa" }, exaRoute, ["E-tailer"]);
    registry.add(item({ providerId: "exa", title: "Another Company",
      url: "https://exa.ai/library/organization/another", externalId: "exa-2" }),
    { ...query, engine: "exa" }, exaRoute, ["E-tailer"]);
    const [candidate] = registry.toWorkflowCandidates(10);
    expect(candidate.domain).toBe("teklotengo.com");
    expect(candidate.evidence.some((evidence) => evidence.title === "Another Company")).toBe(false);
  });
});
