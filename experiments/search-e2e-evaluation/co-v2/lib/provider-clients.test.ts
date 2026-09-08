import { afterEach, describe, expect, it, vi } from "vitest";

import { callBlindJudgeV2 } from "./provider-clients";

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
});
