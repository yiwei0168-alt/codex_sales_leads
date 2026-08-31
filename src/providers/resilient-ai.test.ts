import { describe, expect, it, vi } from "vitest";

import type { AiProvider, StructuredAiRequest, StructuredAiResponse } from "./contracts";
import { ResilientAiProvider } from "./resilient-ai";

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
});
