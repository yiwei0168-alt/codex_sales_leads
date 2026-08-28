import { afterEach, describe, expect, it, vi } from "vitest";

import type { CompanyRecord } from "@/lib/domain";
import { generateDevelopmentEmailWithKimi, generateDevelopmentStrategyPlanWithKimi,
  generateDevelopmentStrategyWithKimi } from "./kimi-agent";
import type { DevelopmentContext } from "./types";

const company: CompanyRecord = {
  id: "company-example", legalName: "Example GmbH", displayName: "Example GmbH", domain: "example.de",
  city: "Berlin", country: "Germany", layer: "Downstream Channel", roles: ["SI"], accountTier: "Priority",
  supplyModel: "Distributor Supply", brandInvolvement: "Standard", fitScore: 82, accountValue: 82,
  reachability: 70, evidenceConfidence: 85, summary: "Enterprise network integrator", opportunityStage: "Priority",
  priority: "High", owner: "Owner", nextAction: "Generate outreach", risks: ["Vendor overlap"], unknowns: ["Volume"],
  evidence: [{ id: "ev-1", sourceUrl: "https://example.de/solutions", title: "Solutions", sourceType: "Company website",
    capturedAt: "2026-08-24", claim: "Example delivers network integration", summary: "Network integration services",
    status: "Corroborated", confidence: 85 }],
};

const context: DevelopmentContext = {
  userId: "user", workspaceId: "workspace", companyId: "company-db", company,
  knowledge: [{ id: "00000000-0000-0000-0000-000000000001", kind: "company-profile", title: "Cudy profile",
    content: "Cudy serves consumer and SMB networking markets.", score: 0.9, marketCodes: [], channelRoles: [],
    priorityWeight: 2.7, sourceRefs: { authority: 5 } }],
  templates: [{ id: "10000000-0000-0000-0000-000000000001", visibility: "private", source: "mailbox-approved",
    title: "My style", language: "en", channelRoles: ["SI"], targetTitles: ["Solutions Director"],
    subjectPattern: "Possible fit", body: "Hi, concise approved style. Best,", styleProfile: { targetWords: 80 } }],
};

afterEach(() => vi.unstubAllEnvs());

