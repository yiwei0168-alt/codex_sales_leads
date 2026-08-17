import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock("./db", () => ({ query: queryMock, transaction: vi.fn() }));
vi.mock("./openai-provider", () => ({ embedTexts: vi.fn() }));

import { getKnowledgeStats, hybridSearch } from "./repository";

describe("RAG tenant isolation", () => {
  beforeEach(() => queryMock.mockReset());

  it("scopes knowledge statistics to the authenticated user", async () => {
    queryMock.mockResolvedValue([]);
    await getKnowledgeStats("user-a");
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("d.owner_id = $1"), ["user-a"]);
  });

  it("places the user predicate inside the eligible vector set", async () => {
    queryMock.mockResolvedValue([]);
    await hybridSearch("user-b", "router policy", [0.1, 0.2], {}, 4);
    const [sql, parameters] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("d.owner_id = $9");
    expect(parameters[8]).toBe("user-b");
  });
});
