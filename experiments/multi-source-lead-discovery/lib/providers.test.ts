import { afterEach, describe, expect, it, vi } from "vitest";

import type { DiscoveryProviderId, DiscoveryQuery } from "./contracts";
import { createDiscoveryProvider, discoveryEnvironmentStatus, runGeminiFullSearch } from "./providers";

const query: DiscoveryQuery = {
  query: "WLAN Systemhaus Hotel Netzwerktechnik",
  countryCode: "DE",
  countryName: "Germany",
  languageCode: "de",
  maxResults: 3,
};

const keyByProvider: Record<DiscoveryProviderId, string> = {
  gemini: "GEMINI_API_KEY",
  tavily: "TAVILY_API_KEY",
  "google-places": "GOOGLE_PLACES_API_KEY",
  exa: "EXA_API_KEY",
  brave: "BRAVE_SEARCH_API_KEY",
  searchapi: "SEARCHAPI_API_KEY",
};

function configured(providerId: DiscoveryProviderId): void {
  vi.stubEnv(keyByProvider[providerId], "test-key");
}

afterEach(() => vi.unstubAllEnvs());

describe("multi-source discovery providers", () => {
  it("checks configuration without exposing key values", () => {
    vi.stubEnv("TAVILY_API_KEY", "private-value");
    const status = discoveryEnvironmentStatus();
    expect(status.find((item) => item.providerId === "tavily")?.configured).toBe(true);
    expect(JSON.stringify(status)).not.toContain("private-value");
  });

  it("uses Gemini Grounding with Google Search", async () => {
    configured("gemini");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ steps: [
      { type: "asset", url: "http://www.w3.org/2000/svg" },
      { type: "google_search_result", result: { url: "https://www.google.com/search?q=example" } },
      { type: "google_search_result", result: { url: "https://example.de/" } },
      { type: "model_output", content: [{ type: "text", text: "Example GmbH https://example.de/" }] },
    ] }), { status: 200 }));
    const output = await createDiscoveryProvider("gemini", { fetchImplementation: fetchMock }).search(query);
    expect(fetchMock.mock.calls[0][0]).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.tools).toEqual([{ type: "google_search" }]);
    expect(output.sourceUrls).toContain("https://example.de/");
    expect(output.items).toHaveLength(1);
    expect(output.rawResponse).toBeDefined();
  });

  it("runs Gemini Full as one exact end-to-end grounded request", async () => {
    configured("gemini");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      steps: [{ type: "model_output", content: [{ type: "text", text: "{\"channels\":[]}" }] }],
    }), { status: 200 }));
    const output = await runGeminiFullSearch("exact frozen prompt", {
      countryCode: "DE", countryName: "Germany", languageCode: "de", maxResults: 20,
    }, { fetchImplementation: fetchMock });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.input).toBe("exact frozen prompt");
    expect(request.tools).toEqual([{ type: "google_search" }]);
    expect(output.answerText).toBe("{\"channels\":[]}");
  });

  it("uses Tavily advanced search with bounded results", async () => {
    configured("tavily");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ query: query.query,
      results: [{ title: "Example", url: "https://example.de", content: "WLAN projects", score: 0.9 }],
      usage: { credits: 2 } }), { status: 200 }));
    const output = await createDiscoveryProvider("tavily", { fetchImplementation: fetchMock }).search(query);
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request).toMatchObject({ search_depth: "advanced", max_results: 3, country: "germany" });
    expect(output.usage?.credits).toBe(2);
  });

  it("uses Google Places Text Search with an explicit field mask", async () => {
    configured("google-places");
    vi.stubEnv("GOOGLE_PLACES_BASE_URL", "https://places.googleapis.com/v1/places/...");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ places: [{ id: "place-1",
      displayName: { text: "Local IT GmbH" }, websiteUri: "https://local-it.de", formattedAddress: "Berlin" }] }), { status: 200 }));
    const output = await createDiscoveryProvider("google-places", { fetchImplementation: fetchMock }).search(query);
    expect(fetchMock.mock.calls[0][0]).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(fetchMock.mock.calls[0][1].headers["x-goog-fieldmask"]).toContain("places.websiteUri");
    expect(output.items[0]).toMatchObject({ sourceKind: "place", externalId: "place-1" });
  });

  it("uses Exa's company category for semantic discovery", async () => {
    configured("exa");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [
      { id: "exa-1", title: "Example", url: "https://example.de", text: "Network integrator" },
    ] }), { status: 200 }));
    await createDiscoveryProvider("exa", { fetchImplementation: fetchMock }).search(query);
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request).toMatchObject({ category: "company", userLocation: "DE", numResults: 3 });
  });

  it("uses Brave's independent index with country and language controls", async () => {
    configured("brave");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ web: { results: [
      { title: "Example", url: "https://example.de", description: "Network integrator" },
    ] } }), { status: 200 }));
    await createDiscoveryProvider("brave", { fetchImplementation: fetchMock }).search(query);
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe("/res/v1/web/search");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ country: "DE", search_lang: "de", count: "3" });
  });

  it("uses SearchAPI.io's Google engine with explicit locale controls", async () => {
    configured("searchapi");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ organic_results: [
      { position: 1, title: "Example", link: "https://example.de", snippet: "Network integrator" },
    ] }), { status: 200 }));
    await createDiscoveryProvider("searchapi", { fetchImplementation: fetchMock }).search(query);
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe("/api/v1/search");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ engine: "google", gl: "de", hl: "de" });
    expect(url.searchParams.has("api_key")).toBe(false);
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe("Bearer test-key");
  });

  it("supports the initially configured SearchAPI.io key alias", () => {
    vi.stubEnv("SearchApi.io_API_KEY", "private-value");
    const status = discoveryEnvironmentStatus();
    expect(status.find((item) => item.providerId === "searchapi")?.configured).toBe(true);
    expect(JSON.stringify(status)).not.toContain("private-value");
  });

  it("does not silently fall back when a provider key is missing", async () => {
    await expect(createDiscoveryProvider("exa", { fetchImplementation: vi.fn() }).search(query))
      .rejects.toThrow("EXA_API_KEY");
  });
});