describe("Kimi development strategy agent", () => {
  it("generates strategy and draft in one call and strips validated internal citation markers", async () => {
    vi.stubEnv("KIMI_API_KEY", "test-key");
    const responseValue = { strategy: {
        objective: "Develop an SI partnership", personalizationAngle: "Integration delivery fit", valuePropositions: ["Simpler delivery"],
        recommendedProducts: ["Cudy access points"], targetTitles: ["Solutions Director"], likelyObjections: ["Vendor overlap"],
        callToAction: "Short use-case call", followUpPlan: ["Send a concise follow-up"], evidenceIds: ["ev-1"],
        knowledgeIds: ["00000000-0000-0000-0000-000000000001"] }, draft: {
        language: "en", subjectOptions: ["A possible integration fit"],
        bodyWithCitations: "Hi {{first_name}},\n\nYour network integration work looks relevant. [EVIDENCE:ev-1] Cudy access points may support the proposed discussion. [KNOWLEDGE:00000000-0000-0000-0000-000000000001]\n\nBest,\n{{sales_owner}}",
        placeholders: ["first_name", "sales_owner"] } };
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      model: "kimi-k3", choices: [{ message: { content: JSON.stringify(responseValue) } }],
    }), { status: 200 }));
    const result = await generateDevelopmentStrategyWithKimi(context, { companyExternalId: company.id }, fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.model).toBe("kimi-k3");
    expect(result.draft.body).not.toContain("[EVIDENCE:");
    expect(result.evidenceIds).toEqual(["ev-1"]);
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.temperature).toBe(1);
  });

  it("falls back safely when the draft invents an evidence ID", async () => {
    vi.stubEnv("KIMI_API_KEY", "test-key");
    const responseValue = { strategy: {
        objective: "Develop an SI partnership", personalizationAngle: "Integration delivery fit", valuePropositions: ["Fit"],
        recommendedProducts: [], targetTitles: ["Director"], likelyObjections: [], callToAction: "Call",
        followUpPlan: ["Follow up"], evidenceIds: [], knowledgeIds: [] }, draft: {
        language: "en", subjectOptions: ["Hello"],
        bodyWithCitations: "Hi, invented fact. [EVIDENCE:invented-id] Please meet next week. Best regards. This sentence ensures the draft is long enough for schema validation.", placeholders: [] } };
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(responseValue) } }],
    }), { status: 200 }));
    const result = await generateDevelopmentStrategyWithKimi(context, { companyExternalId: company.id }, fetchMock);
    expect(result.model).toBe("template-fallback");
    expect(result.warnings[0]).toContain("invented company evidence IDs");
  });

  it("gives internal interpretations only to strategy and validates fact-level email citations", async () => {
    vi.stubEnv("KIMI_API_KEY", "test-key");
    const handoffContext: DevelopmentContext = { ...context, handoff: {
      version: "lead-handoff-v1", provenance: { candidateId: "lead-1", runId: "run-1",
        evidenceSnapshotHash: "hash", correctionModel: "corrector", scoringModel: "scorer", reviewStatus: "secondary-confirmed" },
      identity: { companyName: company.displayName, officialUrl: "https://example.de/", domain: company.domain,
        possibleRoles: ["SI"] },
      decision: { score: 82, recommendedFamilies: ["services"], scoreConfidence: 85, scoringStatus: "completed" },
      externallyUsableFacts: [{ factId: "fact-1", kind: "commercial-action",
        statement: "Example delivers network integration services.", evidenceIds: ["ev-1"],
        sourceTypes: ["official-website"], confidence: 90 }],
      internalInterpretations: [{ interpretationId: "interpretation-fit", dimension: "productAndUseCaseFit",
        statement: "This may support an SMB networking discussion.", basedOnFactIds: ["fact-1"], confidence: 75 }],
      personalizationHooks: [{ hook: "Example delivers network integration services.", basedOnFactIds: ["fact-1"],
        allowedInEmail: true }],
      unknowns: ["Purchase volume"], risks: [], doNotClaim: ["Example buys directly from brands."],
      evidenceIndex: [{ evidenceId: "ev-1", url: "https://example.de/solutions", title: "Solutions",
        sourceType: "official-website" }],
      quality: { readyForStrategy: true, readyForEmail: true, conflicts: [], warnings: [] },
    } };
    const strategyValue = { objective: "Develop an SI partnership", personalizationAngle: "Integration delivery fit",
      valuePropositions: ["Partner support"], recommendedProducts: ["SMB networking"],
      targetTitles: ["Solutions Director"], likelyObjections: ["Vendor overlap"], callToAction: "Short use-case call",
      followUpPlan: ["Send a concise follow-up"], evidenceIds: ["ev-1"],
      knowledgeIds: ["00000000-0000-0000-0000-000000000001"] };
    const emailValue = { language: "en", subjectOptions: ["A possible integration fit"],
      bodyWithCitations: "Hi {{first_name}},\n\nYour network integration services caught my attention. [LEAD:fact-1] Cudy serves SMB networking markets. [KNOWLEDGE:00000000-0000-0000-0000-000000000001]\n\nWould a short introductory call be useful next week?\n\nBest regards,\n{{sales_owner}}",
      placeholders: ["first_name", "sales_owner"] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ model: "kimi-k3",
        choices: [{ message: { content: JSON.stringify(strategyValue) } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ model: "kimi-k3",
        choices: [{ message: { content: JSON.stringify(emailValue) } }] }), { status: 200 }));
    const plan = await generateDevelopmentStrategyPlanWithKimi(handoffContext,
      { companyExternalId: company.id }, fetchMock);
    const result = await generateDevelopmentEmailWithKimi(handoffContext,
      { companyExternalId: company.id }, plan, fetchMock);
    expect(result.evidenceIds).toContain("ev-1");
    expect(result.draft.body).not.toContain("[LEAD:");
    const strategyRequest = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const emailRequest = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(JSON.stringify(strategyRequest)).toContain("internalInterpretations");
    expect(JSON.stringify(emailRequest)).not.toContain("internalInterpretations");
    expect(JSON.stringify(emailRequest)).toContain("fact-1");
  });
});
