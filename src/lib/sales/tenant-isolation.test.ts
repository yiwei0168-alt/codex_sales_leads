import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock, transactionMock } = vi.hoisted(() => ({ queryMock: vi.fn(), transactionMock: vi.fn() }));

vi.mock("@/lib/rag/db", () => ({ query: queryMock, transaction: transactionMock }));

import { getCurrentWorkspace, updateWorkspaceMode } from "./repository";

describe("sales workspace tenant isolation", () => {
  beforeEach(() => { queryMock.mockReset(); transactionMock.mockReset(); });

  it("selects the active workspace by authenticated owner", async () => {
    queryMock.mockResolvedValue([]);
    await expect(getCurrentWorkspace("user-a")).resolves.toBeNull();
    const [sql, parameters] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("owner_id = $1");
    expect(parameters).toEqual(["user-a", "global-sales"]);
  });

  it("scopes contacts and email candidates to the selected workspace", async () => {
    queryMock.mockImplementation((sql?: string) => {
      if (String(sql).includes("from market_workspace")) {
        return Promise.resolve([{
          id: "workspace-a", slug: "global-sales", name: "A", market: "Global",
          country_code: "WW", mode: "new-market", objective: "A only",
        }]);
      }
      return Promise.resolve([]);
    });
    await getCurrentWorkspace("user-a");
    const statements = queryMock.mock.calls.map(([sql]) => String(sql));
    expect(statements.some((sql) => sql.includes("ct.workspace_id = $1"))).toBe(true);
    expect(statements.some((sql) => sql.includes("em.workspace_id = $1"))).toBe(true);
  });

  it("records workspace mode changes without reusing a parameter as uuid and text", async () => {
    const clientQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: "workspace-a" }] })
      .mockResolvedValueOnce({ rows: [] });
    transactionMock.mockImplementation(async (run: (client: { query: typeof clientQuery }) => Promise<unknown>) => run({ query: clientQuery }));

    await updateWorkspaceMode("growth", "user-a");

    const [auditSql, auditParameters] = clientQuery.mock.calls[1] as [string, unknown[]];
    expect(auditSql).toContain("values ($1, $2, 'workspace', $3");
    expect(auditParameters).toEqual(["workspace-a", "user-a", "workspace-a", JSON.stringify({ mode: "growth" })]);
  });
});
