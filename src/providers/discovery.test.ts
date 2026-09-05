import { afterEach, describe, expect, it, vi } from "vitest";

import type { DiscoveryProviderId } from "@/lib/leads/workflow/hybrid-search-policy";
import type { DiscoveryQuery } from "./discovery-contracts";
import { createDiscoveryProvider, DiscoveryProviderError, discoveryEnvironmentStatus } from "./discovery";

const baseQuery: DiscoveryQuery = { query: "WLAN Systemhaus Germany", countryCode: "DE", countryName: "Germany",
  languageCode: "de", maxResults: 3, category: "si-msp", track: "local-smb", engine: "google",
  mechanism: "web-serp" };
const keyByProvider: Record<DiscoveryProviderId, string> = { "gemini-full": "GEMINI_API_KEY",
  "gemini-product": "GEMINI_API_KEY", searchapi: "SEARCHAPI_API_KEY", "google-places": "GOOGLE_PLACES_API_KEY",
  brave: "BRAVE_SEARCH_API_KEY", exa: "EXA_API_KEY" };
function configured(provider: DiscoveryProviderId) { vi.stubEnv(keyByProvider[provider], "test-key"); }

afterEach(() => vi.unstubAllEnvs());

describe("production discovery providers", () => {
  it("reports configuration without exposing credentials", () => {
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "private-value");
    const status = discoveryEnvironmentStatus();
    expect(status.find((item) => item.providerId === "brave")?.configured).toBe(true);
    expect(JSON.stringify(status)).not.toContain("private-value");
  });

  it.each(["gemini-full", "gemini-product"] as const)("uses Google Search for %s", async (providerId) => {
    configured(providerId);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ steps: [
      { type: "google_search_result", result: { url: "https://example.de/" } },
      { type: "model_output", content: [{ type: "text", text: "Example https://example.de/" }] },
    ], usage: { input_tokens: 10, output_tokens: 5 } }), { status: 200 }));
    const output = await createDiscoveryProvider(providerId, { fetchImplementation: fetchMock, maxAttempts: 1 })
      .search({ ...baseQuery, engine: "google-grounded", mechanism: providerId === "gemini-full" ? "planning" : "fixed-grounded-query" });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.tools).toEqual([{ type: "google_search" }]);
    expect(output.items[0].url).toBe("https://example.de/");
    expect(output.usage.totalTokens).toBe(15);
  });

  it("selects Google or Bing explicitly in SearchAPI", async () => {
    configured("searchapi");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ organic_results: [
      { position: 1, title: "Example", link: "https://example.de", snippet: "Networking" },
    ] }), { status: 200 }));
    await createDiscoveryProvider("searchapi", { fetchImplementation: fetchMock, maxAttempts: 1 })
      .search({ ...baseQuery, engine: "bing", excludeDomains: ["seen.example", "duplicate.example"] });
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("engine")).toBe("bing");
    expect(url.searchParams.get("q")).toContain("-site:seen.example");
    expect(url.searchParams.get("q")).toContain("-site:duplicate.example");
    expect(url.searchParams.has("api_key")).toBe(false);
  });

  it("passes bounded safe domain exclusions to Brave without credentials in the URL", async () => {
    configured("brave");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ web: { results: [] } }), { status: 200 }));
    await createDiscoveryProvider("brave", { fetchImplementation: fetchMock, maxAttempts: 1 }).search({
      ...baseQuery, engine: "brave", excludeDomains: ["seen.example", "bad domain", ...Array.from({ length: 25 },
        (_, index) => `company-${index}.example`)],
    });
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    const query = url.searchParams.get("q") ?? "";
    expect(query).toContain("-site:seen.example");
    expect(query).not.toContain("bad domain");
    expect((query.match(/-site:/g) ?? [])).toHaveLength(20);
    expect(query.length).toBeLessThanOrEqual(580);
    expect(url.searchParams.has("subscription_token")).toBe(false);
  });

  it("keeps verbose Brave queries below the provider's 600-character limit", async () => {
    configured("brave");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ web: { results: [] } }), { status: 200 }));
    await createDiscoveryProvider("brave", { fetchImplementation: fetchMock, maxAttempts: 1 }).search({
      ...baseQuery, engine: "brave", query: "networking retailer ".repeat(50),
      excludeDomains: Array.from({ length: 30 }, (_, index) => `company-${index}.example`),
    });
    const query = new URL(fetchMock.mock.calls[0][0] as string).searchParams.get("q") ?? "";
    expect(query.length).toBeLessThanOrEqual(580);
    expect(query).toContain("networking retailer");
  });

  it("returns Place ID and website while keeping map-only candidates resolvable", async () => {
    configured("google-places");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ places: [
      { id: "place-1", displayName: { text: "Local IT" }, websiteUri: "https://local.example", formattedAddress: "Berlin" },
      { id: "place-2", displayName: { text: "Sparse IT" }, googleMapsUri: "https://maps.google.com/example" },
    ] }), { status: 200 }));
    const output = await createDiscoveryProvider("google-places", { fetchImplementation: fetchMock, maxAttempts: 1 })
      .search({ ...baseQuery, engine: "google-places", mechanism: "local-text-search" });
    expect(output.items.map((entry) => entry.externalId)).toEqual(["place-1", "place-2"]);
  });

  it("retries one transient provider failure and records it", async () => {
    configured("brave");
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ web: { results: [] } }), { status: 200 }));
    const output = await createDiscoveryProvider("brave", { fetchImplementation: fetchMock, maxAttempts: 2 })
      .search({ ...baseQuery, engine: "brave", mechanism: "web-index" });
    expect(output).toMatchObject({ requestCount: 2, retryCount: 1 });
  });

  it("does not retry a non-transient authentication failure and exposes failure telemetry", async () => {
    configured("brave");
    const fetchMock = vi.fn().mockResolvedValue(new Response("forbidden", { status: 403 }));
    const request = createDiscoveryProvider("brave", { fetchImplementation: fetchMock, maxAttempts: 3 })
      .search({ ...baseQuery, engine: "brave", mechanism: "web-index" });
    await expect(request).rejects.toMatchObject({ name: "DiscoveryProviderError",
      details: { kind: "authentication", attempts: 1, circuitScope: "provider" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a response parsing failure or discard its failure type", async () => {
    configured("brave");
    const fetchMock = vi.fn().mockResolvedValue(new Response("not-json", { status: 200 }));
    try {
      await createDiscoveryProvider("brave", { fetchImplementation: fetchMock, maxAttempts: 3 })
        .search({ ...baseQuery, engine: "brave", mechanism: "web-index" });
      throw new Error("Expected invalid response to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(DiscoveryProviderError);
      expect((error as DiscoveryProviderError).details.kind).toBe("invalid-response");
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not silently substitute another provider when credentials are absent", async () => {
    await expect(createDiscoveryProvider("exa", { fetchImplementation: vi.fn() }).search({
      ...baseQuery, engine: "exa", mechanism: "semantic-pages",
    })).rejects.toThrow("EXA_API_KEY");
  });
});
