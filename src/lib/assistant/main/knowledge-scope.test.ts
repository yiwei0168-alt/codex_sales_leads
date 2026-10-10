import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ search: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/rag/repository", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/rag/repository")>();
  return { ...actual, hybridSearch: mocks.search };
});

import { availableTools, productTools } from "./tools";
import {dispatchTool} from "./executor";
afterEach(()=>vi.unstubAllEnvs());

describe("knowledge question scope", () => {
  it('rejects guessed mode-forbidden tools before loading or executing them',async()=>{
    const context={userId:'owner',runId:'run',leaseToken:'lease',role:'member' as const,mode:'quick' as const};
    for(const name of ['discover_tools','describe_tool','execute_tool']){
      const output=await dispatchTool({id:'fixture',type:'function',function:{name,arguments:JSON.stringify(name==='discover_tools'?{}:{tool:'mail_sync',arguments:{}})}},context);
      if(name==='discover_tools')expect(JSON.stringify(output.data)).not.toContain('mail_sync');
      else expect(output.status).toBe('unavailable');
    }
    expect(availableTools({...context,knowledgeScope:['product']}).map(t=>t.id)).toEqual(['knowledge_search','knowledge_status']);
  });
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
  it("keeps vectorless Agent navigation opt-in and out of scoped knowledge-page questions",()=>{
    expect(availableTools({role:"member"}).some(tool=>tool.id==="vectorless_start")).toBe(false);
    vi.stubEnv("ENABLE_VECTORLESS_AGENT_SHADOW","1");
    const ids=availableTools({role:"member"}).map(tool=>tool.id);
    expect(ids.filter(id=>id.startsWith("vectorless_"))).toEqual([
      "vectorless_start","vectorless_search","vectorless_browse","vectorless_read",
      "vectorless_aggregate","vectorless_filter","vectorless_v3_candidates"]);
    expect(availableTools({role:"member",knowledgeScope:["product"]}).map(tool=>tool.id))
      .toEqual(["knowledge_search","knowledge_status"]);
  });
  it("rejects a saved or guessed shadow invocation when the feature is off or scoped",async()=>{
    const call={id:"call-1",type:"function" as const,function:{name:"execute_tool",arguments:JSON.stringify({
      tool:"vectorless_start",arguments:{question:"AP3000 ports"}})}};
    const context={userId:"owner",runId:"run",leaseToken:"lease",role:"member" as const};
    expect((await dispatchTool(call,context)).status).toBe("unavailable");
    vi.stubEnv("ENABLE_VECTORLESS_AGENT_SHADOW","1");
    expect((await dispatchTool(call,{...context,knowledgeScope:["product"] as const as ["product"]})).status).toBe("unavailable");
  });
});
