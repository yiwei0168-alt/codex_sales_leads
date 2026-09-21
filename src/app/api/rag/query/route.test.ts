import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), enqueue: vi.fn(), conversation: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireApiSession: mocks.session }));
vi.mock("@/lib/assistant/main/repository", () => ({ enqueueRun: mocks.enqueue }));
vi.mock("@/lib/assistant/repository", () => ({ getConversation: mocks.conversation }));

import { POST } from "./route";

describe("legacy knowledge question endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enqueue.mockResolvedValue({ id: "run-1", conversation_id: "conversation-1", status: "queued" });
    mocks.conversation.mockResolvedValue({ id: "conversation-1" });
  });

  it("queues authenticated questions for the main Agent without invoking legacy RAG", async () => {
    mocks.session.mockResolvedValue({ userId: "owner", role: "member" });
    const response = await POST(new Request("http://local/api/rag/query", { method: "POST",
      body: JSON.stringify({ question: "比较两款产品", filters: { collections: ["product"] } }) }));
    expect(response.status).toBe(202);
    expect(mocks.enqueue.mock.calls[0][1].knowledgeScope).toEqual(["product"]);
    expect((await response.json()).run.status).toBe("queued");
  });

  it("still requires authentication", async () => {
    mocks.session.mockResolvedValue(new Response(null, { status: 401 }));
    expect((await POST(new Request("http://local/api/rag/query", { method: "POST" }))).status).toBe(401);
  });
});
