import { describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ requireApiSession: session }));
vi.mock("@/lib/sales/repository", () => ({ getCurrentWorkspace: vi.fn() }));
import { PATCH } from "./route";
describe("retired workspace mode", () => {
  it("returns explicit removal and preserves the authentication boundary", async () => {
    session.mockResolvedValue({ userId: "fixture" });
    const response = await PATCH();
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({ code: "capability_removed" });
    session.mockResolvedValue(new Response(null, { status: 401 }));
    expect((await PATCH()).status).toBe(401);
  });
});
