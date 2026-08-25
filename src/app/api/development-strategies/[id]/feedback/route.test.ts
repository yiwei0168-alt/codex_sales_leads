import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireApiSession, runDevelopmentFeedbackAgent } = vi.hoisted(() => ({
  requireApiSession: vi.fn(), runDevelopmentFeedbackAgent: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireApiSession }));
vi.mock("@/lib/outreach/graph", () => ({ runDevelopmentFeedbackAgent }));

import { POST } from "./route";

const draftId = "10000000-0000-4000-8000-000000000001";
const currentBody = "Dear partner,\n\nThis is the human-edited development email body that the revision must preserve and improve.\n\nBest regards";

describe("development feedback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiSession.mockResolvedValue({ userId: "user-1" });
    runDevelopmentFeedbackAgent.mockResolvedValue({ feedbackId: "feedback-1" });
  });

  it("passes the reviewed body, source revision and explicit memory consent to the agent", async () => {
    const request = new Request(`http://localhost/api/development-strategies/${draftId}/feedback`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ feedback: "Use softer CTA", currentBody, sourceRevision: 3, allowMemory: true }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: draftId }) });
    expect(response.status).toBe(200);
    expect(runDevelopmentFeedbackAgent).toHaveBeenCalledWith("user-1", {
      draftId, feedback: "Use softer CTA", currentBody, sourceRevision: 3, allowMemory: true,
    });
  });

  it("rejects feedback without the current human-reviewed body", async () => {
    const request = new Request(`http://localhost/api/development-strategies/${draftId}/feedback`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ feedback: "Use softer CTA", sourceRevision: 1 }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: draftId }) });
    expect(response.status).toBe(400);
    expect(runDevelopmentFeedbackAgent).not.toHaveBeenCalled();
  });

  it("returns a conflict when the reviewed revision is stale", async () => {
    runDevelopmentFeedbackAgent.mockRejectedValue(new Error("草稿已产生新版本，请刷新后重新评价"));
    const request = new Request(`http://localhost/api/development-strategies/${draftId}/feedback`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ feedback: "Use softer CTA", currentBody, sourceRevision: 2, allowMemory: false }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: draftId }) });
    expect(response.status).toBe(409);
  });
});
