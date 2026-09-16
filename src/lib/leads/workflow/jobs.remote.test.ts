import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn(),
}));

vi.mock("@/lib/langgraph/client", () => ({ invokeLeadWorkflowViaLangGraph: mocks.invoke }));
vi.mock("./job-completion", () => ({ completeWorkflowJob: mocks.complete, failWorkflowJob: mocks.fail }));
vi.mock("@/lib/assistant/repository", () => ({ getAssistantAction: vi.fn(), setAssistantActionStatus: vi.fn() }));
vi.mock("@/lib/rag/db", () => ({ query: vi.fn(), tenantQuery: vi.fn(), tenantTransaction: vi.fn() }));

import { executeClaimedLeadWorkflow, type LeadWorkflowJobClaim } from "./jobs";

const claim: LeadWorkflowJobClaim = {
  jobId: "44444444-4444-4444-8444-444444444444",
  userId: "11111111-1111-4111-8111-111111111111",
  actionId: "22222222-2222-4222-8222-222222222222",
  graphThreadId: "lead:22222222-2222-4222-8222-222222222222:33333333-3333-4333-8333-333333333333",
  conversationId: "55555555-5555-4555-8555-555555555555",
  plan: {
    countryCode: "DE", countryName: "Germany", objective: "new-market",
    roles: ["Distributor"], targetCount: 1, queryLanguage: "en", userRequest: "find one",
  },
};

describe("claimed lead workflow remote execution", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the standalone LangGraph service and completes the claimed job", async () => {
    const result = {
      runId: "run", countryCode: "DE", countryName: "Germany", requested: 1,
      discovered: 1, assessed: 1, qualified: 1, accepted: 1, creditsUsed: 0,
      ragCitationCount: 3, graphThreadId: claim.graphThreadId, warnings: [],
    };
    mocks.invoke.mockResolvedValue(result);

    await expect(executeClaimedLeadWorkflow(claim)).resolves.toBe(result);
    expect(mocks.invoke).toHaveBeenCalledWith({
      userId: claim.userId, actionId: claim.actionId,
      graphThreadId: claim.graphThreadId, plan: claim.plan,
    });
    expect(mocks.complete).toHaveBeenCalledWith(claim, result);
    expect(mocks.fail).not.toHaveBeenCalled();
  });

  it("fails the job when the standalone service is unavailable without a local fallback", async () => {
    const error = new Error("独立 LangGraph 服务调用失败（lead_workflow）：connect ECONNREFUSED");
    mocks.invoke.mockRejectedValue(error);

    await expect(executeClaimedLeadWorkflow(claim)).rejects.toBe(error);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.fail).toHaveBeenCalledWith(claim, error);
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});
