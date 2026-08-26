import { describe, expect, it } from "vitest";

import type { AiProvider, StructuredAiRequest, StructuredAiResponse } from "@/providers/contracts";

import { LeadQualificationAgent } from "./qualification-agent";
import type { LeadMarketPlaybook, LeadWorkflowCandidate } from "./types";

class FakeProvider implements AiProvider {
  readonly id = "fake";
  calls: StructuredAiRequest<unknown>[] = [];
  async execute<TInput, TOutput>(request: StructuredAiRequest<TInput>): Promise<StructuredAiResponse<TOutput>> {
    this.calls.push(request as StructuredAiRequest<unknown>);
    return {
      output: { assessments: [{
        candidateId: "lead-example", gates: { submittedIdentityUsable: true, companyExists: true,
          targetCountryPresence: true, networkingRelevant: true, relevantChannel: true,
          sufficientEvidence: true, independentProspect: true },
        roles: ["VAR", "Reseller"], primaryRole: "VAR", accountTier: "Priority",
        supplyModel: "Distributor Supply", brandInvolvement: "Standard",
        dimensions: { channelRoleAndCustomerAccess: 27.8, productAndUseCaseFit: 21.2, targetMarketCoverage: 18,
          partnershipExecutionCapability: 12, strategicComplementarity: 8 },
        confidence: 88, summary: "Evidence-grounded multi-role channel candidate.", reasons: ["Strong customer access"],
        risks: [], unknowns: ["Purchasing volume"], evidenceIds: ["evidence-valid", "invented-id"],
        needsEscalation: false, warnings: [],
      }] } as TOutput,
      modelVersion: request.modelVersion,
      promptVersion: request.promptVersion,
      latencyMs: 10,
      warnings: [],
    };
  }
}

const candidate: LeadWorkflowCandidate = {
  candidateId: "lead-example", companyName: "Example", domain: "example.de", officialWebsiteUrl: "https://example.de/",
  queryRoles: ["VAR"], queryFamily: "resale", providerScore: 0.99,
  evidence: [{ id: "evidence-valid", url: "https://example.de", title: "Example", excerpt: "VAR selling routers and PoE switches",
    sourceType: "official-website", provider: "test", capturedAt: "2026-08-22" }], evidenceWarnings: [],
};
const playbook: LeadMarketPlaybook = {
  marketHypothesis: "test", productAngles: ["SMB"], preferredCompanyTraits: ["VAR"], exclusions: [],
  rolePriorities: [], searchQueries: [], ragCitationIds: ["kb-1"], generatedBy: "langchain-model", warnings: [],
};

describe("LeadQualificationAgent", () => {
  it("recomputes the score deterministically and removes invented evidence IDs", async () => {
    const provider = new FakeProvider();
    const agent = new LeadQualificationAgent(provider, { batchSize: 5, concurrency: 1 });
    const [result] = await agent.evaluate([candidate], playbook, "DE", "Germany", "new-market");
    expect(result.totalScore).toBe(87);
    expect(result.roles).toEqual(["VAR", "Reseller"]);
    expect(result.evidenceIds).toEqual(["evidence-valid"]);
    expect(result.warnings).toContain("Model returned unsupported evidence IDs; they were removed.");
    expect(provider.calls).toHaveLength(1);
    expect(JSON.stringify(provider.calls[0].input)).not.toContain("providerScore");
  });

  it("fails the networking gate when the model relies only on generic IT wording", async () => {
    const provider = new FakeProvider();
    const agent = new LeadQualificationAgent(provider, { batchSize: 5, concurrency: 1 });
    const genericCandidate = {
      ...candidate,
      evidence: [{ ...candidate.evidence[0], excerpt: "Cloud connectivity, managed IT and structured cabling" }],
    };
    const [result] = await agent.evaluate([genericCandidate], playbook, "DE", "Germany", "new-market");
    expect(result.gates.networkingRelevant).toBe(false);
    expect(result.eligible).toBe(false);
    expect(result.totalScore).toBe(0);
    expect(result.warnings.join(" ")).toContain("not-demonstrated");
  });
});
