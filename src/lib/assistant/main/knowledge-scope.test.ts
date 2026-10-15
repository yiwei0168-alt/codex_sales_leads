import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ search: vi.fn().mockResolvedValue([]),bge:vi.fn().mockResolvedValue([[0.1]]) }));
vi.mock("@/lib/rag/bge-client",()=>({embedTextsWithBge:mocks.bge}));
vi.mock("@/lib/rag/repository", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/rag/repository")>();
  return { ...actual, hybridSearch: mocks.search };
});

import { availableTools, productTools } from "./tools";
import {dispatchTool} from "./executor";
afterEach(()=>{vi.unstubAllEnvs();mocks.search.mockClear();mocks.bge.mockReset();mocks.bge.mockResolvedValue([[0.1]]);});

describe("knowledge question scope", () => {
  it('rejects guessed mode-forbidden tools before loading or executing them',async()=>{
    const context={userId:'owner',runId:'run',leaseToken:'lease',role:'member' as const,mode:'quick' as const};
    for(const name of ['discover_tools','describe_tool','execute_tool']){
      const output=await dispatchTool({id:'fixture',type:'function',function:{name,arguments:JSON.stringify(name==='discover_tools'?{}:{tool:'mail_sync',arguments:{}})}},context);
      if(name==='discover_tools')expect(JSON.stringify(output.data)).not.toContain('mail_sync');
      else expect(output.status).toBe('unavailable');
    }
    expect(availableTools({...context,knowledgeScope:['product']}).map(t=>t.id)).toEqual(['knowledge_search','knowledge_status','knowledge_originals','knowledge_compare']);
  });
  it("exposes only knowledge tools to a scoped question", () => {
    expect(availableTools({ role: "member", knowledgeScope: ["product"] }).map(tool => tool.id))
      .toEqual(["knowledge_search", "knowledge_status", "knowledge_originals", "knowledge_compare"]);
  });
  it("enforces the saved knowledge-page scope even if a model requests other collections", async () => {
    const search = productTools.find(tool => tool.id === "knowledge_search")!;
    const input = search.input.parse({ query: "Compare models", collections: ["company"], limit: 8 });
    await search.execute(input, {
      userId: "owner", runId: "run", leaseToken: "lease", role: "member", knowledgeScope: ["product"],
    });
    expect(mocks.search).toHaveBeenCalledWith("owner", "Compare models", null, { collections: ["product"] }, 8);
  });
  it('uses local BGE with controlled lexical retrieval when the pilot baseline flag is enabled',async()=>{
    vi.stubEnv('ENABLE_MAIN_AGENT_LOCAL_BGE_SEARCH','1');
    const search=productTools.find(tool=>tool.id==='knowledge_search')!;
    const output=await search.execute(search.input.parse({query:'Compare models',collections:['company']}),{
      userId:'owner',runId:'run',leaseToken:'lease',role:'member',knowledgeScope:['product'],
    });
    expect(mocks.bge).toHaveBeenCalledWith(['Compare models']);
    expect(mocks.search).toHaveBeenCalledWith('owner','Compare models',null,
      expect.objectContaining({collections:['product'],lexicalQuery:expect.any(String)}),8,[0.1]);
    expect(output.status).toBe('success');
  });
  it('marks the local BGE lane as partial when it is unavailable',async()=>{
    vi.stubEnv('ENABLE_MAIN_AGENT_LOCAL_BGE_SEARCH','1');
    mocks.bge.mockRejectedValueOnce(new Error('offline'));
    const search=productTools.find(tool=>tool.id==='knowledge_search')!;
    const output=await search.execute(search.input.parse({query:'Compare models'}),{
      userId:'owner',runId:'run',leaseToken:'lease',role:'member',knowledgeScope:['product'],
    });
    expect(mocks.search).toHaveBeenCalledWith('owner','Compare models',null,
      expect.objectContaining({collections:['product'],lexicalQuery:expect.any(String)}),8,null);
    expect(output.status).toBe('partial');
    expect(output.missing).toContain('Local BGE unavailable; vector lane omitted');
  });
  it("keeps vectorless Agent navigation opt-in and out of scoped knowledge-page questions",()=>{
    expect(availableTools({role:"member"}).some(tool=>tool.id==="vectorless_start")).toBe(false);
    vi.stubEnv("ENABLE_VECTORLESS_AGENT_SHADOW","1");
    const ids=availableTools({role:"member"}).map(tool=>tool.id);
    expect(ids.filter(id=>id.startsWith("vectorless_"))).toEqual([
      "vectorless_start","vectorless_search","vectorless_browse","vectorless_read",
      "vectorless_aggregate","vectorless_filter","vectorless_v3_candidates"]);
    expect(availableTools({role:"member",knowledgeScope:["product"]}).map(tool=>tool.id))
      .toEqual(["knowledge_search","knowledge_status","knowledge_originals","knowledge_compare"]);
  });
  it("rejects a saved or guessed shadow invocation when the feature is off or scoped",async()=>{
    const call={id:"call-1",type:"function" as const,function:{name:"execute_tool",arguments:JSON.stringify({
      tool:"vectorless_start",arguments:{question:"AP3000 ports"}})}};
    const context={userId:"owner",runId:"run",leaseToken:"lease",role:"member" as const};
    expect((await dispatchTool(call,context)).status).toBe("unavailable");
    vi.stubEnv("ENABLE_VECTORLESS_AGENT_SHADOW","1");
    expect((await dispatchTool(call,{...context,knowledgeScope:["product"] as const as ["product"]})).status).toBe("unavailable");
  });
  it('allows scoped shadow tools only for explicitly selected accounts with the feature on',()=>{
    const context={role:'member' as const,userId:'pilot',knowledgeScope:['product' as const],mode:'quick' as const};
    vi.stubEnv('VECTORLESS_AGENT_SHADOW_USER_IDS','pilot');
    expect(availableTools(context).some(t=>t.id.startsWith('vectorless_'))).toBe(false);
    vi.stubEnv('ENABLE_VECTORLESS_AGENT_SHADOW','1');
    const tools=availableTools(context);
    expect(tools.filter(t=>t.id.startsWith('vectorless_'))).toHaveLength(7);
    expect(tools.every(t=>t.effect==='read')).toBe(true);
    expect(availableTools({...context,userId:'other'}).some(t=>t.id.startsWith('vectorless_'))).toBe(false);
  });
  it('keeps evaluation baseline tools isolated on a whitelisted account',async()=>{
    vi.stubEnv('VECTORLESS_AGENT_SHADOW_USER_IDS','pilot');
    vi.stubEnv('ENABLE_VECTORLESS_AGENT_SHADOW','1');
    const context={userId:'pilot',runId:'run',leaseToken:'lease',role:'member' as const,
      knowledgeScope:['product' as const],mode:'quick' as const};
    const baseline={...context,evaluationArm:'baseline' as const};
    const candidate={...context,evaluationArm:'candidate' as const};
    expect(availableTools(baseline).map(tool=>tool.id))
      .toEqual(['knowledge_search','knowledge_status','knowledge_originals','knowledge_compare']);
    expect(availableTools(candidate).filter(tool=>tool.id.startsWith('vectorless_'))).toHaveLength(7);
    const discover={id:'call-1',type:'function' as const,function:{name:'discover_tools',arguments:'{}'}};
    expect(JSON.stringify((await dispatchTool(discover,baseline)).data)).not.toContain('vectorless_');
    const describe={id:'call-2',type:'function' as const,function:{name:'describe_tool',
      arguments:JSON.stringify({tool:'vectorless_start'})}};
    expect((await dispatchTool(describe,baseline)).status).toBe('unavailable');
    const execute={id:'call-3',type:'function' as const,function:{name:'execute_tool',
      arguments:JSON.stringify({tool:'vectorless_start',arguments:{question:'test'}})}};
    expect((await dispatchTool(execute,baseline)).status).toBe('unavailable');
  });
  it('exposes no evaluation tools when a runner omits the account or knowledge scope',async()=>{
    const context={userId:'pilot',runId:'run',leaseToken:'lease',role:'member' as const};
    expect(availableTools(context).some(tool=>tool.effect!=='read')).toBe(true);
    for(const evaluationArm of ['baseline','candidate'] as const){
      const arm={...context,evaluationArm};
      expect(availableTools(arm)).toEqual([]);
      expect(availableTools({...arm,userId:undefined,knowledgeScope:['product']})).toEqual([]);
      const discover={id:'discover',type:'function' as const,function:{name:'discover_tools',arguments:'{}'}};
      expect(JSON.stringify((await dispatchTool(discover,arm)).data)).not.toContain('schedule_create');
      const describe={id:'describe',type:'function' as const,function:{name:'describe_tool',
        arguments:JSON.stringify({tool:'schedule_create'})}};
      expect((await dispatchTool(describe,arm)).status).toBe('unavailable');
      const execute={id:'execute',type:'function' as const,function:{name:'execute_tool',
        arguments:JSON.stringify({tool:'schedule_create',arguments:{}})}};
      expect((await dispatchTool(execute,arm)).status).toBe('unavailable');
    }
  });
});
