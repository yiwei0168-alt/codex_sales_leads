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
  it("uses the Anthropic Messages API and returns a grounded revision with memory", async () => {
    vi.stubEnv("CLAUDE_API_KEY", "test-key");
    vi.stubEnv("CLAUDE_BASE_URL", "https://lingyuapi.com");
    vi.stubEnv("CLAUDE_OUTREACH_MODEL", "claude-opus-5");
    const responseValue = {
      subjectOptions: ["Revised subject"],
      revisedBodyWithCitations: "Dear {{first_name}},\n\nYour integration work is relevant to this partnership discussion. [EVIDENCE:ev-1] Cudy serves consumer and SMB networking markets. [KNOWLEDGE:00000000-0000-0000-0000-000000000001]\n\nPlease let me know if a short discussion would be useful.\n\nBest regards,\nSteven",
      memoryEvaluation: { valuable: true, summary: "Introduce Steven as Cudy Sales Manager in future outreach.",
        reason: "Explicit private reusable sender identity", marketCodes: [], channelRoles: ["SI"] },
    };
    const stream = [
      `event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: {
        model: "claude-opus-5", usage: { input_tokens: 300 },
      } })}`,
      `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", delta: {
        type: "text_delta", text: JSON.stringify(responseValue),
      } })}`,
      `event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: {
        stop_reason: "end_turn",
      }, usage: { output_tokens: 200 } })}`,
      `event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}`,
    ].join("\n\n");
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }));

    const result = await reviseDevelopmentDraftWithClaude(context, current, "Introduce Steven", fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://lingyuapi.com/v1/messages");
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.model).toBe("claude-opus-5");
    expect(request.stream).toBe(true);
    expect(request.messages).toHaveLength(1);
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      "x-api-key": "test-key", "anthropic-version": "2023-06-01",
    });
    expect(result.model).toBe("claude-opus-5");
    expect(result.revisedBody).not.toContain("[KNOWLEDGE:");
    expect(result.memory.valuable).toBe(true);
    expect(result.generationMetrics.totalTokens).toBe(500);
  });

  it("requires a dedicated Claude key instead of falling back to Kimi", async () => {
    vi.stubEnv("CLAUDE_API_KEY", "");
    await expect(reviseDevelopmentDraftWithClaude(context, current, "Revise", vi.fn()))
      .rejects.toThrow("CLAUDE_API_KEY");
  });

  it("keeps feedback revisions inside the handoff email-fact boundary", async () => {
    vi.stubEnv("CLAUDE_API_KEY", "test-key");
    vi.stubEnv("CLAUDE_BASE_URL", "https://lingyuapi.com");
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
    const stream = [`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { model: "claude-opus-5", usage: { input_tokens: 10 } } })}`,
      `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: JSON.stringify(responseValue) } })}`,
      `event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 10 } })}`,
      `event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}`].join("\n\n");
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, { status: 200,
      headers: { "content-type": "text/event-stream" } }));
    const result = await reviseDevelopmentDraftWithClaude(handoffContext, current, "Keep it concise", fetchMock);
    expect(result.evidenceIds).toEqual(["ev-1"]);
    expect(result.revisedBody).not.toContain("[LEAD:");
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(JSON.stringify(request)).not.toContain("internalInterpretations");
    expect(JSON.stringify(request)).toContain("fact-1");
  });
});
