import { beforeEach,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({query:vi.fn(),embed:vi.fn(),read:vi.fn()}));
vi.mock("@/lib/rag/db",()=>({tenantQuery:mocks.read,tenantTransaction:async(_id:string,work:(client:unknown)=>unknown)=>work({query:mocks.query})}));
vi.mock("@/lib/rag/openai-provider",()=>({embedTextsWithUsage:mocks.embed}));
import { saveManualMemory } from "./memory-save";
import { memoryEditorSchema,type MemoryEditorInput } from "./memory-editor";
import { searchOutreachKnowledge } from "./knowledge-repository";
const input:MemoryEditorInput={id:"11111111-1111-4111-8111-111111111111",mode:"edit",expectedUpdatedAt:"version-1",kind:"email-style",title:"Style",content:"Be concise",marketCodes:["GB"],channelRoles:["SI"],externalUseApproved:false,confirmed:true};
beforeEach(()=>{vi.clearAllMocks();mocks.query.mockImplementation(async(sql:string)=>({rows:sql.startsWith("select content")?[{content:input.content,kind:input.kind,updated_at:"version-1"}]:[]}));mocks.embed.mockResolvedValue({embeddings:[[0.1,0.2]],usage:[]});});
it("rejects unknown roles and missing edit version",()=>{
  expect(memoryEditorSchema.safeParse(input).success).toBe(true);
  expect(memoryEditorSchema.safeParse({...input,channelRoles:["typo"]}).success).toBe(false);
  expect(memoryEditorSchema.safeParse({...input,expectedUpdatedAt:undefined}).success).toBe(false);
});
it("scope-only edits reuse vector and preserve archived status",async()=>{
  expect(await saveManualMemory("owner",input)).toBe("ok");expect(mocks.embed).not.toHaveBeenCalled();
  const update=mocks.query.mock.calls.find(([sql])=>sql.startsWith("update user_outreach_memory"));
  expect(update?.[0]).not.toContain("status=");expect(update?.[1][8]).toBe(false);
});
it("rejects stale revisions before embedding",async()=>{
  expect(await saveManualMemory("owner",{...input,expectedUpdatedAt:"old"})).toBe("conflict");expect(mocks.embed).not.toHaveBeenCalled();
});
it("changed private memory saves locally and invalidates the historical vector",async()=>{
  mocks.embed.mockRejectedValue(new Error("must not call"));
  expect(await saveManualMemory("owner",{...input,content:"Changed content"})).toBe("ok");
  expect(mocks.embed).not.toHaveBeenCalled();
  const update=mocks.query.mock.calls.find(([sql])=>sql.startsWith("update user_outreach_memory"));
  expect(update?.[1][8]).toBe(true); expect(update?.[1][9]).toBeNull();
});
it("duplicate creates avoid another embedding",async()=>{
  expect(await saveManualMemory("owner",{...input,mode:"create"})).toBe("already-exists");expect(mocks.embed).not.toHaveBeenCalled();
});
it("private RAG enforces market and role scope, not just ranking",async()=>{
  mocks.read.mockResolvedValue([]);await searchOutreachKnowledge("owner","query",[0.1],["GB"],["SI"]);
  const sql=mocks.read.mock.calls[1][1];
  expect(sql).toContain("cardinality(market_codes)=0 or market_codes && $3::text[]");
  expect(sql).toContain("cardinality(channel_roles)=0 or channel_roles && $4::text[]");
});
it("local keyword retrieval includes memory with no legacy vector",async()=>{
  mocks.read.mockResolvedValue([]);await searchOutreachKnowledge("owner","query",null,["GB"],["SI"]);
  for(const call of mocks.read.mock.calls){
    expect(call[2][0]).toBeNull();
    const eligible=call[1].split(")")[0];
    expect(eligible).not.toContain("embedding is not null");
    expect(call[1]).toContain("where $1::vector is not null and embedding is not null");
  }
});
