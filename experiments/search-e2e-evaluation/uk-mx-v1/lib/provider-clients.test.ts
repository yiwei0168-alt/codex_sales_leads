import { afterEach, describe, expect, it, vi } from "vitest";

import { callBlindArbitratorV2, callBlindJudgeV2, callClaudeBlindJudge, callGeminiControl, geminiSearchQueries,
  sanitizeGeminiJsonSchema } from "./provider-clients";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_BASE_URL;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_BASE_URL;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_BASE_URL;
  delete process.env.DEEPSEEK_TRANSPORT;
});

describe("formal experiment Gemini adapter", () => {
  it("removes unsupported annotations while preserving the supported schema contract", () => {
    expect(sanitizeGeminiJsonSchema({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "example", type: "object", additionalProperties: false, required: ["url"],
      properties: { url: { type: "string", format: "uri", minLength: 1, maxLength: 2_000 },
        score: { type: "integer", minimum: 0, maximum: 100 } },
    })).toEqual({ type: "object", required: ["url"],
      properties: { url: { type: "string" }, score: { type: "integer" } } });
  });

  it("uses the larger of observable search steps and official grounding usage", () => {
    expect(geminiSearchQueries({ steps: [{ type: "google_search_call", arguments: { queries: ["one"] } }],
      usage: { grounding_tool_count: [{ type: "google_search", count: 3 }] } })).toBe(3);
    expect(geminiSearchQueries({ steps: [
      { type: "google_search_call", arguments: { queries: ["one", "two"] } },
      { type: "google_search_call", arguments: { queries: ["two", "three"] } },
    ] })).toBe(3);
  });

  it("sends native response_format and accounts official Interactions usage fields", async () => {
    process.env.GEMINI_API_KEY = "test-only";
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
      void _url;
      void _init;
      return new Response(JSON.stringify({ model: "gemini-3.6-flash", steps: [
      { type: "google_search_call", arguments: { queries: ["one"] } },
      { type: "model_output", content: [{ type: "text", text: JSON.stringify({ market: "Canada",
        category: "distribution", candidates: [{ rank: 1, companyName: "Example Distribution",
          officialWebsite: "https://example.com/", marketSignal: "Canada operation",
          roleSignal: "Supplies resellers", relevanceSignal: "Networking portfolio",
          evidenceUrls: ["https://example.com/about"] }] }) }] },
    ], usage: { total_input_tokens: 100, total_cached_tokens: 20, total_output_tokens: 10,
      total_thought_tokens: 5, grounding_tool_count: [{ type: "google_search", count: 3 }] } }),
    { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const call = await callGeminiControl({ sequence: 1, cellId: "CA-test", countryCode: "GB",
      countryName: "Canada", primaryLanguage: "en", supplementaryLanguages: [], categoryId: "distribution",
      categoryLabel: "Distributor/VAD", categoryDefinition: "test", roles: ["Distributor", "VAD"],
      armStartOrder: ["gemini-native", "product-e2e"] }, { prompt: "test" });
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)) as Record<string, unknown>;
    expect(body.response_format).toMatchObject({ type: "text", mime_type: "application/json",
      schema: { type: "object" } });
    expect(JSON.stringify(body.response_format)).not.toContain("$schema");
    expect(call.output?.candidates).toHaveLength(1);
    expect(call.usage).toMatchObject({ inputTokens: 100, cachedInputTokens: 20, outputTokens: 15,
      reasoningTokens: 5, groundingQueries: 3 });
  });

  it("returns a non-retryable HTTP failure with auditable attempt metadata", async () => {
    process.env.GEMINI_API_KEY = "test-only";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "invalid request" }), { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const call = await callGeminiControl({ sequence: 1, cellId: "CA-test", countryCode: "GB",
      countryName: "Canada", primaryLanguage: "en", supplementaryLanguages: [], categoryId: "distribution",
      categoryLabel: "Distributor/VAD", categoryDefinition: "test", roles: ["Distributor", "VAD"],
      armStartOrder: ["gemini-native", "product-e2e"] }, { prompt: "test" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(call).toMatchObject({ output: null, attempts: 1, retries: 0,
      requestFailureKind: "http" });
    expect(call.requestError).toContain("HTTP 400");
  });

  it("returns exhausted Claude transport retries instead of dropping their telemetry", async () => {
    process.env.OPENROUTER_API_KEY = "test-only";
    const fetchMock = vi.fn(async () => { throw new TypeError("fetch failed"); });
    vi.stubGlobal("fetch", fetchMock);
    const call = await callClaudeBlindJudge({ packetId: "test" }, "anthropic/claude-opus-5", 64);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(call).toMatchObject({ output: null, attempts: 2, retries: 1,
      requestFailureKind: "transport" });
    expect(call.requestError).toBe("fetch failed");
  });

  it("uses strict OpenRouter structured output and preserves billed cost", async () => {
    process.env.OPENROUTER_API_KEY = "test-only";
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      void url;
      void init;
      return new Response(JSON.stringify({
      model: "anthropic/claude-opus-5", choices: [{ message: { content: JSON.stringify({
        primaryRole: "Retailer", requestedCategoryMatch: true, isRealOperatingCompany: true,
        operatesInTargetMarket: true, dimensions: { productFamilyMatch: 20, customerAndScenarioOverlap: 15,
          positioningCompatibility: 8, cooperationPathAndBuyingInfluence: 10, scaleAndChannelCoverage: 8,
          executionAndEnablement: 7, opportunityAndRisk: 7 }, totalScore: 75,
        dimensionReasons: [], risks: [], unknowns: [], citationAlignment: true,
      }) } }], usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0.00175 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const call = await callClaudeBlindJudge({ packetId: "test" }, "claude-opus-5", 64);
    const [url, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String((init as RequestInit).body));
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(body.model).toBe("anthropic/claude-opus-5");
    expect(body.provider).toEqual({ require_parameters: true, data_collection: "deny" });
    expect(body.response_format).toMatchObject({ type: "json_schema",
      json_schema: { strict: true } });
    expect(call.accountCashCostUsd).toBe(0.00175);
  });

  it("uses the v2 rubric and parses claim-level citation support", async () => {
    process.env.OPENROUTER_API_KEY = "test-only";
    const dimensionNames = ["productAndUseCaseFit", "channelAndBuyingInfluence", "sameRoleScaleAndCoverage",
      "executionAndEnablement", "opportunityAndRisk"];
    let capturedInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      void url;
      capturedInit = init;
      return new Response(JSON.stringify({
      model: "openai/gpt-5.6-sol", choices: [{ message: { content: JSON.stringify({
        packetId: "blind-v2-test-packet", externalSearchUsed: false, externalKnowledgeUsed: false,
        isRealOperatingCompany: true, operatesInTargetMarket: true,
        supportedRoles: ["Distributor"], primaryRole: "Distributor", dimensions: {
          productAndUseCaseFit: 35, channelAndBuyingInfluence: 10, sameRoleScaleAndCoverage: 9,
          executionAndEnablement: 8, opportunityAndRisk: 7 }, totalScore: 69, eligibility: "eligible",
        dimensionReasons: dimensionNames.map((dimension) => ({ dimension, reason: "Supported",
          citations: [{ evidenceId: "evidence-1", claim: "Supplies resellers", support: "direct" }] })),
        unsupportedOrContradictoryClaims: [],
      }) } }], usage: { prompt_tokens: 200, completion_tokens: 100, cost: 0.004 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const call = await callBlindJudgeV2({ packetId: "blind-v2-test-packet" }, "openai/gpt-5.6-sol", 256);
    const body = JSON.parse(String(capturedInit?.body));
    expect(body.response_format.json_schema.name).toBe("blind_judge_output_v2");
    expect(body.messages[0].content).toContain("Independent blind-judge rubric v2");
    expect(call.output?.dimensionReasons[0].citations[0]).toMatchObject({ evidenceId: "evidence-1",
      support: "direct" });
    expect(call.accountCashCostUsd).toBe(0.004);
  });

  it("keeps the v2 arbitrator on the dedicated DeepSeek adapter", async () => {
    process.env.DEEPSEEK_API_KEY = "test-only";
    process.env.DEEPSEEK_BASE_URL = "https://deepseek.test";
    process.env.DEEPSEEK_TRANSPORT = "anthropic";
    const dimensionNames = ["productAndUseCaseFit", "channelAndBuyingInfluence", "sameRoleScaleAndCoverage",
      "executionAndEnablement", "opportunityAndRisk"];
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      void url;
      return new Response(JSON.stringify({
      model: "deepseek-v4-pro", content: [{ type: "text", text: JSON.stringify({
        packetId: "blind-v2-test-packet", externalSearchUsed: false, externalKnowledgeUsed: false,
        isRealOperatingCompany: true, operatesInTargetMarket: true, supportedRoles: ["Distributor"],
        primaryRole: "Distributor", dimensions: { productAndUseCaseFit: 35, channelAndBuyingInfluence: 10,
          sameRoleScaleAndCoverage: 9, executionAndEnablement: 8, opportunityAndRisk: 7 }, totalScore: 69,
        eligibility: "eligible", dimensionReasons: dimensionNames.map((dimension) => ({ dimension,
          reason: "Supported", citations: [{ evidenceId: "evidence-1", claim: "Supplies resellers",
            support: "direct" }] })), unsupportedOrContradictoryClaims: [],
      }) }], usage: { input_tokens: 200, output_tokens: 100 }, stop_reason: "end_turn",
    }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const call = await callBlindArbitratorV2({ packetId: "blind-v2-test-packet" }, "deepseek-v4-pro");
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://deepseek.test/anthropic/v1/messages");
    expect(call.output?.primaryRole).toBe("Distributor");
    expect(call).toMatchObject({ actualModel: "deepseek-v4-pro", attempts: 1, retries: 0 });
  });
});
