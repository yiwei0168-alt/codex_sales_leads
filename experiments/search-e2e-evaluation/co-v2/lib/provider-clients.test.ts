import { afterEach, describe, expect, it, vi } from "vitest";

import { callBlindArbitratorV2, callBlindJudgeV2, normalizeBlindJudgeV2Output } from "./provider-clients";

describe("Colombia blind-review OpenRouter request", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("does not combine temperature with high reasoning and strict structured output", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    let requestBody: Record<string, unknown> | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ error: { message: "test stop" } }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }));

    const result = await callBlindJudgeV2({ packetId: "test-packet" }, "openai/gpt-5.6-sol", 128);

    expect(result.requestFailureKind).toBe("http");
    expect(requestBody).toMatchObject({
      model: "openai/gpt-5.6-sol",
      max_tokens: 128,
      reasoning: { effort: "high" },
      provider: { require_parameters: true, data_collection: "deny" },
      response_format: { type: "json_schema" },
    });
    expect(requestBody).not.toHaveProperty("temperature");
  });

  it("truncates only schema-bounded narrative fields and arrays", () => {
    const long = "x".repeat(600);
    const input = {
      packetId: "blind-v2-test-packet",
      supportedRoles: Array.from({ length: 10 }, (_, index) => `${index}-${long}`),
      primaryRole: long,
      dimensions: { productAndUseCaseFit: 41, channelAndBuyingInfluence: 12,
        sameRoleScaleAndCoverage: 9, executionAndEnablement: 8, opportunityAndRisk: 7 },
      totalScore: 77,
      dimensionReasons: Array.from({ length: 6 }, (_, index) => ({
        dimension: ["productAndUseCaseFit", "channelAndBuyingInfluence", "sameRoleScaleAndCoverage",
          "executionAndEnablement", "opportunityAndRisk", "extra"][index],
        reason: long,
        citations: Array.from({ length: 13 }, () => ({ evidenceId: long, claim: long, support: "direct" })),
      })),
      unsupportedOrContradictoryClaims: Array.from({ length: 13 }, () => long),
    };

    const output = normalizeBlindJudgeV2Output(input) as typeof input;

    expect(output.totalScore).toBe(77);
    expect(output.dimensions).toEqual(input.dimensions);
    expect(output.supportedRoles).toHaveLength(8);
    expect(output.supportedRoles.every((item) => item.length <= 80)).toBe(true);
    expect(output.primaryRole).toHaveLength(80);
    expect(output.dimensionReasons).toHaveLength(5);
    expect(output.dimensionReasons.every((item) => item.reason.length === 500
      && item.citations.length === 12
      && item.citations.every((citation) => citation.evidenceId.length === 100
        && citation.claim.length === 500))).toBe(true);
    expect(output.unsupportedOrContradictoryClaims).toHaveLength(12);
    expect(output.unsupportedOrContradictoryClaims.every((item) => item.length === 500)).toBe(true);
  });

  it("routes a failed direct DeepSeek arbitrator to the same tier through OpenRouter", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-deepseek-key");
    vi.stubEnv("DEEPSEEK_BASE_URL", "https://api.deepseek.com");
    vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key");
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return new Response(JSON.stringify({ error: { message: "test stop" } }), {
        status: url.includes("openrouter.ai") ? 404 : 503,
        headers: { "content-type": "application/json" },
      });
    }));

    const result = await callBlindArbitratorV2({ packetId: "test-packet" }, "deepseek-v4-pro", 128);

    expect(requests.filter((item) => item.url.includes("api.deepseek.com"))).toHaveLength(2);
    const openRouter = requests.find((item) => item.url.includes("openrouter.ai"));
    expect(openRouter?.body).toMatchObject({ model: "deepseek/deepseek-v4-pro",
      reasoning: { effort: "high" }, response_format: { type: "json_schema" } });
    expect(result.requestedModel).toBe("deepseek-v4-pro");
    expect(result.actualModel).toBe("deepseek/deepseek-v4-pro");
    expect(result.attempts).toBe(3);
  });

  it("marks the bounded same-model schema-repair request and expands only its output budget", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key");
    let requestBody: Record<string, unknown> | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ error: { message: "test stop" } }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }));

    await callBlindArbitratorV2({ packetId: "test-packet" }, "deepseek/deepseek-v4-pro", 8_192,
      { schemaRepair: true });

    expect(requestBody).toMatchObject({ model: "deepseek/deepseek-v4-pro", max_tokens: 8_192 });
    const messages = requestBody?.messages as Array<{ role: string; content: string }>;
    expect(messages[0]?.content).toContain("single schema-repair retry");
  });

  it("normalizes a response-body timeout and conservatively meters both bounded attempts", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key");
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200,
      text: async () => { throw new DOMException("timed out", "TimeoutError"); } }) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await callBlindJudgeV2({ packetId: "test-packet" }, "openai/gpt-5.6-sol", 128);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.requestFailureKind).toBe("timeout");
    expect(result.attempts).toBe(2);
    expect(result.retries).toBe(1);
    expect(result.usage.outputTokens).toBe(256);
    expect(result.usage.inputTokens).toBeGreaterThan(0);
  });
});
