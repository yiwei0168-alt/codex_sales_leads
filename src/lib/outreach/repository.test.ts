import type { PoolClient } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tenantQuery: vi.fn(), tenantTransaction: vi.fn(), searchOutreachKnowledge: vi.fn(),
  prepareFeedbackMemory: vi.fn(), insertFeedbackMemory: vi.fn(), embedTexts: vi.fn(),
}));

vi.mock("@/lib/rag/db", () => ({ tenantQuery: mocks.tenantQuery, tenantTransaction: mocks.tenantTransaction }));
vi.mock("@/lib/rag/openai-provider", () => ({ embedTexts: mocks.embedTexts }));
vi.mock("./knowledge-repository", () => ({
  searchOutreachKnowledge: mocks.searchOutreachKnowledge,
  prepareFeedbackMemory: mocks.prepareFeedbackMemory,
  insertFeedbackMemory: mocks.insertFeedbackMemory,
}));

import { applyFeedbackRevision } from "./repository";
import type { DevelopmentStrategyDto } from "./types";

const draft: DevelopmentStrategyDto = {
  id: "draft-1", companyExternalId: "company-1",
  strategy: { objective: "Develop partnership", personalizationAngle: "Channel fit", valuePropositions: ["Value"],
    recommendedProducts: [], targetTitles: ["Director"], likelyObjections: [], callToAction: "Short call",
    followUpPlan: ["Follow up"], evidenceIds: [], knowledgeIds: [] },
  draft: { language: "en", subjectOptions: ["Subject"], body: "Previous body", wordCount: 2, placeholders: [] },
  evidenceIds: [], knowledgeIds: [], templateIds: [], warnings: [], model: "kimi-k3",
  promptVersion: "v2", generationMetrics: { modelCalls: 1, latencyMs: 10 }, status: "generated",
  revision: 4, createdAt: "2026-08-25T00:00:00Z",
};

function input(allowMemory: boolean) {
  return {
    feedbackId: "feedback-1", draft, revisedBody: "Revised body with a sufficiently clear call to action.",
    subjectOptions: ["Revised subject"], model: "kimi-k3",
    generationMetrics: { modelCalls: 1, latencyMs: 20 }, evidenceIds: ["evidence-1"],
    knowledgeIds: ["10000000-0000-4000-8000-000000000001"], allowMemory,
    memory: { valuable: true, summary: "Use approved Dutch retail proof for relevant channel partners.",
      reason: "Reusable market positioning", marketCodes: ["NL"], channelRoles: ["Distributor"] },
  };
}

describe("outreach feedback persistence", () => {
  let client: { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    client = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [{ revision: 5, updated_at: "2026-08-25T01:00:00Z" }] })
      .mockResolvedValueOnce({ rows: [{ id: "feedback-1" }] }) };
    mocks.tenantTransaction.mockImplementation(async (_userId, run) => run(client as unknown as PoolClient));
    mocks.prepareFeedbackMemory.mockResolvedValue([0.1, 0.2]);
    mocks.insertFeedbackMemory.mockResolvedValue("memory-1");
  });

  it("does not embed or store memory without explicit human consent", async () => {
    const result = await applyFeedbackRevision("user-1", input(false));
    expect(mocks.prepareFeedbackMemory).not.toHaveBeenCalled();
    expect(mocks.insertFeedbackMemory).not.toHaveBeenCalled();
    expect(result.memoryStored).toBe(false);
    expect(result.memoryReason).toContain("未授权");
    expect(result.draft.revision).toBe(5);
  });

  it("stores approved reusable memory inside the same tenant transaction", async () => {
    const result = await applyFeedbackRevision("user-1", input(true));
    expect(mocks.prepareFeedbackMemory).toHaveBeenCalledTimes(1);
    expect(mocks.insertFeedbackMemory).toHaveBeenCalledWith(
      client, "user-1", expect.objectContaining({ feedbackId: "feedback-1" }), [0.1, 0.2],
    );
    expect(result.memoryStored).toBe(true);
    expect(result.memorySummary).toContain("Dutch retail proof");
  });
});
