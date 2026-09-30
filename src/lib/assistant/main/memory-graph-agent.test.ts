import {afterEach,describe,expect,it,vi} from "vitest";

const mocks=vi.hoisted(()=>({search:vi.fn().mockResolvedValue({path:"postgres",rows:[]})}));
vi.mock("@/lib/knowledge/memory-graph-search",()=>({searchMemoryWithGraph:mocks.search}));

import {availableTools} from "./tools";
import {dispatchTool} from "./executor";

afterEach(()=>{vi.unstubAllEnvs();mocks.search.mockClear();});
const context={userId:"owner",runId:"run",leaseToken:"lease",role:"member" as const};
const call=(args:Record<string,unknown>)=>({id:"call-1",type:"function" as const,function:{name:"execute_tool",
  arguments:JSON.stringify({tool:"memory_observation_search",arguments:args})}});

describe("shadow graph memory access",()=>{
  it("rejects discovery and guessed execution unless shadow mode is explicitly enabled",async()=>{
    expect(availableTools(context).some(tool=>tool.id==="memory_observation_search")).toBe(false);
    expect((await dispatchTool(call({query:"preference"}),context)).status).toBe("unavailable");
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it("keeps memory out of knowledge-page scoped questions",async()=>{
    vi.stubEnv("ENABLE_MEMORY_GRAPH_AGENT_SHADOW","1");
    expect(availableTools({...context,knowledgeScope:["product"]}).some(tool=>tool.id==="memory_observation_search")).toBe(false);
    expect((await dispatchTool(call({query:"preference"}),{...context,knowledgeScope:["product"]})).status).toBe("unavailable");
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it("passes account, two times and scope to the PostgreSQL checked search",async()=>{
    vi.stubEnv("ENABLE_MEMORY_GRAPH_AGENT_SHADOW","1");
    const tool=availableTools(context).find(item=>item.id==="memory_observation_search")!;
    const input=tool.input.parse({query:"channel preference",businessAt:"2025-01-01T00:00:00.000Z",
      knownAt:"2025-06-01T00:00:00.000Z",marketCode:"DE",companyId:"cudy"});
    const result=await tool.execute(input,context);
    expect(result.status).toBe("success");
    expect(mocks.search).toHaveBeenCalledWith("owner","channel preference","2025-01-01T00:00:00.000Z",
      "2025-06-01T00:00:00.000Z",{marketCode:"DE",companyId:"cudy"});
  });
});
