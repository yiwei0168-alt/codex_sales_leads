import { afterEach, describe, expect, it, vi } from "vitest";

import type { AiProvider, StructuredAiRequest, StructuredAiResponse } from "./contracts";
import { createLeadAiProvider, ResilientAiProvider } from "./resilient-ai";

class FakeAiProvider implements AiProvider {
  calls: StructuredAiRequest<unknown>[] = [];
  constructor(readonly id: string, private readonly behavior: "ok" | "fail" = "ok") {}
  async execute<TInput, TOutput>(request: StructuredAiRequest<TInput>): Promise<StructuredAiResponse<TOutput>> {
    this.calls.push(request as StructuredAiRequest<unknown>);
    if (this.behavior === "fail") throw new Error(`${this.id} unavailable`);
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { output: { ok: true } as TOutput, modelVersion: request.modelVersion,
      promptVersion: request.promptVersion, latencyMs: 5, warnings: [] };
  }
}

const request: StructuredAiRequest<{ company: string }> = {
  task: "lead-qualification", modelVersion: "deepseek-v4-flash", promptVersion: "test-v1",
  input: { company: "Example" }, evidenceIds: ["e1"], outputSchema: { type: "object" },
  dataClassification: "public",
};

describe("ResilientAiProvider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("records the requested model and actual primary provider", async () => {
    const primary = new FakeAiProvider("primary");
    const result = await new ResilientAiProvider(primary).execute<typeof request.input, { ok: boolean }>(request);
    expect(result).toMatchObject({ requestedModelVersion: "deepseek-v4-flash", actualProviderId: "primary",
      modelVersion: "deepseek-v4-flash" });
  });

  it("uses an approved same-tier fallback and preserves the output schema", async () => {
    const primary = new FakeAiProvider("primary", "fail");
    const fallback = new FakeAiProvider("fallback");
    const result = await new ResilientAiProvider(primary, { fallbacks: [{ provider: fallback,
      routineModel: "peer-flash", escalationModel: "peer-pro", approvedDataClassifications: ["public"] }] })
      .execute<typeof request.input, { ok: boolean }>(request);
    expect(fallback.calls[0]).toMatchObject({ modelVersion: "peer-flash", outputSchema: request.outputSchema });
    expect(result.actualProviderId).toBe("fallback");
    expect(result.warnings[0]).toContain("requested=deepseek-v4-flash");
  });

  it("uses the configured OpenRouter gateway as the default public DeepSeek route fallback", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-only");
    vi.stubEnv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "or-test", model: "deepseek/deepseek-v4-flash",
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ ok: true }) } }],
      usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12, cost: 0.0001 },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = createLeadAiProvider(new FakeAiProvider("deepseek", "fail"));
    const result = await provider.execute<typeof request.input, { ok: boolean }>(request);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({ model: "deepseek/deepseek-v4-flash",
      provider: { require_parameters: true, data_collection: "deny" },
      reasoning: { effort: "none" } });
    expect(result).toMatchObject({ actualProviderId: "openrouter-deepseek",
      requestedModelVersion: "deepseek-v4-flash", attempts: 2, retries: 0 });
    expect(result.warnings[0]).toContain("deepseek failed");
    expect(result.usage?.accountCashCostUsd).toBe(0.0001);
  });

  it("never sends private workspace content to a fallback without equivalent permission", async () => {
    const primary = new FakeAiProvider("primary", "fail");
    const fallback = new FakeAiProvider("fallback");
    const provider = new ResilientAiProvider(primary, { fallbacks: [{ provider: fallback,
      routineModel: "peer-flash", approvedDataClassifications: ["public"] }] });
    await expect(provider.execute({ ...request, dataClassification: "private-workspace" }))
      .rejects.toBeInstanceOf(AggregateError);
    expect(fallback.calls).toHaveLength(0);
  });

  it("deduplicates identical in-flight public requests", async () => {
    const primary = new FakeAiProvider("primary");
    const provider = new ResilientAiProvider(primary);
    const [left, right] = await Promise.all([provider.execute(request), provider.execute(request)]);
    expect(primary.calls).toHaveLength(1);
    expect(left.output).toEqual(right.output);
  });

  it("opens the primary circuit after repeated failures", async () => {
    const primary = new FakeAiProvider("primary", "fail");
    const provider = new ResilientAiProvider(primary, { circuitFailureThreshold: 2, circuitCooldownMs: 60_000 });
    await expect(provider.execute({ ...request, input: { company: "One" } })).rejects.toBeInstanceOf(AggregateError);
    await expect(provider.execute({ ...request, input: { company: "Two" } })).rejects.toBeInstanceOf(AggregateError);
    await expect(provider.execute({ ...request, input: { company: "Three" } })).rejects.toBeInstanceOf(AggregateError);
    expect(primary.calls).toHaveLength(2);
  });

  it("does not count a circuit-skipped primary as a provider attempt", async () => {
    const primary = new FakeAiProvider("primary", "fail");
    const fallback = new FakeAiProvider("fallback");
    const provider = new ResilientAiProvider(primary, { circuitFailureThreshold: 1, circuitCooldownMs: 60_000,
      fallbacks: [{ provider: fallback, routineModel: "peer-flash", approvedDataClassifications: ["public"] }] });
    await provider.execute({ ...request, input: { company: "One" } });
    const result = await provider.execute({ ...request, input: { company: "Two" } });
    expect(primary.calls).toHaveLength(1);
    expect(result.attempts).toBe(1);
  });
});
