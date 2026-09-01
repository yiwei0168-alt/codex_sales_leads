import { describe, expect, it, vi } from "vitest";

import type { AiProvider, StructuredAiRequest, StructuredAiResponse } from "@/providers/contracts";
import { LeadDiscoveryGate } from "./discovery-gate";
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
  constructor(private readonly rejectCode?: "oem-supplier-not-customer") {}
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
  it("uses the routine Flash model and lets code compute pass", async () => {
    const provider = new FakeProvider();
    const result = await new LeadDiscoveryGate(provider, fetchMock, { model: "deepseek-v4-flash" }).evaluate([candidate()]);
    expect(result.candidates[0].discoveryGate?.status).toBe("pass");
    expect(provider.calls[0].modelVersion).toBe("deepseek-v4-flash");
    expect(JSON.stringify(provider.calls[0].outputSchema)).not.toContain("confidence");
    expect(result.candidates[0].evidence.some((item) => item.provider === "direct-http")).toBe(true);
  });

  it("rejects the wrong OEM supplier direction without generating a path", async () => {
    const provider = new FakeProvider("oem-supplier-not-customer");
    const result = await new LeadDiscoveryGate(provider, fetchMock).evaluate([candidate("oem-odm-opportunity")]);
    expect(result.candidates).toHaveLength(0);
    expect(result.rejected[0].discoveryGate?.reasonCodes).toContain("oem-supplier-not-customer");
    expect(JSON.stringify(provider.calls[0].input)).not.toContain("selectedPathId");
  });

  it("holds rather than rejects when the routine model fails", async () => {
    const provider: AiProvider = { id: "failed", execute: async () => { throw new Error("unavailable"); } };
    const result = await new LeadDiscoveryGate(provider, fetchMock).evaluate([candidate()]);
    expect(result.candidates[0].discoveryGate?.status).toBe("hold");
    expect(result.warnings[0]).toContain("held");
  });
});
