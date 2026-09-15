import { afterEach, describe, expect, it, vi } from "vitest";

import type { LeadSearchPlan } from "@/lib/assistant/types";
import { BudgetDeniedError, quoteRequest } from "@/lib/billing/policy";
import { createHash } from "node:crypto";
import { leadEvidenceContentHash } from "@/lib/leads/evidence-snapshot";

import { LeadAssessmentReviewAgent, assessmentReviewTriggers,
  type LeadReviewCheckpoint, type LeadReviewInvoker } from "./assessment-review-agent";
import { enforceAssessmentEvidenceCaps } from "./qualification-agent";
import type { LeadAssessmentModelOutput } from "./schemas";
import type { CorrectedLeadWorkflowCandidate, LeadCandidateAssessment, LeadMarketPlaybook } from "./types";

const evidenceId = "evidence-review";
const findingId = "finding-review";

function modelOutput(productScore = 22): LeadAssessmentModelOutput {
  const dimensions = { productFamilyMatch: productScore, customerAndScenarioOverlap: 13,
    positioningCompatibility: 8, cooperationPathAndBuyingInfluence: 12,
    scaleAndChannelCoverage: 12, executionAndEnablement: 8, opportunityAndRisk: 8 };
  const cooperationPaths = [{ pathId: "path-var-direct", pathType: "Direct Downstream Channel Supply" as const,
    candidateRole: "VAR" as const,
    fitComponents: { roleStructureFit: 25, userStageAndSupplyFit: 20, productCustomerScenarioFit: 16,
      procurementAndInfluence: 12, executionFeasibility: 9 },
    findingIds: [findingId], evidenceIds: [evidenceId], reason: "Direct supply fits the evidenced VAR role.",
    prerequisites: [], risks: [], unknowns: [], allowedInExternalEmail: true }];
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
    risks: [], unknowns: [], evidenceIds: [evidenceId], escalation: { required: false,
      expectedTotalScoreChange: 0, criticalStateChanges: [], higherCapabilityCanResolve: false, reason: "" }, warnings: [],
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
      sourceTypes: ["official-website"], confidence: 90, notes: [] },
    { findingId: "finding-review-country", kind: "country-presence", statement: "Review GmbH operates in Germany.",
      status: "supported", roles: [], evidenceIds: [evidenceId], sourceTypes: ["official-website"],
      confidence: 90, notes: [] }],
    reasons: ["Atomic facts support the corrected route."], confidence: 90,
    model: "deepseek-primary", promptVersion: "correction-v2", escalated: false, warnings: [] },
};

function assessment(output = modelOutput()): LeadCandidateAssessment {
  const totalScore = Object.values(output.dimensions).reduce((sum, value) => sum + value, 0);
  const value: LeadCandidateAssessment = { ...output, eligible: true, roles: ["VAR", "Reseller"], primaryRole: "VAR",
    companyScaleClass: "Regional", researchDepth: "standard", recommendationPriority: "High",
    supplyModel: "Brand Direct", brandInvolvement: "Standard",
    cooperationPaths: output.cooperationPaths.map((path, index) => ({ ...path,
      fitScore: Object.values(path.fitComponents).reduce((sum, score) => sum + score, 0), rank: index + 1 })),
    accountTier: "KA", scoreRange: { lower: totalScore - 3, upper: totalScore + 3 },
    evidenceProfileAssessment: undefined, totalScore: Object.values(output.dimensions).reduce((sum, value) => sum + value, 0),
    model: "deepseek-primary", promptVersion: "primary-v3", escalated: false, scoringStatus: "completed" };
  return enforceAssessmentEvidenceCaps(candidate, value);
}

const playbook: LeadMarketPlaybook = {
  marketHypothesis: "German SMB networking channel development.", productAngles: ["SMB Wi-Fi"],
  preferredCompanyTraits: ["Active networking sales"], exclusions: [], rolePriorities: [], searchQueries: [],
  ragCitationIds: [], generatedBy: "deterministic-fallback", warnings: [],
};
const plan: LeadSearchPlan = { countryCode: "DE", countryName: "Germany", objective: "new-market", roles: ["VAR"],
  targetCount: 1, queryLanguage: "en", userRequest: "Find networking VARs" };

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function memoryReviewCheckpoint() {
  const values = new Map<string, unknown>();
  const key = (phase: string, candidateId: string, contract: string) => `${phase}:${candidateId}:${contract}`;
  const checkpoint: LeadReviewCheckpoint = {
    load: vi.fn(async (phase, candidateId, contract) => values.get(key(phase, candidateId, contract)) ?? null),
    save: vi.fn(async (phase, candidateId, contract, response) => {
      values.set(key(phase, candidateId, contract), response);
    }),
  };
  return checkpoint;
}

