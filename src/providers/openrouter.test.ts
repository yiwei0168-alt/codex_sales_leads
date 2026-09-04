import { afterEach, describe, expect, it, vi } from "vitest";

import { OpenAiCompatibleProvider } from "./openai-compatible";
import { getOpenRouterConfig, openRouterRequestHeaders, resolveOpenRouterModel } from "./openrouter";

afterEach(() => vi.unstubAllEnvs());

describe("OpenRouter configuration", () => {
  it("normalizes provider-qualified model IDs", () => {
    expect(resolveOpenRouterModel("gpt-5-mini", "openai")).toBe("openai/gpt-5-mini");
    expect(resolveOpenRouterModel("claude-sonnet-4-6", "anthropic")).toBe("anthropic/claude-sonnet-4.6");
    expect(resolveOpenRouterModel("anthropic/claude-opus-5", "anthropic")).toBe("anthropic/claude-opus-5");
  });

  it("uses OpenRouter attribution headers without accepting an arbitrary gateway", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-only");
    vi.stubEnv("OPENROUTER_HTTP_REFERER", "https://example.test/app");
    vi.stubEnv("OPENROUTER_APP_TITLE", "Test App");
    const config = getOpenRouterConfig();
    expect(config.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(openRouterRequestHeaders(config)).toMatchObject({
      authorization: "Bearer test-only",
      "HTTP-Referer": "https://example.test/app",
      "X-OpenRouter-Title": "Test App",
    });
    vi.stubEnv("OPENROUTER_BASE_URL", "https://attacker.example/v1");
    expect(() => getOpenRouterConfig()).toThrow("OPENROUTER_BASE_URL");
  });

  it("sends strict schemas and returns OpenRouter token and cash-cost telemetry", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      void url;
      void init;
      return new Response(JSON.stringify({ id: "generation-1", model: "openai/gpt-5-mini",
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ ok: true }) } }],
        usage: { prompt_tokens: 40, completion_tokens: 10, total_tokens: 50, cost: 0.00012,
          prompt_tokens_details: { cached_tokens: 20 }, completion_tokens_details: { reasoning_tokens: 3 } },
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const provider = new OpenAiCompatibleProvider({ id: "openrouter-test", apiKey: "test-only",
      baseUrl: "https://openrouter.ai/api/v1", fetchImplementation: fetchMock,
      defaultHeaders: { "X-OpenRouter-Title": "Test App" },
      extraBody: { provider: { require_parameters: true, data_collection: "deny" } } });
    const response = await provider.execute<unknown, { ok: boolean }>({ task: "classification",
      modelVersion: "openai/gpt-5-mini", promptVersion: "test", evidenceIds: [], input: {},
      outputSchema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] } });
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.response_format).toMatchObject({ type: "json_schema", json_schema: { strict: true } });
    expect(body.provider).toEqual({ require_parameters: true, data_collection: "deny" });
    expect(response.usage).toMatchObject({ promptTokens: 40, completionTokens: 10,
      cachedPromptTokens: 20, reasoningTokens: 3, accountCashCostUsd: 0.00012 });
  });

});
