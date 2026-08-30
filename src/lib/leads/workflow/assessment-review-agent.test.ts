import { describe, expect, it, vi } from "vitest";

import type { LeadSearchPlan } from "@/lib/assistant/types";
import { leadEvidenceContentHash } from "@/lib/leads/evidence-snapshot";

import { LeadAssessmentReviewAgent, assessmentReviewTriggers, type LeadReviewInvoker } from "./assessment-review-agent";
import type { LeadAssessmentModelOutput } from "./schemas";
import type { CorrectedLeadWorkflowCandidate, LeadCandidateAssessment, LeadMarketPlaybook } from "./types";

const evidenceId = "evidence-review";
const findingId = "finding-review";

function modelOutput(productScore = 22): LeadAssessmentModelOutput {
  const dimensions = { productFamilyMatch: productScore, customerAndScenarioOverlap: 13,
    positioningCompatibility: 8, cooperationPathAndBuyingInfluence: 12,
    scaleAndChannelCoverage: 12, executionAndEnablement: 8, opportunityAndRisk: 8 };
  const cooperationPaths = [{ pathId: "path-var-direct", pathType: "Direct Channel Supply" as const,
    candidateRole: "VAR" as const, pathNodes: [{ actor: "Cudy" as const, role: "Brand" },
      { actor: "Candidate" as const, role: "VAR" }, { actor: "Customer" as const, role: "SMB buyer" }],
    supplyFlow: "Cudy supplies the VAR for SMB resale.", decisionRole: "Candidate selects the product offer.",
    fitScore: 82, confidence: 88, rank: 1, evidenceIds: [evidenceId], prerequisites: [],
    valuePropositions: ["SMB networking fit"], risks: [], unknowns: [], targetTitles: ["Category Manager"],
    recommendedCta: "Validate the SMB assortment.", allowedInExternalEmail: true }];
  return {
    candidateId: "lead-review-example",
    gates: { correctedIdentityUsable: "supported", companyExists: "supported",
      targetCountryPresence: "supported", networkingRelevant: "supported", independentProspect: "supported" },
    eligibilityStatus: "eligible", companyScaleClass: "Regional", researchDepth: "standard",
    supplyModel: "Distributor Supply", brandInvolvement: "Standard", cooperationPaths,
    selectedPathId: "path-var-direct",
    dimensions,
    dimensionRationales: (Object.keys(dimensions) as Array<keyof typeof dimensions>).map((dimension) => ({
      dimension, score: dimensions[dimension], reason: `Evidence supports ${dimension}.`,
      findingIds: [findingId], evidenceIds: [evidenceId], confidence: 88,
    })),
    confidence: 88, summary: "Evidence-grounded independent assessment.", reasons: ["Relevant active networking sales."],
    risks: [], unknowns: [], evidenceIds: [evidenceId], needsEscalation: false, warnings: [],
  };
}

const candidate: CorrectedLeadWorkflowCandidate = {
  candidateId: "lead-review-example", evidenceSnapshotRunId: "run-review-example",
  companyName: "Review GmbH", domain: "review.example",
  officialWebsiteUrl: "https://review.example/", queryRoles: ["VAR"], queryFamily: "resale", providerScore: 0.9,
  evidence: [
    { id: evidenceId, url: "https://review.example/network", title: "Network portfolio",
      excerpt: "Review GmbH in Germany is a VAR selling routers, Wi-Fi access points and PoE switches with business quotations.",
      sourceType: "official-website", provider: "fixture", capturedAt: "2026-08-30T00:00:00Z",
      evidenceRunId: "run-review-example", contentHash: leadEvidenceContentHash(
        "Review GmbH in Germany is a VAR selling routers, Wi-Fi access points and PoE switches with business quotations."),
      freshnessStatus: "fresh" },
    { id: "evidence-review-2", url: "https://public.example/review", title: "Company registry",
      excerpt: "Review GmbH is an active independent German company.", sourceType: "independent-public",
      provider: "fixture", capturedAt: "2026-08-30T00:00:00Z", evidenceRunId: "run-review-example",
      contentHash: leadEvidenceContentHash("Review GmbH is an active independent German company."), freshnessStatus: "fresh" },
  ],
  evidenceWarnings: [],
  correction: { originalCompanyName: "Review GmbH", originalDomain: "review.example",
    originalOfficialWebsiteUrl: "https://review.example/", resolvedRoles: ["VAR", "Reseller"],
    resolvedFamilies: ["resale"], primaryRole: "VAR", primaryFamily: "resale",
    primaryChannelReason: "Fixture primary route.", usedSmallLongTailChannelException: false,
    identityChanged: false, routingChanged: false,
    supplementalEvidenceIds: [], reliedEvidenceIds: [evidenceId, "evidence-review-2"],
    findings: [{ findingId, kind: "commercial-action", statement: "The company sells active networking equipment.",
      status: "supported", roles: ["VAR", "Reseller"], evidenceIds: [evidenceId],
      sourceTypes: ["official-website"], confidence: 90, notes: [] }],
    reasons: ["Atomic facts support the corrected route."], confidence: 90,
    model: "deepseek-primary", promptVersion: "correction-v2", escalated: false, warnings: [] },
};

