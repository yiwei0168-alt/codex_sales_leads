import { afterEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock("undici", () => ({
  fetch: mocked.fetch,
  ProxyAgent: class {},
}));

import { modelProxyEnvironment, modelRoutedTransport } from "./model-transport";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

const openRouter = "https://openrouter.ai/api/v1/chat/completions";
const request = (model: string) => ({ method: "POST", body: JSON.stringify({ model }) });

describe("product model network routes", () => {
  it("keeps GLM direct while routing OpenAI and Claude on the same gateway through the proxy", async () => {
    vi.stubEnv("MODEL_PROXY_URL", "http://127.0.0.1:7892");
    expect(modelProxyEnvironment(openRouter, request("z-ai/glm-5.3"))).toBeNull();
    expect(modelRoutedTransport(fetch, openRouter, request("z-ai/glm-5.3"))).toBe(fetch);
    for (const model of ["openai/gpt-5.6-sol", "anthropic/claude-sonnet-4.6"]) {
      const init = request(model);
      expect(modelProxyEnvironment(openRouter, init)).toBe("MODEL_PROXY_URL");
      await modelRoutedTransport(fetch, openRouter, init)(openRouter, init);
    }
    expect(mocked.fetch).toHaveBeenCalledTimes(2);
    expect(mocked.fetch.mock.calls.every((call) => call[1].dispatcher)).toBe(true);
  });

  it("routes Gemini through its proxy and never overrides an injected transport", () => {
    const gemini = "https://generativelanguage.googleapis.com/v1beta/interactions";
    vi.stubEnv("GEMINI_PROXY_URL", "http://127.0.0.1:7892");
    expect(modelProxyEnvironment(gemini, request("gemini-3.6-flash"))).toBe("GEMINI_PROXY_URL");
    const injected = vi.fn() as typeof fetch;
    expect(modelRoutedTransport(injected, gemini, request("gemini-3.6-flash"))).toBe(injected);
  });

  it("fails closed when a required proxy is missing or non-local", () => {
    vi.stubEnv("MODEL_PROXY_URL", "");
    expect(() => modelRoutedTransport(fetch, openRouter, request("openai/gpt-5.6-sol"))).toThrow("MODEL_PROXY_URL is required");
    vi.stubEnv("MODEL_PROXY_URL", "http://example.com:7892");
    expect(() => modelRoutedTransport(fetch, openRouter, request("openai/gpt-5.6-sol"))).toThrow("local HTTP proxy");
    expect(mocked.fetch).not.toHaveBeenCalled();
  });
});
