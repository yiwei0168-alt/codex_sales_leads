import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock, transactionMock, clientQuery } = vi.hoisted(() => ({
  queryMock: vi.fn(), transactionMock: vi.fn(), clientQuery: vi.fn(),
}));

vi.mock("@/lib/rag/db", () => ({ tenantQuery: queryMock, tenantTransaction: transactionMock }));

import { getMailboxConnection, getMailboxCursors, listMailboxConnections,updateMailboxConnectionSettings,listMailboxLearningQueue, startMailboxSyncRun, persistMailboxImport } from "./repository";

describe("private mailbox repository", () => {
  beforeEach(() => {
    queryMock.mockReset().mockResolvedValue([]);
    clientQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    transactionMock.mockReset().mockImplementation(async (_userId, callback) => callback({ query: clientQuery }));
  });

  it.each([{ rows: [] }, { rows: [{ status: "disabled" }] }])("rejects sync admission after a missing/disabled connection lock", async ({ rows }) => {
    clientQuery.mockResolvedValueOnce({ rows });
    await expect(startMailboxSyncRun("user-a", "connection-a")).rejects.toThrow("邮箱连接不存在或已断开");
    expect(clientQuery).toHaveBeenCalledTimes(1);
    expect(clientQuery.mock.calls[0]).toEqual([
      expect.stringContaining("where user_id = $1 and id = $2 for update"), ["user-a", "connection-a"],
    ]);
  });

  it.each(["active", "error"])("starts a %s connection run inside the connection-lock transaction", async (status) => {
    clientQuery.mockResolvedValueOnce({ rows: [{ status }] }).mockResolvedValueOnce({ rows: [{ id: "run-a" }] });
    await expect(startMailboxSyncRun("user-a", "connection-a", "model-a")).resolves.toBe("run-a");
    expect(transactionMock.mock.calls[0][0]).toBe("user-a");
    expect(clientQuery.mock.calls[1][1]).toEqual(["user-a", "connection-a", "model-a"]);
    expect(queryMock).not.toHaveBeenCalled();
  });

  const importInput = { userId: "user-a", connectionId: "connection-a", runId: "run-a", messages: [], cursors: [], folders: 1, discovered: 0 };

  it("does not import or advance cursors for a disabled connection", async () => {
    clientQuery.mockResolvedValueOnce({ rows: [{ email: "fixture@example.invalid", status: "disabled" }] });
    await expect(persistMailboxImport(importInput)).rejects.toThrow("邮箱连接不存在或已断开");
    expect(clientQuery).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing, finished or differently bound run before any import writes", async () => {
    clientQuery.mockResolvedValueOnce({ rows: [{ email: "fixture@example.invalid", status: "active" }] });
    await expect(persistMailboxImport(importInput)).rejects.toThrow("邮箱同步任务已结束或不属于此连接");
    expect(clientQuery).toHaveBeenCalledTimes(2);
    expect(clientQuery.mock.calls[1]).toEqual([
      expect.stringContaining("connection_id = $3 and status = 'running' for update"), ["run-a", "user-a", "connection-a"],
    ]);
  });

  it("accepts an empty import only after connection and running-task checks", async () => {
    clientQuery.mockResolvedValueOnce({ rows: [{ email: "fixture@example.invalid", status: "active" }] })
      .mockResolvedValueOnce({ rows: [{ id: "run-a" }] });
    await expect(persistMailboxImport(importInput)).resolves.toEqual({ imported: 0, skipped: 0, storedMessages: [] });
    expect(clientQuery.mock.calls[0][0]).toContain("for update");
    expect(clientQuery.mock.calls[2][0]).toContain("product_catalog");
  });

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
