import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock("./db", () => ({ tenantQuery: queryMock, tenantTransaction: vi.fn() }));
vi.mock("./openai-provider", () => ({ embedTexts: vi.fn() }));

import { getKnowledgeStats, hybridSearch } from "./repository";

describe("RAG tenant isolation", () => {
  beforeEach(() => queryMock.mockReset());

  it("scopes knowledge statistics to the authenticated user", async () => {
    queryMock.mockResolvedValue([]);
    await getKnowledgeStats("user-a");
    const [tenant, sql, parameters] = queryMock.mock.calls[0] as [string, string, unknown[]];
    expect(tenant).toBe("user-a");
    expect(sql).toContain("d.visibility = 'shared'");
    expect(sql).toContain("d.visibility = 'private' and d.owner_id = $1");
    expect(parameters).toEqual(["user-a"]);
  });

  it("places the user predicate inside the eligible vector set", async () => {
    queryMock.mockResolvedValue([]);
    await hybridSearch("user-b", "router policy", [0.1, 0.2], {}, 4);
    const [tenant, sql, parameters] = queryMock.mock.calls[0] as [string, string, unknown[]];
    expect(tenant).toBe("user-b");
    expect(sql).toContain("d.visibility = 'shared'");
    expect(sql).toContain("d.visibility = 'private' and d.owner_id = $9");
    expect(parameters[8]).toBe("user-b");
  });
});
