import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ enqueue: vi.fn(), review: vi.fn(), screen: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireApiSession: async () => ({ userId: "owner" }) }));
vi.mock("@/lib/mailbox/work-queue", () => ({ enqueueLearning: mocks.enqueue }));
vi.mock("@/lib/mailbox/service", () => ({ reviewMailboxMessageForLearning: mocks.review }));
vi.mock("@/lib/mailbox/repository", () => ({ screenStoredMailboxMessages: mocks.screen }));
import { POST } from "./route";

const ids = Array.from({ length: 8 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`);
const request = (consent = true) => new Request("http://localhost/api/mailbox/screening", {
  method: "POST", body: JSON.stringify({ action: "authorize", consent, messageIds: ids }),
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("KIMI_API_KEY", "");
  vi.stubEnv("KIMI_MODEL", "kimi-k3");
  vi.stubEnv("OPENROUTER_API_KEY", "gateway-test");
  vi.stubEnv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1");
  mocks.enqueue.mockResolvedValue({ queued: 8 });
});
afterEach(() => vi.unstubAllEnvs());
describe("mailbox gateway authorization", () => {
  it("enqueues all eight authorized messages with only the gateway credential", async () => {
    expect((await POST(request())).status).toBe(202);
    expect(mocks.enqueue).toHaveBeenCalledWith("owner", ids);
  });
  it("still requires explicit mail consent", async () => {
    expect((await POST(request(false))).status).toBe(400);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("does not enqueue against invalid gateway configuration", async () => {
    vi.stubEnv("OPENROUTER_BASE_URL", "https://untrusted.example/api/v1");
    expect((await POST(request())).status).toBe(503);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});
