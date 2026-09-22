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

describe("product external API network routes", () => {
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

  it("routes fixed search and evidence APIs through the local proxy", async () => {
    vi.stubEnv("MODEL_PROXY_URL", "http://127.0.0.1:7892");
    for (const url of [
      "https://places.googleapis.com/v1/places:searchText",
      "https://api.exa.ai/search",
      "https://api.search.brave.com/res/v1/web/search",
      "https://www.searchapi.io/api/v1/search",
      "https://api.tavily.com/search",
      "https://api.tavily.com/extract",
      "https://openrouter.ai/api/v1/key",
      openRouter,
    ]) {
      expect(modelProxyEnvironment(url)).toBe("MODEL_PROXY_URL");
      await modelRoutedTransport(fetch, url)(url);
    }
    expect(mocked.fetch).toHaveBeenCalledTimes(8);
    expect(mocked.fetch.mock.calls.every((call) => call[1].dispatcher)).toBe(true);
  });

  it("keeps the specified providers and conditional destinations direct", () => {
    for (const model of ["z-ai/glm-5.3", "deepseek/deepseek-v4-flash", "moonshotai/kimi-k3"]) {
      expect(modelProxyEnvironment(openRouter, request(model))).toBeNull();
    }
    for (const url of ["https://api.deepseek.com/chat/completions",
      "https://api.moonshot.cn/v1/chat/completions",
      "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings",
      "https://api.github.com/repos/example/repo/commits/main",
      "https://example.com/"]) {
      expect(modelProxyEnvironment(url)).toBeNull();
    }
  });

  it("fails closed when a required proxy is missing or non-local", () => {
    vi.stubEnv("MODEL_PROXY_URL", "");
    expect(() => modelRoutedTransport(fetch, openRouter, request("openai/gpt-5.6-sol"))).toThrow("MODEL_PROXY_URL is required");
    vi.stubEnv("MODEL_PROXY_URL", "http://example.com:7892");
    expect(() => modelRoutedTransport(fetch, openRouter, request("openai/gpt-5.6-sol"))).toThrow("local HTTP proxy");
    expect(() => modelRoutedTransport(fetch, "https://api.tavily.com/search")).toThrow("local HTTP proxy");
    expect(mocked.fetch).not.toHaveBeenCalled();
  });
});
