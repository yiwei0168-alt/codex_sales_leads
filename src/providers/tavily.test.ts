import { afterEach, describe, expect, it, vi } from "vitest";
import { TavilySearchProvider } from "./tavily";

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
});
