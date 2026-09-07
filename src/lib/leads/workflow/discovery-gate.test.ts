import { describe, expect, it, vi } from "vitest";

import type { AiProvider, StructuredAiRequest, StructuredAiResponse } from "@/providers/contracts";
import { LeadDiscoveryGate, sanitizeDiscoveryGateOutput } from "./discovery-gate";
import type { LeadWorkflowCandidate } from "./types";

function candidate(category = "si-msp"): LeadWorkflowCandidate {
  return { candidateId: "lead-example123", evidenceSnapshotRunId: "run-1", companyName: "Example GmbH",
    domain: "example.de", officialWebsiteUrl: "https://example.de", queryRoles: ["SI"], queryFamily: "services",
    providerScore: 0.5, evidence: [{ id: "discovery-1", url: "https://example.de/result", title: "Example",
      excerpt: "Network company", sourceType: "discovery", provider: "searchapi", capturedAt: "2026-09-01" }],
    evidenceWarnings: [], searchCategories: [category], suspectedRelationships: [], opportunitySignals: [] };
}

class FakeProvider implements AiProvider {
  readonly id = "fake";
  calls: StructuredAiRequest<unknown>[] = [];
  constructor(private readonly rejectCode?: "oem-supplier-not-customer" | "direct-brand-store") {}
  async execute<TInput, TOutput>(request: StructuredAiRequest<TInput>): Promise<StructuredAiResponse<TOutput>> {
    this.calls.push(request as StructuredAiRequest<unknown>);
    const input = request.input as { candidates: Array<{ candidateId: string }> };
    return { output: { candidates: input.candidates.map(({ candidateId }) => ({ candidateId,
      companyExistsSignal: "supported", networkProductRelevance: "supported",
      targetCategorySignal: this.rejectCode ? "not-supported" : "supported",
      productOrBrandControlSignal: "unknown", volumeProcurementSignal: "unknown", customizationSignal: "unknown",
      roleHints: ["SI"], hardRejectCodes: this.rejectCode ? [this.rejectCode] : [], opportunitySignals: [],
      suspectedRelationships: [], missingEvidence: [], reasonCodes: ["relevant-business"] })) } as TOutput,
    modelVersion: request.modelVersion, promptVersion: request.promptVersion, latencyMs: 1, warnings: [],
    actualProviderId: "deepseek", usage: { promptTokens: 10, completionTokens: 5, reasoningTokens: 0, totalTokens: 15 } };
  }
}

const homepage = "<html><title>Example GmbH</title><body>" + "Business Wi-Fi network integration and managed services. ".repeat(5) + "</body></html>";
const fetchMock = vi.fn().mockImplementation(async () => new Response(homepage, { status: 200,
  headers: { "content-type": "text/html" } }));

describe("lightweight discovery gate", () => {
  it("bounds overlong routine output without holding the whole batch", () => {
    const parsed = sanitizeDiscoveryGateOutput({ candidates: [{ candidateId: "lead-example123",
      companyExistsSignal: "supported", networkProductRelevance: "supported", targetCategorySignal: "supported",
      productOrBrandControlSignal: "unknown", volumeProcurementSignal: "unknown", customizationSignal: "unknown",
      roleHints: ["SI", "invented-role"], hardRejectCodes: [], opportunitySignals: [], suspectedRelationships: [],
      missingEvidence: [], reasonCodes: ["x".repeat(200)] }] }) as { candidates: Array<{ reasonCodes: string[]; roleHints: string[] }> };
    expect(parsed.candidates[0].reasonCodes[0]).toHaveLength(80);
    expect(parsed.candidates[0].roleHints).toEqual(["SI"]);
  });

  it("does not inherit a Pro model from the mutable global routine setting", async () => {
    vi.stubEnv("DEEPSEEK_MODEL", "deepseek-v4-pro");
    vi.stubEnv("DEEPSEEK_DISCOVERY_GATE_MODEL", "");
    const provider = new FakeProvider();
    await new LeadDiscoveryGate(provider, fetchMock).evaluate([candidate()]);
    expect(provider.calls[0].modelVersion).toBe("deepseek-v4-flash");
  });

  it("uses the routine Flash model and lets code compute pass", async () => {
    const provider = new FakeProvider();
    const result = await new LeadDiscoveryGate(provider, fetchMock, { model: "deepseek-v4-flash" }).evaluate([candidate()]);
    expect(result.candidates[0].discoveryGate?.status).toBe("pass");
    expect(provider.calls[0].modelVersion).toBe("deepseek-v4-flash");
    expect(JSON.stringify(provider.calls[0].outputSchema)).not.toContain("confidence");
    expect(result.candidates[0].evidence.some((item) => item.provider === "direct-http")).toBe(true);
    expect(JSON.stringify(provider.calls[0].input)).toContain("working online purchase flow");
    expect(JSON.stringify(provider.calls[0].input)).toContain("Do not call an SI a VAR unless resale is shown");
  });

  it("rejects the wrong OEM supplier direction without generating a path", async () => {
    const provider = new FakeProvider("oem-supplier-not-customer");
    const result = await new LeadDiscoveryGate(provider, fetchMock).evaluate([candidate("oem-odm-opportunity")]);
    expect(result.candidates).toHaveLength(0);
    expect(result.rejected[0].discoveryGate?.reasonCodes).toContain("oem-supplier-not-customer");
    expect(JSON.stringify(provider.calls[0].input)).not.toContain("selectedPathId");
  });

  it("supports a pre-evidence hard rejection for a direct brand store in a retail task", async () => {
    const result = await new LeadDiscoveryGate(new FakeProvider("direct-brand-store"), fetchMock)
      .evaluate([candidate("retail")]);
    expect(result.candidates).toHaveLength(0);
    expect(result.rejected[0].discoveryGate?.reasonCodes).toContain("direct-brand-store");
  });

  it("holds rather than rejects when the routine model fails", async () => {
    const provider: AiProvider = { id: "failed", execute: async () => { throw new Error("unavailable"); } };
    const result = await new LeadDiscoveryGate(provider, fetchMock).evaluate([candidate()]);
    expect(result.candidates[0].discoveryGate?.status).toBe("hold");
    expect(result.warnings[0]).toContain("held");
  });
});
