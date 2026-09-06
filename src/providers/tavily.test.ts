import { afterEach, describe, expect, it, vi } from "vitest";
import { TavilySearchProvider, tavilyFailureMetrics } from "./tavily";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("TavilySearchProvider country scope", () => {
  it("does not silently default a global request to Mexico", async () => {
    vi.stubEnv("TAVILY_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [], usage: { credits: 1 } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await new TavilySearchProvider().search({ query: "network distributor Germany" });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty("country");
  });

  it("passes an explicitly resolved country boost", async () => {
    vi.stubEnv("TAVILY_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [], usage: { credits: 1 } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await new TavilySearchProvider().search({ query: "network distributor Germany", country: "germany" });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.country).toBe("germany");
  });

  it("supports a single-attempt mode for controlled benchmarks", async () => {
    vi.stubEnv("TAVILY_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "busy" }), { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new TavilySearchProvider({ maxAttempts: 1 }).search({ query: "network distributor Germany" }))
      .rejects.toMatchObject({ name: "TavilyProviderUnavailableError", attempts: 1, retries: 0,
        cause: expect.objectContaining({ message: expect.stringContaining("HTTP 503") }) });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves attempted requests and retries when transport calls fail", async () => {
    vi.stubEnv("TAVILY_API_KEY", "test-key");
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    const provider = new TavilySearchProvider({ maxAttempts: 2, fetchImplementation: fetchMock });

    const error = await provider.search({ query: "network distributor Germany" }).catch((value: unknown) => value);

    expect(tavilyFailureMetrics(error)).toMatchObject({ attempts: 2, retries: 1 });
    expect(tavilyFailureMetrics(error).latencyMs).toBeGreaterThanOrEqual(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("preserves the successful HTTP attempt when response JSON is invalid", async () => {
    vi.stubEnv("TAVILY_API_KEY", "test-key");
    const provider = new TavilySearchProvider({ maxAttempts: 1,
      fetchImplementation: vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })) });

    const error = await provider.search({ query: "network distributor Germany" }).catch((value: unknown) => value);

    expect(tavilyFailureMetrics(error)).toMatchObject({ attempts: 1, retries: 0 });
  });
});