function assessment(output = modelOutput()): LeadCandidateAssessment {
  const totalScore = Object.values(output.dimensions).reduce((sum, value) => sum + value, 0);
  return { ...output, eligible: true, roles: ["VAR", "Reseller"], primaryRole: "VAR",
    companyScaleClass: "Regional", researchDepth: "standard", recommendationPriority: "High",
    supplyModel: "Brand Direct", brandInvolvement: "Standard",
    cooperationPaths: output.cooperationPaths.map((path, index) => ({ ...path, rank: path.rank ?? index + 1 })),
    accountTier: "KA", scoreRange: { lower: totalScore - 3, upper: totalScore + 3 },
    evidenceProfileAssessment: undefined, totalScore: Object.values(output.dimensions).reduce((sum, value) => sum + value, 0),
    model: "deepseek-primary", promptVersion: "primary-v3", escalated: false, scoringStatus: "completed" };
}

const playbook: LeadMarketPlaybook = {
  marketHypothesis: "German SMB networking channel development.", productAngles: ["SMB Wi-Fi"],
  preferredCompanyTraits: ["Active networking sales"], exclusions: [], rolePriorities: [], searchQueries: [],
  ragCitationIds: [], generatedBy: "deterministic-fallback", warnings: [],
};
const plan: LeadSearchPlan = { countryCode: "DE", countryName: "Germany", objective: "new-market", roles: ["VAR"],
  targetCount: 1, queryLanguage: "en", userRequest: "Find networking VARs" };

describe("LeadAssessmentReviewAgent", () => {
  it("routes deterministic gate conflicts and sparse high scores to independent review", () => {
    const primary = assessment();
    primary.gates.networkingRelevant = "conflicting";
    const triggers = assessmentReviewTriggers({ candidate: { ...candidate, evidence: candidate.evidence.slice(0, 1) },
      assessment: primary, randomAuditPercent: 0 });
    expect(triggers).toEqual(expect.arrayContaining(["deterministic-conflict", "high-score-sparse-evidence"]));
  });

  it("keeps the primary result when blind secondary review has no material disagreement", async () => {
    const invoker: LeadReviewInvoker = { assess: vi.fn(async () => ({ output: modelOutput(), model: "gpt-5.6-terra" })),
      judge: vi.fn() };
    const result = await new LeadAssessmentReviewAgent(invoker, { randomAuditPercent: 0, concurrency: 1 })
      .review([candidate], [assessment()], playbook, plan);
    expect(result.reviews[0].status).toBe("secondary-confirmed");
    expect(result.assessments[0].model).toBe("deepseek-primary");
    expect(invoker.judge).not.toHaveBeenCalled();
  });

  it("uses the anonymous judge when secondary scoring materially disagrees", async () => {
    const judged = modelOutput(20);
    const invoker: LeadReviewInvoker = {
      assess: vi.fn(async () => ({ output: modelOutput(8), model: "gpt-5.6-terra" })),
      judge: vi.fn(async () => ({ output: { candidateId: candidate.candidateId, decision: "merge" as const,
        assessment: judged, rationale: "The frozen facts support an intermediate product-fit score.",
        researchQuestion: "", warnings: [] }, model: "gpt-5.6-sol" })),
    };
    const result = await new LeadAssessmentReviewAgent(invoker, { randomAuditPercent: 0, concurrency: 1 })
      .review([candidate], [assessment()], playbook, plan);
    expect(result.reviews[0].status).toBe("judge-resolved");
    expect(result.reviews[0].materialDisagreements).toContain("total-score");
    expect(result.assessments[0].model).toBe("gpt-5.6-sol");
    expect(invoker.judge).toHaveBeenCalledOnce();
  });
});
