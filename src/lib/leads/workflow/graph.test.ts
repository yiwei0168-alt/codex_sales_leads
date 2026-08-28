import { describe, expect, it, vi } from "vitest";

import type { LeadSearchPlan } from "@/lib/assistant/types";

import { buildLeadWorkflowGraph, type LeadWorkflowDependencies } from "./graph";
import type {
  CorrectedLeadWorkflowCandidate,
  LeadCandidateAssessment,
  LeadMarketPlaybook,
  LeadRagCitation,
  LeadWorkflowCandidate,
  LeadWorkflowResult,
} from "./types";

const plan: LeadSearchPlan = {
  countryCode: "DE",
  countryName: "德国",
  objective: "new-market",
  roles: ["Distributor", "VAD", "VAR", "Dealer", "Reseller", "Retailer", "E-tailer", "SI", "Installer", "MSP", "ISP"],
  targetCount: 20,
  queryLanguage: "zh-CN",
  userRequest: "搜索德国有开发价值的渠道公司",
};

const ragContext: LeadRagCitation[] = (["product", "company", "industry"] as const).map((collection, index) => ({
  chunkId: `00000000-0000-4000-8000-00000000000${index + 1}`,
  collection,
  title: `${collection} evidence`,
  content: `${collection} context`,
  score: 0.8,
  retrievalSignals: collection === "product" ? ["vector", "structured"] : ["vector"],
  corroborated: collection === "product",
  structuredFacts: collection === "product"
    ? [{ model: "WR3000", factKey: "category", factValue: "Wi-Fi Router", status: "verified" }] : [],
}));

const playbook: LeadMarketPlaybook = {
  marketHypothesis: "Test market hypothesis for multi-node development.",
  productAngles: ["SMB networking"],
  preferredCompanyTraits: ["networking customer access"],
  exclusions: ["directories"],
  rolePriorities: [{ family: "distribution", roles: ["Distributor", "VAD"], weight: 1, reason: "Supply path" }],
  searchQueries: [{ family: "distribution", roles: ["Distributor", "VAD"], query: "networking distributor Germany", priority: 1 }],
  ragCitationIds: ragContext.map((item) => item.chunkId),
  generatedBy: "langchain-model",
  model: "test-planner",
  warnings: [],
};

const candidate: LeadWorkflowCandidate = {
  candidateId: "lead-example",
  companyName: "Example GmbH",
  domain: "example.de",
  officialWebsiteUrl: "https://example.de/",
  queryRoles: ["Distributor"],
  queryFamily: "distribution",
  providerScore: 0.8,
  evidence: [{ id: "evidence-example", url: "https://example.de/", title: "Example",
    excerpt: "Networking distributor in Germany", sourceType: "official-website", provider: "test", capturedAt: "2026-08-22T00:00:00Z" }],
  evidenceWarnings: [],
};

const correctedCandidate: CorrectedLeadWorkflowCandidate = {
  ...candidate,
  correction: { originalCompanyName: candidate.companyName, originalDomain: candidate.domain,
    originalOfficialWebsiteUrl: candidate.officialWebsiteUrl, resolvedRoles: ["Distributor"],
    resolvedFamilies: ["distribution"], identityChanged: false, routingChanged: false,
    supplementalEvidenceIds: [], reliedEvidenceIds: ["evidence-example"], findings: [{
      findingId: "finding-distribution", kind: "role", statement: "Example is a networking distributor.",
      status: "supported", roles: ["Distributor"], evidenceIds: ["evidence-example"],
      sourceTypes: ["official-website"], confidence: 85, notes: [],
    }], reasons: ["Official evidence supports distribution."],
    confidence: 85, model: "test-corrector", promptVersion: "test", escalated: false, warnings: [] },
};

const assessment: LeadCandidateAssessment = {
  candidateId: candidate.candidateId,
  eligible: true,
  gates: { correctedIdentityUsable: "supported", companyExists: "supported", targetCountryPresence: "supported",
    networkingRelevant: "supported", independentProspect: "supported" },
  roles: ["Distributor"], primaryRole: "Distributor", accountTier: "Priority",
  supplyModel: "Distributor Supply", brandInvolvement: "Standard",
  dimensions: { productAndUseCaseFit: 35, cooperationPathAndBuyingInfluence: 24,
    evidenceAndEntityConfidence: 16,
    roleIdentificationQuality: 3, channelClassificationQuality: 1 },
  dimensionRationales: [],
  totalScore: 79, confidence: 85, summary: "Qualified test candidate", reasons: ["Evidence supports fit"],
  risks: [], unknowns: [], evidenceIds: ["evidence-example"], model: "test-scorer",
  promptVersion: "test", escalated: false, scoringStatus: "completed", warnings: [],
};

