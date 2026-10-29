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
  expect(mocks.search).toHaveBeenCalledTimes(5);
  for (const call of mocks.search.mock.calls) {
    expect(call[2]).toBeNull();
    expect(call[5]).toEqual(ready ? vectors[0] : null);
  }
});
it('does not treat product families as mandatory V3 model keys or invent corroboration',async()=>{
 mocks.bge.mockResolvedValue(Array.from({length:3},()=>Array(1024).fill(0.01)));
 const product={id:'current-product',documentId:'current-document',collection:'product',title:'Current product',content:'Verified product evidence',sourceUrl:'/api/knowledge/assets/current',sourceType:'official',authorityLevel:1,headingPath:[],retrievalSignals:['keyword','structured'],corroborated:true,rankingScore:1,metadata:{releaseId:'current-release',structuredFacts:[{model:'MODEL-1',factKey:'category',factValue:'router',status:'verified'}]}};
 mocks.search.mockImplementation(async(_u,_q,_v,filters)=>filters.collections[0]==='product'&&!filters.structuredProductTerms?[product]:[]);
 const citations=await retrieveLeadRagContext('owner',plan);
 expect(citations).toEqual([expect.objectContaining({chunkId:'current-product',collection:'product',corroborated:true,retrievalSignals:['keyword','structured']})]);
 expect(mocks.search.mock.calls.filter(call=>call[3].collections[0]==='product')).toHaveLength(2);
 mocks.search.mockImplementation(async(_u,_q,_v,filters)=>filters.collections[0]==='product'&&!filters.structuredProductTerms?[{...product,corroborated:false,retrievalSignals:['keyword']}]:[]);
 expect((await retrieveLeadRagContext('owner',plan))[0].corroborated).toBe(false);
});
