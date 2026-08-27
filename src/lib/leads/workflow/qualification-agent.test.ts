import { describe, expect, it } from "vitest";

import type { AiProvider, StructuredAiRequest, StructuredAiResponse } from "@/providers/contracts";

import { LeadQualificationAgent } from "./qualification-agent";
import type { CorrectedLeadWorkflowCandidate, LeadMarketPlaybook } from "./types";

class FakeProvider implements AiProvider {
  readonly id = "fake";
  calls: StructuredAiRequest<unknown>[] = [];
  async execute<TInput, TOutput>(request: StructuredAiRequest<TInput>): Promise<StructuredAiResponse<TOutput>> {
    this.calls.push(request as StructuredAiRequest<unknown>);
    return {
      output: { assessments: [{
        candidateId: "lead-example", gates: { correctedIdentityUsable: true, companyExists: true,
          targetCountryPresence: true, networkingRelevant: true, independentProspect: true },
        accountTier: "Priority",
        supplyModel: "Distributor Supply", brandInvolvement: "Standard",
        dimensions: { productAndUseCaseFit: 40, cooperationPathAndBuyingInfluence: 26,
          evidenceAndEntityConfidence: 18,
          roleIdentificationQuality: 3, channelClassificationQuality: 1 },
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

const candidate: CorrectedLeadWorkflowCandidate = {
  candidateId: "lead-example", companyName: "Example", domain: "example.de", officialWebsiteUrl: "https://example.de/",
  queryRoles: ["VAR"], queryFamily: "resale", providerScore: 0.99,
  evidence: [{ id: "evidence-valid", url: "https://example.de", title: "Example", excerpt: "VAR selling routers and PoE switches; business customers can request a quote.",
    sourceType: "official-website", provider: "test", capturedAt: "2026-08-22" }], evidenceWarnings: [],
  correction: { originalCompanyName: "Example", originalDomain: "example.de", originalOfficialWebsiteUrl: "https://example.de/",
    resolvedRoles: ["VAR", "Reseller"], resolvedFamilies: ["resale"], identityChanged: false, routingChanged: false,
    supplementalEvidenceIds: [], reliedEvidenceIds: ["evidence-valid"], reasons: ["Official evidence supports resale."],
    confidence: 90, model: "test-corrector", promptVersion: "test", escalated: false, warnings: [] },
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
    expect(result.totalScore).toBe(88);
    expect(result.roles).toEqual(["VAR", "Reseller"]);
    expect(result.primaryRole).toBeNull();
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

  it("does not use a discovery summary to prove role or networking claims", async () => {
    const provider = new FakeProvider();
    const agent = new LeadQualificationAgent(provider, { batchSize: 5, concurrency: 1 });
    const summaryOnlyCandidate = {
      ...candidate,
      evidence: [
        { ...candidate.evidence[0], id: "evidence-discovery", sourceType: "discovery" as const,
          excerpt: "Search summary: VAR selling routers and PoE switches with business quotations." },
        { ...candidate.evidence[0], id: "evidence-valid", url: "https://example.de/about",
          sourceType: "official-website" as const,
          excerpt: "Example GmbH is a registered local company serving business customers in Germany." },
      ],
    };
    const [result] = await agent.evaluate([summaryOnlyCandidate], playbook, "DE", "Germany", "new-market");
    expect(result.gates.networkingRelevant).toBe(false);
    expect(result.eligible).toBe(false);
  });

  it("keeps a valuable lead eligible after the correction agent reroutes an originally mismatched lane", async () => {
    const provider = new FakeProvider();
    const agent = new LeadQualificationAgent(provider, { batchSize: 5, concurrency: 1 });
    const rerouted = { ...candidate, queryFamily: "distribution" as const,
      correction: { ...candidate.correction, resolvedFamilies: ["resale" as const], routingChanged: true } };
    const [result] = await agent.evaluate([rerouted], playbook, "DE", "Germany", "new-market");
    expect(result.eligible).toBe(true);
    expect(result.totalScore).toBe(88);
    expect(result.roles).toEqual(["VAR", "Reseller"]);
  });
});
