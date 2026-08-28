import { describe, expect, it, vi } from "vitest";

import type { LeadSearchPlan } from "@/lib/assistant/types";

import { LeadAssessmentReviewAgent, assessmentReviewTriggers, type LeadReviewInvoker } from "./assessment-review-agent";
import type { LeadAssessmentModelOutput } from "./schemas";
import type { CorrectedLeadWorkflowCandidate, LeadCandidateAssessment, LeadMarketPlaybook } from "./types";

const evidenceId = "evidence-review";
const findingId = "finding-review";

function modelOutput(productScore = 40): LeadAssessmentModelOutput {
  const dimensions = { productAndUseCaseFit: productScore, cooperationPathAndBuyingInfluence: 26,
    evidenceAndEntityConfidence: 18, roleIdentificationQuality: 3, channelClassificationQuality: 1 };
  return {
    candidateId: "lead-review-example",
    gates: { correctedIdentityUsable: "supported", companyExists: "supported",
      targetCountryPresence: "supported", networkingRelevant: "supported", independentProspect: "supported" },
    accountTier: "Priority", supplyModel: "Distributor Supply", brandInvolvement: "Standard",
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
  candidateId: "lead-review-example", companyName: "Review GmbH", domain: "review.example",
  officialWebsiteUrl: "https://review.example/", queryRoles: ["VAR"], queryFamily: "resale", providerScore: 0.9,
  evidence: [
    { id: evidenceId, url: "https://review.example/network", title: "Network portfolio",
      excerpt: "Review GmbH in Germany is a VAR selling routers, Wi-Fi access points and PoE switches with business quotations.",
      sourceType: "official-website", provider: "fixture", capturedAt: "2026-08-28" },
    { id: "evidence-review-2", url: "https://public.example/review", title: "Company registry",
      excerpt: "Review GmbH is an active independent German company.", sourceType: "independent-public",
      provider: "fixture", capturedAt: "2026-08-28" },
  ],
  evidenceWarnings: [],
  correction: { originalCompanyName: "Review GmbH", originalDomain: "review.example",
    originalOfficialWebsiteUrl: "https://review.example/", resolvedRoles: ["VAR", "Reseller"],
    resolvedFamilies: ["resale"], identityChanged: false, routingChanged: false,
    supplementalEvidenceIds: [], reliedEvidenceIds: [evidenceId, "evidence-review-2"],
    findings: [{ findingId, kind: "commercial-action", statement: "The company sells active networking equipment.",
      status: "supported", roles: ["VAR", "Reseller"], evidenceIds: [evidenceId],
      sourceTypes: ["official-website"], confidence: 90, notes: [] }],
    reasons: ["Atomic facts support the corrected route."], confidence: 90,
    model: "deepseek-primary", promptVersion: "correction-v2", escalated: false, warnings: [] },
};

function assessment(output = modelOutput()): LeadCandidateAssessment {
  return { ...output, eligible: true, roles: ["VAR", "Reseller"], primaryRole: null,
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
  it("routes hard-gate ambiguity and sparse high scores to independent review", () => {
    const primary = assessment();
    primary.gates.networkingRelevant = "unknown";
    const triggers = assessmentReviewTriggers({ candidate: { ...candidate, evidence: candidate.evidence.slice(0, 1) },
      assessment: primary, randomAuditPercent: 0 });
    expect(triggers).toEqual(expect.arrayContaining(["hard-gate-not-supported", "high-score-sparse-evidence"]));
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
    const judged = modelOutput(38);
    const invoker: LeadReviewInvoker = {
      assess: vi.fn(async () => ({ output: modelOutput(20), model: "gpt-5.6-terra" })),
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
