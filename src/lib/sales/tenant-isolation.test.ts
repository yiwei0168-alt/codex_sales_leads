import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock("@/lib/rag/db", () => ({ query: queryMock, transaction: vi.fn() }));

import { getCurrentWorkspace } from "./repository";

describe("sales workspace tenant isolation", () => {
  beforeEach(() => queryMock.mockReset());

  it("selects the active workspace by authenticated owner", async () => {
    queryMock.mockResolvedValue([]);
    await expect(getCurrentWorkspace("user-a")).resolves.toBeNull();
    const [sql, parameters] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("owner_id = $1");
    expect(parameters).toEqual(["user-a", "mexico-pilot"]);
  });
});
