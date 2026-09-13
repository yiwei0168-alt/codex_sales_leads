import { beforeEach, describe, expect, it, vi } from "vitest";

const { transactionMock,tenantMock } = vi.hoisted(() => ({ transactionMock: vi.fn(),tenantMock:vi.fn() }));

vi.mock("@/lib/rag/db", () => ({ tenantTransaction: transactionMock,tenantQuery:tenantMock }));

import { getCurrentWorkspace, updateWorkspaceMode } from "./repository";

describe("sales workspace tenant isolation", () => {
  beforeEach(() => { transactionMock.mockReset();tenantMock.mockReset().mockResolvedValue([]); });

  it("selects the active workspace by authenticated owner", async () => {
    await expect(getCurrentWorkspace("user-a")).resolves.toBeNull();
    const [owner,sql, parameters] = tenantMock.mock.calls[0] as [string,string, unknown[]];
    expect(owner).toBe("user-a");
    expect(sql).toContain("owner_id = $1");
    expect(parameters).toEqual(["user-a", "global-sales"]);
  });

  it("scopes contacts and email candidates to the selected workspace", async () => {
    tenantMock.mockImplementation((_owner:string,sql?: string) => {
      if (String(sql).includes("from market_workspace")) {
        return Promise.resolve([{
          id: "workspace-a", slug: "global-sales", name: "A", market: "Global",
          country_code: "WW", mode: "new-market", objective: "A only",
        }]);
      }
      return Promise.resolve([]);
    });
    await getCurrentWorkspace("user-a");
    expect(tenantMock.mock.calls.every(([userId])=>userId==="user-a")).toBe(true);
    expect(tenantMock.mock.calls.some(([,sql])=>String(sql).includes("m.user_id=$1"))).toBe(true);
    const statements = tenantMock.mock.calls.map(([,sql]) => String(sql));
    expect(statements.some((sql) => sql.includes("ct.workspace_id = $1"))).toBe(true);
    expect(statements.some((sql) => sql.includes("em.workspace_id = $1"))).toBe(true);
  });

  it("records workspace mode changes without reusing a parameter as uuid and text", async () => {
    const clientQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: "workspace-a" }] })
      .mockResolvedValueOnce({ rows: [] });
    transactionMock.mockImplementation(async (_owner:string,run: (client: { query: typeof clientQuery }) => Promise<unknown>) => run({ query: clientQuery }));

    await updateWorkspaceMode("growth", "user-a");
    expect(transactionMock).toHaveBeenCalledWith("user-a",expect.any(Function));

    const [auditSql, auditParameters] = clientQuery.mock.calls[1] as [string, unknown[]];
    expect(auditSql).toContain("values ($1, $2, 'workspace', $3");
    expect(auditParameters).toEqual(["workspace-a", "user-a", "workspace-a", JSON.stringify({ mode: "growth" })]);
  });
});