function dependencies(events: string[], context = ragContext): LeadWorkflowDependencies {
  const result: LeadWorkflowResult = { runId: "run-1", countryCode: "DE", countryName: "德国", requested: 20,
    discovered: 1, assessed: 1, qualified: 1, accepted: 1, creditsUsed: 3, ragCitationCount: context.length,
    graphThreadId: "thread-1", warnings: [] };
  return {
    updatePhase: vi.fn(async (_userId, _actionId, phase) => { events.push(`phase:${phase}`); }),
    retrieveRagContext: vi.fn(async () => { events.push("rag"); return context; }),
    buildPlaybook: vi.fn(async () => { events.push("playbook"); return playbook; }),
    discover: vi.fn(async () => { events.push("discover"); return { runId: "run-1", candidates: [candidate], creditsUsed: 1, warnings: [] }; }),
    collectEvidence: vi.fn(async () => { events.push("evidence"); return { candidates: [candidate], creditsUsed: 2, warnings: [] }; }),
    correctionAgent: { correct: vi.fn(async () => { events.push("correct"); return { candidates: [correctedCandidate], creditsUsed: 1, warnings: [] }; }) },
    qualificationAgent: { evaluate: vi.fn(async () => { events.push("score"); return [assessment]; }) },
    assessmentReviewAgent: { review: vi.fn(async () => { events.push("review"); return { assessments: [assessment],
      reviews: [{ candidateId: assessment.candidateId, required: false, triggers: [], status: "not-required" as const,
        primaryModel: assessment.model, primaryScore: assessment.totalScore, finalScore: assessment.totalScore,
        materialDisagreements: [], rationale: "No trigger", warnings: [] }], warnings: [] }; }) },
    persist: vi.fn(async () => { events.push("persist"); return result; }),
  };
}

describe("LangGraph lead workflow", () => {
  it("retrieves all three RAG domains before search and scores before persistence", async () => {
    const events: string[] = [];
    const graph = buildLeadWorkflowGraph(dependencies(events));
    const state = await graph.invoke({ userId: "user-1", actionId: "action-1", graphThreadId: "thread-1",
      workspaceId: "workspace-1", plan, phase: "queued", ragContext: [], candidates: [], assessments: [], assessmentReviews: [], creditsUsed: 0, warnings: [] });
    expect(state.result?.accepted).toBe(1);
    expect(events.filter((item) => ["rag", "playbook", "discover", "evidence", "correct", "score", "review", "persist"].includes(item)))
      .toEqual(["rag", "playbook", "discover", "evidence", "correct", "score", "review", "persist"]);
  });

  it("fails closed before external discovery when one RAG domain is missing", async () => {
    const events: string[] = [];
    const deps = dependencies(events, ragContext.filter((item) => item.collection !== "company"));
    const graph = buildLeadWorkflowGraph(deps);
    await expect(graph.invoke({ userId: "user-1", actionId: "action-1", graphThreadId: "thread-1",
      workspaceId: "workspace-1", plan, phase: "queued", ragContext: [], candidates: [], assessments: [], assessmentReviews: [], creditsUsed: 0, warnings: [] }))
      .rejects.toThrow("missing usable company context");
    expect(deps.discover).not.toHaveBeenCalled();
  });

  it("fails closed when product evidence has no independent retrieval corroboration", async () => {
    const events: string[] = [];
    const context = ragContext.map((item) => item.collection === "product"
      ? { ...item, retrievalSignals: ["vector"] as LeadRagCitation["retrievalSignals"], corroborated: false } : item);
    const deps = dependencies(events, context);
    const graph = buildLeadWorkflowGraph(deps);
    await expect(graph.invoke({ userId: "user-1", actionId: "action-1", graphThreadId: "thread-1",
      workspaceId: "workspace-1", plan, phase: "queued", ragContext: [], candidates: [], assessments: [], assessmentReviews: [], creditsUsed: 0, warnings: [] }))
      .rejects.toThrow("lacks independent structured/text retrieval corroboration");
    expect(deps.discover).not.toHaveBeenCalled();
  });
});
