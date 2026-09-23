import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock("@/lib/rag/db", () => ({ tenantQuery: queryMock, tenantTransaction: vi.fn() }));

import { getMailboxConnection, getMailboxCursors, listMailboxConnections,updateMailboxConnectionSettings,listMailboxLearningQueue } from "./repository";

describe("private mailbox repository", () => {
  beforeEach(() => queryMock.mockReset().mockResolvedValue([]));

  it("always scopes connection reads to the authenticated user", async () => {
    await listMailboxConnections("user-a");
    await getMailboxConnection("user-b", "connection-b");
    expect(queryMock.mock.calls[0][0]).toBe("user-a");
    expect(queryMock.mock.calls[0][1]).toContain("where user_id = $1");
    expect(queryMock.mock.calls[0][2]).toEqual(["user-a"]);
    expect(queryMock.mock.calls[1][0]).toBe("user-b");
    expect(queryMock.mock.calls[1][1]).toContain("where user_id = $1 and id = $2");
    expect(queryMock.mock.calls[1][2]).toEqual(["user-b", "connection-b"]);
  });

  it("scopes incremental cursors by both user and connection", async () => {
    await getMailboxCursors("user-a", "connection-a");
    expect(queryMock).toHaveBeenCalledWith("user-a", expect.stringContaining("user_id = $1 and connection_id = $2"), ["user-a", "connection-a"]);
  });

  it("requires verified SMTP when settings enable sending",async()=>{
    await updateMailboxConnectionSettings("user-a","connection-a","Sales","send-enabled");
    expect(queryMock.mock.calls[0][1]).toContain("smtp_verified_at is not null");
    expect(queryMock.mock.calls[0][2]).toEqual(["user-a","connection-a","Sales","send-enabled"]);
  });

  it("paginates the current user's learning queue",async()=>{
    await listMailboxLearningQueue("user-a",8,8);
    expect(queryMock.mock.calls[0][1]).toContain("user_id=$1");
    expect(queryMock.mock.calls[1][2]).toEqual(["user-a",8,8]);
  });
});
