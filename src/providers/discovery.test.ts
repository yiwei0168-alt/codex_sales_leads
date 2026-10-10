import { afterEach, describe, expect, it, vi } from "vitest";

import type { DiscoveryProviderId } from "@/lib/leads/workflow/hybrid-search-policy";
import type { DiscoveryQuery } from "./discovery-contracts";
import { createDiscoveryProvider, DiscoveryProviderError, discoveryEnvironmentStatus, configuredGeminiDiscoveryModel } from "./discovery";

const baseQuery: DiscoveryQuery = { query: "WLAN Systemhaus Germany", countryCode: "DE", countryName: "Germany",
  languageCode: "de", maxResults: 3, category: "si-msp", track: "local-smb", engine: "google",
  mechanism: "web-serp" };
const keyByProvider: Record<DiscoveryProviderId, string> = { "gemini-full": "OPENROUTER_API_KEY",
  "gemini-product": "OPENROUTER_API_KEY", searchapi: "SEARCHAPI_API_KEY", "google-places": "GOOGLE_PLACES_API_KEY",
  brave: "BRAVE_SEARCH_API_KEY", exa: "EXA_API_KEY" };
function grounded(finish = "stop", urls = ["https://example.de/"]) {
  return { choices: [{ finish_reason: finish, message: { content: "Example https://uncited.example/", annotations:
    urls.map(url => ({ type: "url_citation", url_citation: { url, title: "Example" } })) } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 } };
}
function configured(provider: DiscoveryProviderId) { vi.stubEnv(keyByProvider[provider], "test-key"); }

afterEach(() => vi.unstubAllEnvs());

it("uses the same trimmed model fallback for the actual Gemini request and recovery identity",async()=>{
  configured("gemini-full");
  vi.stubEnv("GEMINI_DISCOVERY_MODEL","  ");
  vi.stubEnv("GEMINI_SEARCH_MODEL","gemini-2.5-flash");
  const transport=vi.fn<typeof fetch>(async()=>Response.json(grounded()));
  await createDiscoveryProvider("gemini-full",{fetchImplementation:transport,maxAttempts:1})
    .search({...baseQuery,engine:"google-grounded",mechanism:"planning"});
  expect(configuredGeminiDiscoveryModel()).toBe("google/gemini-2.5-flash");
  expect(JSON.parse(String(transport.mock.calls[0][1]?.body)).model).toBe(configuredGeminiDiscoveryModel());
});

it("uses SearchAPI's alias credential when the standard key is blank",async()=>{
  vi.stubEnv("SEARCHAPI_API_KEY","   ");
  vi.stubEnv("SearchApi.io_API_KEY","synthetic-alias");
  const transport=vi.fn<typeof fetch>(async()=>Response.json({organic_results:[]}));
  await createDiscoveryProvider("searchapi",{fetchImplementation:transport,maxAttempts:1})
    .search({...baseQuery,engine:"google"});
  expect(new Headers(transport.mock.calls[0][1]?.headers).get("authorization")).toBe("Bearer synthetic-alias");
});

it("uses Google's documented fixed ten-result page without issuing additional paid pages",async()=>{
  configured("searchapi");
  const transport=vi.fn<typeof fetch>(async()=>Response.json({organic_results:[]}));
  await createDiscoveryProvider("searchapi",{fetchImplementation:transport}).search({...baseQuery,engine:"google",maxResults:20});
  expect(transport).toHaveBeenCalledOnce();
  const url=new URL(String(transport.mock.calls[0][0]));
  expect(url.searchParams.get("num")).toBe("10");
  expect(url.searchParams.has("page")).toBe(false);
});

it("omits Exa's unsupported company-category domain filter while preserving the requested search",async()=>{
  configured("exa");
  const transport=vi.fn<typeof fetch>(async()=>Response.json({results:[]}));
  await createDiscoveryProvider("exa",{fetchImplementation:transport}).search({...baseQuery,engine:"exa",excludeDomains:["seen.example"]});
  const body=JSON.parse(String(transport.mock.calls[0][1]?.body));
  expect(body).toMatchObject({category:"company",type:"auto",numResults:3,contents:{text:true}});
  expect(body).not.toHaveProperty("excludeDomains");
  expect(body.query).toBe(`${baseQuery.query} in ${baseQuery.countryName}`);
});

it.each(["google-places","exa","brave"] as const)("bounds %s returned candidates even if the provider overdelivers",async providerId=>{
  configured(providerId);
  const entries=Array.from({length:5},(_,index)=>({id:`id-${index}`,title:`Company ${index}`,
    url:`https://company-${index}.example`,text:"Networking",description:"Networking",
    displayName:{text:`Company ${index}`},websiteUri:`https://company-${index}.example`}));
  const body=providerId==="google-places"?{places:entries}
    :providerId==="exa"?{results:entries}:{web:{results:entries}};
  const transport=vi.fn<typeof fetch>(async()=>Response.json(body));
  const result=await createDiscoveryProvider(providerId,{fetchImplementation:transport,maxAttempts:1})
    .search({...baseQuery,maxResults:3});
  expect(result.items).toHaveLength(3);
  expect(result.providerReturnedItems).toBe(5);
  expect(result.providerOverdeliveredItems).toBe(2);
  expect(result.items.map(item=>item.rank)).toEqual([1,2,3]);
  expect(result.sourceUrls).toHaveLength(3);
  expect(transport).toHaveBeenCalledOnce();
});

describe("production discovery providers", () => {
  it("reports configuration without exposing credentials", () => {
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "private-value");
    const status = discoveryEnvironmentStatus();
    expect(status.find((item) => item.providerId === "brave")?.configured).toBe(true);
    expect(JSON.stringify(status)).not.toContain("private-value");
  });

  it.each(["gemini-full", "gemini-product"] as const)("uses Google Search for %s", async (providerId) => {
    configured(providerId);
    const fetchMock = vi.fn().mockResolvedValue(Response.json(grounded()));
    const output = await createDiscoveryProvider(providerId, { fetchImplementation: fetchMock, maxAttempts: 1 })
      .search({ ...baseQuery, engine: "google-grounded", mechanism: providerId === "gemini-full" ? "planning" : "fixed-grounded-query" });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(fetchMock.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "error", headers: { authorization: "Bearer test-key" } });
    expect(request).toMatchObject({ plugins: [{ id: "web", engine: "native" }], max_tokens: 12000,
      reasoning: { effort: "low" }, provider: { data_collection: "deny", require_parameters: true, allow_fallbacks: false } });
    expect(output.sourceUrls).not.toContain("https://uncited.example/");
    expect(output.items[0].url).toBe("https://example.de/");
    expect(output.usage.totalTokens).toBe(15);
  });

  it("keeps query counts unknown instead of deriving them from citations or old fields", async () => {
    configured("gemini-full");
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ...grounded(),
      steps: [{ type: "google_search_call", arguments: { queries: ["old field"] } }] }));
    const output = await createDiscoveryProvider("gemini-full", { fetchImplementation: fetchMock, maxAttempts: 1 }).search(baseQuery);
    expect(output.usage.groundingQueries).toBeUndefined();
    expect(output.usage.groundingCountSource).toBe("unknown");
  });

  it("bounds cited discovery candidates and does not follow generated links", async () => {
    configured("gemini-full");
    const transport = vi.fn().mockResolvedValue(Response.json(grounded("stop", Array.from({ length: 5 }, (_, i) => `https://company-${i}.example/`))));
    const output = await createDiscoveryProvider("gemini-full", { fetchImplementation: transport }).search(baseQuery);
    expect(output.items).toHaveLength(3);
    expect(output.providerReturnedItems).toBe(5);
    expect(output.providerOverdeliveredItems).toBe(2);
    expect(transport).toHaveBeenCalledOnce();
  });

  it("requires gateway credentials even when a legacy Google key exists", async () => {
    vi.stubEnv("GEMINI_API_KEY", "legacy-secret"); vi.stubEnv("OPENROUTER_API_KEY", "");
    const transport = vi.fn();
    await expect(createDiscoveryProvider("gemini-full", { fetchImplementation: transport }).search(baseQuery)).rejects.toThrow("OPENROUTER_API_KEY");
    expect(transport).not.toHaveBeenCalled();
  });

  it("rejects an untrusted gateway before transmitting credentials", async () => {
    configured("gemini-full");
    vi.stubEnv("OPENROUTER_BASE_URL", "https://other.example/api/v1");
    const transport = vi.fn();
    await expect(createDiscoveryProvider("gemini-full", { fetchImplementation: transport }).search(baseQuery)).rejects.toThrow("OpenRouter HTTPS");
    expect(transport).not.toHaveBeenCalled();
  });

  it("keeps authentication errors redacted and does not try the old Google endpoint", async () => {
    configured("gemini-full");
    const transport = vi.fn().mockResolvedValue(new Response("private provider diagnostic", { status: 401 }));
    await expect(createDiscoveryProvider("gemini-full", { fetchImplementation: transport }).search(baseQuery))
      .rejects.toMatchObject({ message: "gemini-full HTTP 401", details: { kind: "authentication", attempts: 1 } });
    expect(transport).toHaveBeenCalledOnce();
  });

  it("rejects uncited output without retry and keeps invalid-response telemetry", async () => {
    configured("gemini-full");
    const transport = vi.fn().mockResolvedValue(Response.json(grounded("stop", [])));
    await expect(createDiscoveryProvider("gemini-full", { fetchImplementation: transport }).search(baseQuery))
      .rejects.toMatchObject({ details: { kind: "invalid-response", attempts: 1, retryable: false } });
    expect(transport).toHaveBeenCalledOnce();
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

  it("does not treat a truncated paid Gemini discovery response as completed candidates", async () => {
    configured("gemini-full");
    const fetchMock = vi.fn().mockResolvedValue(Response.json(grounded("length")));
    await expect(createDiscoveryProvider("gemini-full", { fetchImplementation: fetchMock, maxAttempts: 1 })
      .search({ ...baseQuery, engine: "google-grounded", mechanism: "planning" }))
      .rejects.toThrow("output invalid or incomplete");
    expect(fetchMock).toHaveBeenCalledOnce();
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

  it("uses Brave's global market code when a requested country is unsupported", async () => {
    configured("brave");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ web: { results: [] } }), { status: 200 }));
    await createDiscoveryProvider("brave", { fetchImplementation: fetchMock, maxAttempts: 1 }).search({
      ...baseQuery, countryCode: "CO", countryName: "Colombia", engine: "brave",
      query: "retailer networking Colombia",
    });
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("country")).toBe("ALL");
    expect(url.searchParams.get("q")).toContain("Colombia");
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
