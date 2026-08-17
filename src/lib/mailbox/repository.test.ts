import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock("@/lib/rag/db", () => ({ query: queryMock, transaction: vi.fn() }));

import { getMailboxConnection, getMailboxCursors, listMailboxConnections } from "./repository";

describe("private mailbox repository", () => {
  beforeEach(() => queryMock.mockReset().mockResolvedValue([]));

  it("always scopes connection reads to the authenticated user", async () => {
    await listMailboxConnections("user-a");
    await getMailboxConnection("user-b", "connection-b");
    expect(queryMock.mock.calls[0][0]).toContain("where user_id = $1");
    expect(queryMock.mock.calls[0][1]).toEqual(["user-a"]);
    expect(queryMock.mock.calls[1][0]).toContain("where user_id = $1 and id = $2");
    expect(queryMock.mock.calls[1][1]).toEqual(["user-b", "connection-b"]);
  });

  it("scopes incremental cursors by both user and connection", async () => {
    await getMailboxCursors("user-a", "connection-a");
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("user_id = $1 and connection_id = $2"), ["user-a", "connection-a"]);
  });
});
