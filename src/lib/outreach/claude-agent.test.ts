import { afterEach, describe, expect, it, vi } from "vitest";

import type { CompanyRecord } from "@/lib/domain";
import { reviseDevelopmentDraftWithClaude } from "./claude-agent";
import type { DevelopmentContext, DevelopmentStrategyDto } from "./types";

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
  templates: [],
};

const current = {
  id: "draft", companyExternalId: company.id, strategy: { objective: "Partner", personalizationAngle: "Fit",
    valuePropositions: ["Value"], recommendedProducts: [], targetTitles: ["Director"], likelyObjections: [],
    callToAction: "Call", followUpPlan: ["Follow up"], evidenceIds: ["ev-1"],
    knowledgeIds: ["00000000-0000-0000-0000-000000000001"] },
  draft: { language: "en", subjectOptions: ["Subject"], body: "Existing email", wordCount: 2, placeholders: [] },
  evidenceIds: ["ev-1"], knowledgeIds: ["00000000-0000-0000-0000-000000000001"], templateIds: [],
  warnings: [], model: "kimi-k3", promptVersion: "v2", status: "generated", revision: 1,
  generationMetrics: { modelCalls: 1, latencyMs: 10 }, createdAt: "2026-08-24",
} satisfies DevelopmentStrategyDto;

afterEach(() => vi.unstubAllEnvs());

describe("Claude outreach feedback agent", () => {
  it("uses OpenRouter Chat Completions and returns a grounded revision with memory", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("CLAUDE_OUTREACH_MODEL", "claude-opus-5");
    const responseValue = {
      subjectOptions: ["Revised subject"],
      revisedBodyWithCitations: "Dear {{first_name}},\n\nYour integration work is relevant to this partnership discussion. [EVIDENCE:ev-1] Cudy serves consumer and SMB networking markets. [KNOWLEDGE:00000000-0000-0000-0000-000000000001]\n\nPlease let me know if a short discussion would be useful.\n\nBest regards,\nSteven",
      memoryEvaluation: { valuable: true, summary: "Introduce Steven as Cudy Sales Manager in future outreach.",
        reason: "Explicit private reusable sender identity", marketCodes: [], channelRoles: ["SI"] },
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: "anthropic/claude-opus-5", choices: [{ finish_reason: "stop",
        message: { content: JSON.stringify(responseValue) } }],
      usage: { prompt_tokens: 300, completion_tokens: 200, total_tokens: 500, cost: 0.0065 },
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await reviseDevelopmentDraftWithClaude(context, current, "Introduce Steven", fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/chat/completions");
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.model).toBe("anthropic/claude-opus-5");
    expect(request.stream).toBe(false);
    expect(request.messages).toHaveLength(2);
    expect(request.provider).toMatchObject({ require_parameters: true, data_collection: "deny" });
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      authorization: "Bearer test-key", "X-OpenRouter-Title": "Cudy Network Channel Copilot",
    });
    expect(result.model).toBe("anthropic/claude-opus-5");
    expect(result.revisedBody).not.toContain("[KNOWLEDGE:");
    expect(result.memory.valuable).toBe(true);
    expect(result.generationMetrics.totalTokens).toBe(500);
    expect(result.generationMetrics.accountCashCostUsd).toBe(0.0065);
  });

  it("requires the shared OpenRouter key instead of falling back to a direct provider", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    await expect(reviseDevelopmentDraftWithClaude(context, current, "Revise", vi.fn()))
      .rejects.toThrow("OPENROUTER_API_KEY");
  });

  it("keeps feedback revisions inside the handoff email-fact boundary", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const handoffContext: DevelopmentContext = { ...context, handoff: {
      version: "lead-handoff-v2", provenance: { candidateId: "lead-1", runId: "run-1",
        evidenceSnapshotHash: "hash", correctionModel: "corrector", scoringModel: "scorer", reviewStatus: "not-required" },
      identity: { companyName: company.displayName, officialUrl: "https://example.de/", domain: company.domain,
        supportedRoles: ["SI"], primaryBusinessRole: "SI" },
      decision: { score: 82, scoreRange: { lower: 79, upper: 85 }, eligibilityStatus: "eligible",
        primaryFamily: "services", recommendedFamilies: ["services"], companyScaleClass: "Regional",
        researchDepth: "standard", recommendationPriority: "High", accountTier: "KA",
        cooperationPaths: [], selectedPathId: null, scoreConfidence: 85, scoringStatus: "completed" },
      externallyUsableFacts: [{ factId: "fact-1", kind: "commercial-action",
        statement: "Example delivers network integration services.", evidenceIds: ["ev-1"],
        sourceTypes: ["official-website"], confidence: 90 }],
      internalInterpretations: [{ interpretationId: "internal-1", dimension: "productFamilyMatch",
        statement: "Potential fit is an internal hypothesis.", basedOnFactIds: ["fact-1"], confidence: 70 }],
      personalizationHooks: [{ hook: "Network integration services", basedOnFactIds: ["fact-1"], allowedInEmail: true }],
      unknowns: [], risks: [], doNotClaim: ["Example procures directly from brands."],
      evidenceIndex: [{ evidenceId: "ev-1", url: "https://example.de/solutions", title: "Solutions",
        sourceType: "official-website" }],
      quality: { readyForStrategy: true, readyForEmail: true, conflicts: [], warnings: [] },
    } };
    const responseValue = { subjectOptions: ["Revised subject"],
      revisedBodyWithCitations: "Dear {{first_name}},\n\nYour network integration services caught my attention. [LEAD:fact-1] Cudy serves consumer and SMB networking markets. [KNOWLEDGE:00000000-0000-0000-0000-000000000001]\n\nWould a short call next week be useful?\n\nBest regards,\nSteven",
      memoryEvaluation: { valuable: false, reason: "No reusable rule", marketCodes: [], channelRoles: [] } };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ model: "anthropic/claude-sonnet-4.6",
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(responseValue) } }],
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const result = await reviseDevelopmentDraftWithClaude(handoffContext, current, "Keep it concise", fetchMock);
    expect(result.evidenceIds).toEqual(["ev-1"]);
    expect(result.revisedBody).not.toContain("[LEAD:");
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(JSON.stringify(request)).not.toContain("internalInterpretations");
    expect(JSON.stringify(request)).toContain("fact-1");
  });
});
