import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock("./db", () => ({ tenantQuery: queryMock, tenantTransaction: vi.fn() }));
vi.mock("./openai-provider", () => ({ embedTexts: vi.fn() }));

import { getKnowledgeStats, hybridSearch, knowledgeMetadataChanged } from "./repository";

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
    expect(sql).not.toContain("e.document_metadata->>'category' = sm.category");
    expect(sql).not.toContain("d.status = 'active' and ch.embedding is not null");
    expect(sql).toContain("$1::vector is not null and embedding is not null");
    expect(sql).toContain("case when s.id is not null then 0.50 when k.id is not null then 0.42");
    expect(sql).toContain("n.chunk_index between e.chunk_index - 1 and e.chunk_index + 1");
  });

  it("keeps keyword and structured retrieval available for null-vector chunks", async () => {
    queryMock.mockResolvedValue([]);
    await hybridSearch("user-b", "MODEL-A ports", null, { lexicalQuery: '"MODEL-A" ("ports" OR "网口")' }, 4);
    const [, sql, parameters] = queryMock.mock.calls[0] as [string, string, unknown[]];
    expect(parameters[0]).toBeNull();
    expect(parameters[1]).toContain("MODEL-A");
    expect(sql).toContain("from eligible\n       where search_vector");
  });

  it("treats source metadata changes separately from content embeddings",()=>{
    const current={source_url:null,source_type:"text",authority_level:3,language:"zh-CN",market:null,company_id:null,product_id:null,metadata:{version:"1"}};
    const input={collection:"product" as const,externalId:"x",title:"x",content:"same",sourceType:"text",authorityLevel:3 as const,metadata:{version:"2"}};
    expect(knowledgeMetadataChanged(current,input)).toBe(true);
    expect(knowledgeMetadataChanged({...current,metadata:{version:"2"}},input)).toBe(false);
  });
});
