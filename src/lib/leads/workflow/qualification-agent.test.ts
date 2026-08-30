import { describe, expect, it } from "vitest";

import type { AiProvider, StructuredAiRequest, StructuredAiResponse } from "@/providers/contracts";
import { leadEvidenceContentHash } from "@/lib/leads/evidence-snapshot";

import { LeadQualificationAgent } from "./qualification-agent";
import type { CorrectedLeadWorkflowCandidate, LeadMarketPlaybook } from "./types";

class FakeProvider implements AiProvider {
  readonly id = "fake";
  calls: StructuredAiRequest<unknown>[] = [];
  async execute<TInput, TOutput>(request: StructuredAiRequest<TInput>): Promise<StructuredAiResponse<TOutput>> {
    this.calls.push(request as StructuredAiRequest<unknown>);
    return {
      output: { assessments: [{
        candidateId: "lead-example", gates: { correctedIdentityUsable: "supported", companyExists: "supported",
          targetCountryPresence: "supported", networkingRelevant: "supported", independentProspect: "supported" },
        eligibilityStatus: "eligible", companyScaleClass: "Regional", researchDepth: "standard",
        supplyModel: "Distributor Supply", brandInvolvement: "Standard",
        cooperationPaths: [{ pathId: "path-var", pathType: "Direct Channel Supply", candidateRole: "VAR",
          pathNodes: [{ actor: "Cudy", role: "Brand" }, { actor: "Candidate", role: "VAR" },
            { actor: "Customer", role: "SMB customer" }], supplyFlow: "Cudy supplies the VAR.",
          decisionRole: "The VAR selects products for SMB customers.", fitScore: 86, confidence: 86, rank: 1,
          evidenceIds: ["evidence-valid"], prerequisites: [], valuePropositions: ["SMB portfolio"],
          risks: [], unknowns: [], targetTitles: ["Category Manager"],
          recommendedCta: "Validate the relevant product track.", allowedInExternalEmail: true }],
        selectedPathId: "path-var",
        dimensions: { productFamilyMatch: 23, customerAndScenarioOverlap: 14,
          positioningCompatibility: 9, cooperationPathAndBuyingInfluence: 13,
          scaleAndChannelCoverage: 13, executionAndEnablement: 8, opportunityAndRisk: 8 },
        dimensionRationales: [
          { dimension: "productFamilyMatch", score: 23, reason: "Relevant routers and switches are sold.",
            findingIds: ["finding-fit"], evidenceIds: ["evidence-valid"], confidence: 90 },
          { dimension: "customerAndScenarioOverlap", score: 14, reason: "The candidate serves business customers.",
            findingIds: ["finding-path"], evidenceIds: ["evidence-valid"], confidence: 85 },
          { dimension: "positioningCompatibility", score: 9, reason: "The SMB portfolio is compatible.",
            findingIds: ["finding-fit"], evidenceIds: ["evidence-valid"], confidence: 85 },
          { dimension: "cooperationPathAndBuyingInfluence", score: 13, reason: "Business customers can request a quote.",
            findingIds: ["finding-path"], evidenceIds: ["evidence-valid"], confidence: 85 },
          { dimension: "scaleAndChannelCoverage", score: 13, reason: "The relevant regional business is evidenced.",
            findingIds: ["finding-identity"], evidenceIds: ["evidence-valid"], confidence: 90 },
          { dimension: "executionAndEnablement", score: 8, reason: "VAR and reseller execution is supported.",
            findingIds: ["finding-role"], evidenceIds: ["evidence-valid"], confidence: 90 },
          { dimension: "opportunityAndRisk", score: 8, reason: "The current opportunity has manageable risk.",
            findingIds: ["finding-role"], evidenceIds: ["evidence-valid"], confidence: 90 },
        ],
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
  candidateId: "lead-example", evidenceSnapshotRunId: "run-example",
  companyName: "Example", domain: "example.de", officialWebsiteUrl: "https://example.de/",
  queryRoles: ["VAR"], queryFamily: "resale", providerScore: 0.99,
  evidence: [{ id: "evidence-valid", url: "https://example.de", title: "Example", excerpt: "VAR selling routers and PoE switches; business customers can request a quote.",
    sourceType: "official-website", provider: "test", capturedAt: "2026-08-30T00:00:00Z",
    evidenceRunId: "run-example", contentHash: leadEvidenceContentHash("VAR selling routers and PoE switches; business customers can request a quote."),
    freshnessStatus: "fresh" }], evidenceWarnings: [],
  correction: { originalCompanyName: "Example", originalDomain: "example.de", originalOfficialWebsiteUrl: "https://example.de/",
    resolvedRoles: ["VAR", "Reseller"], resolvedFamilies: ["resale"], primaryRole: "VAR", primaryFamily: "resale",
    primaryChannelReason: "Fixture primary route.", usedSmallLongTailChannelException: false,
    identityChanged: false, routingChanged: false,
    supplementalEvidenceIds: [], reliedEvidenceIds: ["evidence-valid"], findings: [
      { findingId: "finding-identity", kind: "identity", statement: "Example owns example.de.", status: "supported",
        roles: [], evidenceIds: ["evidence-valid"], sourceTypes: ["official-website"], confidence: 90, notes: [] },
      { findingId: "finding-fit", kind: "product-family", statement: "Example sells routers and PoE switches.", status: "supported",
        roles: [], evidenceIds: ["evidence-valid"], sourceTypes: ["official-website"], confidence: 90, notes: [] },
      { findingId: "finding-path", kind: "cooperation-path", statement: "Business customers can request a quote.", status: "supported",
        roles: [], evidenceIds: ["evidence-valid"], sourceTypes: ["official-website"], confidence: 85, notes: [] },
      { findingId: "finding-role", kind: "role", statement: "Example has VAR and reseller activity.", status: "supported",
        roles: ["VAR", "Reseller"], evidenceIds: ["evidence-valid"], sourceTypes: ["official-website"], confidence: 90, notes: [] },
    ], reasons: ["Official evidence supports resale."],
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
    expect(result.primaryRole).toBe("VAR");
    expect(result.evidenceIds).toEqual(["evidence-valid"]);
    expect(result.warnings).toContain("Model returned unsupported evidence IDs; they were removed.");
    expect(provider.calls).toHaveLength(2);
    expect(JSON.stringify(provider.calls[0].input)).not.toContain("providerScore");
  });

  it("fails the networking gate when the model relies only on generic IT wording", async () => {
    const provider = new FakeProvider();
    const agent = new LeadQualificationAgent(provider, { batchSize: 5, concurrency: 1 });
    const genericCandidate = {
      ...candidate,
      evidence: [{ ...candidate.evidence[0], excerpt: "Cloud connectivity, managed IT and structured cabling",
        contentHash: leadEvidenceContentHash("Cloud connectivity, managed IT and structured cabling") }],
    };
    const [result] = await agent.evaluate([genericCandidate], playbook, "DE", "Germany", "new-market");
    expect(result.gates.networkingRelevant).toBe("conflicting");
    expect(result.eligible).toBe(false);
    expect(result.totalScore).toBe(88);
    expect(result.warnings.join(" ")).toContain("conflicts");
  });

  it("does not use a discovery summary to prove role or networking claims", async () => {
    const provider = new FakeProvider();
    const agent = new LeadQualificationAgent(provider, { batchSize: 5, concurrency: 1 });
    const summaryOnlyCandidate = {
      ...candidate,
      evidence: [
        { ...candidate.evidence[0], id: "evidence-discovery", sourceType: "discovery" as const,
          excerpt: "Search summary: VAR selling routers and PoE switches with business quotations.",
          contentHash: leadEvidenceContentHash("Search summary: VAR selling routers and PoE switches with business quotations.") },
        { ...candidate.evidence[0], id: "evidence-valid", url: "https://example.de/about",
          sourceType: "official-website" as const,
          excerpt: "Example GmbH is a registered local company serving business customers in Germany.",
          contentHash: leadEvidenceContentHash("Example GmbH is a registered local company serving business customers in Germany.") },
      ],
    };
    const [result] = await agent.evaluate([summaryOnlyCandidate], playbook, "DE", "Germany", "new-market");
    expect(result.gates.networkingRelevant).toBe("conflicting");
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

  it("excludes strong prior-run evidence until it is reacquired or revalidated into the current snapshot", async () => {
    const provider = new FakeProvider();
    const agent = new LeadQualificationAgent(provider, { batchSize: 5, concurrency: 1 });
    const priorRunCandidate = { ...candidate, evidence: [{ ...candidate.evidence[0],
      evidenceRunId: "run-v1-7", priorRunId: "run-v1-7", freshnessStatus: "stale" as const }] };
    const [result] = await agent.evaluate([priorRunCandidate], playbook, "DE", "Germany", "new-market");
    expect(JSON.stringify(provider.calls.map((call) => call.input))).not.toContain("evidence-valid");
    expect(result.evidenceIds).toEqual([]);
    expect(result.gates.networkingRelevant).not.toBe("supported");
    expect(result.eligibilityStatus).not.toBe("eligible");
  });

  it("splits routine batches when the serialized input exceeds the prompt budget", async () => {
    const provider = new FakeProvider();
    const largeCandidate = { ...candidate, evidence: [{ ...candidate.evidence[0],
      excerpt: `${candidate.evidence[0].excerpt} ${"routing portfolio customer scenario ".repeat(350)}`,
      contentHash: leadEvidenceContentHash(`${candidate.evidence[0].excerpt} ${"routing portfolio customer scenario ".repeat(350)}`),
    }] };
    const agent = new LeadQualificationAgent(provider, {
      batchSize: 5,
      maxBatchInputCharacters: 10_000,
      concurrency: 1,
    });
    await agent.evaluate([largeCandidate, largeCandidate], playbook, "DE", "Germany", "new-market");
    const routineCalls = provider.calls.filter((call) => call.modelVersion === "deepseek-v4-flash");
    expect(routineCalls).toHaveLength(2);
    expect(routineCalls.every((call) => (call.input as { candidates: unknown[] }).candidates.length === 1)).toBe(true);
  });
});
