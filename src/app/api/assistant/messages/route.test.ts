import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), enqueue: vi.fn(), conversation: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireApiSession: mocks.session }));
vi.mock("@/lib/assistant/main/repository", () => ({ enqueueRun: mocks.enqueue }));
vi.mock("@/lib/assistant/repository", () => ({ getConversation: mocks.conversation }));

import { POST } from "./route";

describe("assistant message entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MAIN_AGENT_ROLLOUT;
    mocks.enqueue.mockResolvedValue({ id: "run-1", conversation_id: "conversation-1", status: "queued" });
    mocks.conversation.mockResolvedValue({ id: "conversation-1", messages: [], actions: [] });
  });

  it.each(["admin", "member"])("queues %s messages for the main Agent without a rollout flag", async role => {
    mocks.session.mockResolvedValue({ userId: "00000000-0000-4000-8000-000000000001", role });
    const response = await POST(new Request("http://local/api/assistant/messages", {
      method: "POST", body: JSON.stringify({ content: "请查看现有线索", attachments: [] }),
    }));
    expect(response.status).toBe(202);
    expect(mocks.enqueue).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
      expect.objectContaining({ content: "请查看现有线索", attachments: [] }),
      expect.objectContaining({ model: "z-ai/glm-5.3" }),
    );
    expect((await response.json()).run).toEqual({ id: "run-1", status: "queued" });
  });

  it("keeps an existing conversation and attachment on the durable run", async () => {
    mocks.session.mockResolvedValue({ userId: "00000000-0000-4000-8000-000000000001", role: "member" });
    const attachmentId = "00000000-0000-4000-8000-000000000002";
    const conversationId = "00000000-0000-4000-8000-000000000003";
    const response = await POST(new Request("http://local/api/assistant/messages", {
      method: "POST", body: JSON.stringify({ conversationId, content: "根据附件回答问题", attachments: [{ assetId: attachmentId }] }),
    }));
    expect(response.status).toBe(202);
    expect(mocks.enqueue.mock.calls[0][1]).toEqual(expect.objectContaining({
      conversationId, attachments: [{ assetId: attachmentId }],
    }));
  });

  it("persists the selected knowledge collections for a knowledge-base question", async () => {
    mocks.session.mockResolvedValue({ userId: "00000000-0000-4000-8000-000000000001", role: "member" });
    const response = await POST(new Request("http://local/api/assistant/messages", {
      method: "POST", body: JSON.stringify({ content: "比较两款产品", knowledgeScope: ["product"] }),
    }));
    expect(response.status).toBe(202);
    expect(mocks.enqueue.mock.calls[0][1].knowledgeScope).toEqual(["product"]);
  });
});