describe("LeadAssessmentReviewAgent", () => {
  it("routes deterministic gate conflicts and sparse high scores to independent review", () => {
    const primary = assessment();
    primary.gates.networkingRelevant = "conflicting";
    const triggers = assessmentReviewTriggers({ candidate: { ...candidate, evidence: candidate.evidence.slice(0, 1) },
      assessment: primary, randomAuditPercent: 0 });
    expect(triggers).toContain("deterministic-conflict");
  });

  it("does not spend an independent review on a non-actionable research hold with only generic warnings", () => {
    const primary = assessment();
    primary.eligible = false;
    primary.eligibilityStatus = "research-required";
    primary.totalScore = 54;
    primary.confidence = 65;
    primary.companyScaleClass = "Local/Small";
    primary.warnings = ["Additional public product detail would be useful."];
    const heldCandidate = { ...candidate, correction: { ...candidate.correction, confidence: 65 },
      evidenceWarnings: ["Search returned limited public detail."] };
    expect(assessmentReviewTriggers({ candidate: heldCandidate, assessment: primary,
      randomAuditPercent: 0 })).toEqual([]);
  });

  it("does not escalate solely because confidence is low", () => {
    const primary = assessment();
    primary.confidence = 70;
    primary.companyScaleClass = "Global/Enterprise";
    const triggers = assessmentReviewTriggers({ candidate, assessment: primary, randomAuditPercent: 0 });
    expect(triggers).not.toContain("low-confidence");
  });

  it("does not independently review an already-resolved routine escalation provenance warning", () => {
    const primary = assessment();
    primary.warnings = ["Routine assessment requested evidence-conflict escalation."];
    const triggers = assessmentReviewTriggers({ candidate, assessment: primary, randomAuditPercent: 0 });
    expect(triggers).not.toContain("scoring-anomaly");
  });

  it("does not treat clearly subordinate alternative paths as material", () => {
    const primary = assessment();
    primary.cooperationPaths.push({ ...primary.cooperationPaths[0], pathId: "path-referral",
      pathType: "Other", fitScore: 55, rank: 2 });
    const triggers = assessmentReviewTriggers({ candidate, assessment: primary, randomAuditPercent: 0 });
    expect(triggers).not.toContain("material-alternative-paths");
  });

  it("keeps the primary result when blind secondary review has no material disagreement", async () => {
    const invoker: LeadReviewInvoker = { assess: vi.fn(async () => ({ output: modelOutput(), model: "gpt-5.6-terra" })),
      judge: vi.fn() };
    const result = await new LeadAssessmentReviewAgent(invoker, { randomAuditPercent: 100, concurrency: 1 })
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
    const result = await new LeadAssessmentReviewAgent(invoker, { randomAuditPercent: 100, concurrency: 1 })
      .review([candidate], [assessment()], playbook, plan);
    expect(result.reviews[0].status).toBe("judge-resolved");
    expect(result.reviews[0].materialDisagreements).toContain("total-score");
    expect(result.assessments[0].model).toBe("gpt-5.6-sol");
    expect(invoker.judge).toHaveBeenCalledOnce();
  });

  it("captures the actual credits-only review requests and keeps unapproved tariffs blocked", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "synthetic-test-only");
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);
      const output = bodies.length === 1 ? modelOutput(8) : {
        candidateId: candidate.candidateId, decision: "merge", assessment: modelOutput(20),
        rationale: "The supplied evidence supports the merged result.", researchQuestion: "", warnings: [],
      };
      return Response.json({ model: body.model, choices: [{ finish_reason: "stop",
        message: { content: JSON.stringify(output) } }] });
    }));

    const result = await new LeadAssessmentReviewAgent(undefined,
      { randomAuditPercent: 100, concurrency: 1 }).review([candidate], [assessment()], playbook, plan);
    expect(result.reviews[0].status).toBe("judge-resolved");
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toMatchObject({ model: "openai/gpt-5.6-terra",
      reasoning: { effort: "medium" }, max_tokens: 8192,
      provider: { require_parameters: true, data_collection: "deny" } });
    expect(bodies[1]).toMatchObject({ model: "openai/gpt-5.6-sol", temperature: 0,
      reasoning: { effort: "high" }, max_completion_tokens: 12000,
      provider: { require_parameters: true, data_collection: "deny" } });
    expect(bodies[0]).not.toHaveProperty("temperature");
    expect(bodies[0]).not.toHaveProperty("max_completion_tokens");
    for (const body of bodies) {
      expect(body).not.toHaveProperty("tools");
      expect(body).not.toHaveProperty("plugins");
      expect(body.response_format).toMatchObject({ type: "json_schema",
        json_schema: { strict: true } });
      const quote = { origin: "https://openrouter.ai", pathname: "/api/v1/chat/completions",
        model: String(body.model), requestBytes: Buffer.byteLength(JSON.stringify(body), "utf8"),
        outputTokens: Number(body.max_tokens ?? body.max_completion_tokens) };
      expect(quote.requestBytes).toBeLessThanOrEqual(61_440);
      expect(() => quoteRequest(quote, undefined, Date.parse("2026-09-14T00:00:00Z")))
        .toThrow(BudgetDeniedError);
      try { quoteRequest(quote, undefined, Date.parse("2026-09-14T00:00:00Z")); }
      catch (error) { expect((error as BudgetDeniedError).code)
        .toBe(body.model === "openai/gpt-5.6-terra" ? "missing-tariff" : "request-out-of-bounds"); }
    }
    const secondaryInput = JSON.parse((bodies[0].messages as { content: string }[])[1].content);
    expect(JSON.stringify(secondaryInput)).not.toContain('"primaryScore"');
    const judgeInput = JSON.parse((bodies[1].messages as { content: string }[])[1].content);
    expect(JSON.stringify(judgeInput)).toContain('"assessmentA"');
    expect(JSON.stringify(judgeInput)).toContain('"assessmentB"');
  });

  it("reuses the completed first company after a later company pauses before its call", async () => {
    const second = { ...candidate, candidateId: "lead-review-second", domain: "second.example" };
    const primarySecond = { ...assessment(), candidateId: second.candidateId };
    const checkpoint = memoryReviewCheckpoint();
    let pauseSecond = true;
    const assess = vi.fn(async (input: Record<string, unknown>) => {
      const id = (input.candidate as { candidateId: string }).candidateId;
      if (id === second.candidateId && pauseSecond) throw new BudgetDeniedError("budget-exhausted");
      return { output: { ...modelOutput(), candidateId: id }, model: "gpt-5.6-terra",
        usage: { inputTokens: 11, outputTokens: 7, reasoningTokens: 2, totalTokens: 18 } };
    });
    const invoker: LeadReviewInvoker = { assess, judge: vi.fn(), cacheIdentity: (phase, input) =>
      createHash("sha256").update(JSON.stringify({ phase, input })).digest("hex") };
    await expect(new LeadAssessmentReviewAgent(invoker, { randomAuditPercent: 100, concurrency: 1 })
      .review([candidate, second], [assessment(), primarySecond], playbook, plan, checkpoint))
      .rejects.toMatchObject({ code: "budget-exhausted" });
    expect(checkpoint.save).toHaveBeenCalledTimes(1);
    pauseSecond = false;
    const resumed = await new LeadAssessmentReviewAgent(invoker, { randomAuditPercent: 100, concurrency: 1 })
      .review([candidate, second], [assessment(), primarySecond], playbook, plan, checkpoint);
    expect(resumed.reviews.map(item => item.status)).toEqual(["secondary-confirmed", "secondary-confirmed"]);
    expect(resumed.cacheHits).toEqual({ secondary: 1, judge: 0 });
    expect(resumed.usage).toHaveLength(1);
    expect(assess).toHaveBeenCalledTimes(3);
    expect(checkpoint.save).toHaveBeenCalledTimes(2);
    const changedEvidence = { ...candidate, evidence: candidate.evidence.map((item, index) =>
      index === 0 ? { ...item, title: "Updated current evidence title" } : item) };
    await new LeadAssessmentReviewAgent(invoker, { randomAuditPercent: 100, concurrency: 1 })
      .review([changedEvidence], [assessment()], playbook, plan, checkpoint);
    expect(assess).toHaveBeenCalledTimes(4);
    expect(checkpoint.save).toHaveBeenCalledTimes(3);
  });

  it("reuses a completed secondary response when the judge pauses", async () => {
    const checkpoint = memoryReviewCheckpoint();
    const assess = vi.fn(async () => ({ output: modelOutput(8), model: "gpt-5.6-terra",
      usage: { inputTokens: 11, outputTokens: 7, reasoningTokens: 2, totalTokens: 18 } }));
    let pauseJudge = true;
    const judge = vi.fn(async () => {
      if (pauseJudge) throw new BudgetDeniedError("request-out-of-bounds");
      return { output: { candidateId: candidate.candidateId, decision: "merge" as const,
        assessment: modelOutput(20), rationale: "Evidence supports the merged assessment.",
        researchQuestion: "", warnings: [] }, model: "gpt-5.6-sol" };
    });
    const invoker: LeadReviewInvoker = { assess, judge, cacheIdentity: (phase, input) =>
      createHash("sha256").update(JSON.stringify({ phase, input })).digest("hex") };
    await expect(new LeadAssessmentReviewAgent(invoker, { randomAuditPercent: 100, concurrency: 1 })
      .review([candidate], [assessment()], playbook, plan, checkpoint))
      .rejects.toMatchObject({ code: "request-out-of-bounds" });
    expect(checkpoint.save).toHaveBeenCalledTimes(1);
    pauseJudge = false;
    const resumed = await new LeadAssessmentReviewAgent(invoker, { randomAuditPercent: 100, concurrency: 1 })
      .review([candidate], [assessment()], playbook, plan, checkpoint);
    expect(resumed.reviews[0].status).toBe("judge-resolved");
    expect(resumed.cacheHits).toEqual({ secondary: 1, judge: 0 });
    expect(resumed.usage).toHaveLength(0);
    expect(assess).toHaveBeenCalledOnce();
    expect(judge).toHaveBeenCalledTimes(2);
    expect(checkpoint.save).toHaveBeenCalledTimes(2);
  });

  it("pauses before the next peer if a paid review response cannot be checkpointed", async () => {
    const second = { ...candidate, candidateId: "lead-review-later", domain: "later.example" };
    const checkpoint = memoryReviewCheckpoint();
    checkpoint.save = vi.fn().mockRejectedValue(new Error("Synthetic checkpoint outage"));
    const assess = vi.fn(async (input: Record<string, unknown>) => ({
      output: { ...modelOutput(), candidateId: (input.candidate as { candidateId: string }).candidateId },
      model: "gpt-5.6-terra" }));
    const invoker: LeadReviewInvoker = { assess, judge: vi.fn(), cacheIdentity: (phase, input) =>
      createHash("sha256").update(JSON.stringify({ phase, input })).digest("hex") };
    await expect(new LeadAssessmentReviewAgent(invoker, { randomAuditPercent: 100, concurrency: 2 })
      .review([candidate, second], [assessment(), { ...assessment(), candidateId: second.candidateId }],
        playbook, plan, checkpoint)).rejects.toMatchObject({ code: "paid-request-already-recorded" });
    expect(assess).toHaveBeenCalledOnce();
  });

  it("keeps a schema-incomplete paid review unfinished instead of retaining the primary as reviewed", async () => {
    const second = { ...candidate, candidateId: "lead-review-later", domain: "later.example" };
    const assess = vi.fn(async () => ({ output: { candidateId: candidate.candidateId } as LeadAssessmentModelOutput,
      model: "gpt-5.6-terra" }));
    const invoker: LeadReviewInvoker = { assess, judge: vi.fn(), cacheIdentity: (phase, input) =>
      createHash("sha256").update(JSON.stringify({ phase, input })).digest("hex") };
    const checkpoint = memoryReviewCheckpoint();
    await expect(new LeadAssessmentReviewAgent(invoker, { randomAuditPercent: 100, concurrency: 2 })
      .review([candidate, second], [assessment(), { ...assessment(), candidateId: second.candidateId }],
        playbook, plan, checkpoint)).rejects.toMatchObject({ code: "model-output-incomplete" });
    expect(assess).toHaveBeenCalledOnce();
    expect(checkpoint.save).not.toHaveBeenCalled();
  });
});
