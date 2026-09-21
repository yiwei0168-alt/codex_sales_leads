import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ search: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/rag/repository", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/rag/repository")>();
  return { ...actual, hybridSearch: mocks.search };
});

import { availableTools, productTools } from "./tools";

describe("knowledge question scope", () => {
  it("exposes only knowledge tools to a scoped question", () => {
    expect(availableTools({ role: "member", knowledgeScope: ["product"] }).map(tool => tool.id))
      .toEqual(["knowledge_search", "knowledge_status"]);
  });
  it("enforces the saved knowledge-page scope even if a model requests other collections", async () => {
    const search = productTools.find(tool => tool.id === "knowledge_search")!;
    const input = search.input.parse({ query: "Compare models", collections: ["company"], limit: 8 });
    await search.execute(input, {
      userId: "owner", runId: "run", leaseToken: "lease", role: "member", knowledgeScope: ["product"],
    });
    expect(mocks.search).toHaveBeenCalledWith("owner", "Compare models", null, { collections: ["product"] }, 8);
  });
});
