import { afterEach, describe, expect, it, vi } from "vitest";

import type { CompanyRecord } from "@/lib/domain";
import { generateDevelopmentStrategyWithKimi } from "./kimi-agent";
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
  knowledge: [{ id: "00000000-0000-0000-0000-000000000001", collection: "product", title: "AP",
    content: "Verified Cudy access point family", score: 0.9, corroborated: true, structuredFacts: [] }],
  templates: [{ id: "10000000-0000-0000-0000-000000000001", visibility: "private", source: "mailbox-approved",
    title: "My style", language: "en", channelRoles: ["SI"], targetTitles: ["Solutions Director"],
    subjectPattern: "Possible fit", body: "Hi, concise approved style. Best,", styleProfile: { targetWords: 80 } }],
};

afterEach(() => vi.unstubAllEnvs());

describe("Kimi development strategy agent", () => {
  it("generates a two-stage strategy and strips validated internal citation markers", async () => {
    vi.stubEnv("KIMI_API_KEY", "test-key");
    const responses = [
      { objective: "Develop an SI partnership", personalizationAngle: "Integration delivery fit", valuePropositions: ["Simpler delivery"],
        recommendedProducts: ["Cudy access points"], targetTitles: ["Solutions Director"], likelyObjections: ["Vendor overlap"],
        callToAction: "Short use-case call", followUpPlan: ["Send a concise follow-up"], evidenceIds: ["ev-1"],
        knowledgeIds: ["00000000-0000-0000-0000-000000000001"] },
      { language: "en", subjectOptions: ["A possible integration fit"],
        bodyWithCitations: "Hi {{first_name}},\n\nYour network integration work looks relevant. [EVIDENCE:ev-1] Cudy access points may support the proposed discussion. [KNOWLEDGE:00000000-0000-0000-0000-000000000001]\n\nBest,\n{{sales_owner}}",
        placeholders: ["first_name", "sales_owner"] },
    ];
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      model: "kimi-k3", choices: [{ message: { content: JSON.stringify(responses.shift()) } }],
    }), { status: 200 }));
    const result = await generateDevelopmentStrategyWithKimi(context, { companyExternalId: company.id }, fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.model).toBe("kimi-k3");
    expect(result.draft.body).not.toContain("[EVIDENCE:");
    expect(result.evidenceIds).toEqual(["ev-1"]);
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.temperature).toBe(1);
  });

  it("falls back safely when the draft invents an evidence ID", async () => {
    vi.stubEnv("KIMI_API_KEY", "test-key");
    const responses = [
      { objective: "Develop an SI partnership", personalizationAngle: "Integration delivery fit", valuePropositions: ["Fit"],
        recommendedProducts: [], targetTitles: ["Director"], likelyObjections: [], callToAction: "Call",
        followUpPlan: ["Follow up"], evidenceIds: [], knowledgeIds: [] },
      { language: "en", subjectOptions: ["Hello"], bodyWithCitations: "Hi, invented fact. [EVIDENCE:invented-id] Please meet next week. Best regards.", placeholders: [] },
    ];
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(responses.shift()) } }],
    }), { status: 200 }));
    const result = await generateDevelopmentStrategyWithKimi(context, { companyExternalId: company.id }, fetchMock);
    expect(result.model).toBe("deterministic-fallback");
    expect(result.warnings[0]).toContain("invented company evidence IDs");
  });
});
