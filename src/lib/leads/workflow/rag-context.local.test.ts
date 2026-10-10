import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ bge: vi.fn(), search: vi.fn() }));
vi.mock("@/lib/rag/bge-client", () => ({ embedTextsWithBge: mocks.bge }));
vi.mock("@/lib/rag/repository", () => ({ hybridSearch: mocks.search }));
import { retrieveLeadRagContext } from "./rag-context";
import { plan } from "../../../../scripts/workflow-recovery-fixtures";
beforeEach(() => { vi.clearAllMocks(); mocks.search.mockResolvedValue([]); });
it.each([true, false])("uses the local lane and lexical fallback (BGE ready=%s)", async ready => {
  const vectors = Array.from({length: 3}, () => Array(1024).fill(0.01));
  if (ready) mocks.bge.mockResolvedValue(vectors); else mocks.bge.mockRejectedValue(new Error("offline"));
  const usage = vi.fn();
  await retrieveLeadRagContext("owner", plan, {onEmbeddingUsage: usage});
  expect(usage).toHaveBeenCalledWith([]);
  expect(mocks.search).toHaveBeenCalledTimes(4);
  for (const call of mocks.search.mock.calls) {
    expect(call[2]).toBeNull();
    expect(call[5]).toEqual(ready ? vectors[0] : null);
  }
});
