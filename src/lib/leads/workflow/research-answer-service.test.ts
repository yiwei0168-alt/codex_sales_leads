import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({query:vi.fn(),state:vi.fn(),boundary:vi.fn()}));
vi.mock("@/lib/rag/db",()=>({tenantTransaction:async(_user:string,fn:(c:unknown)=>unknown)=>fn({query:m.query})}));
vi.mock("./graph",()=>({getProductionLeadWorkflowGraph:()=>({getState:m.state})}));
vi.mock("./pause",()=>({checkpointInvocation:m.boundary}));
import { researchAnswerService } from "./research-answer-service";
import { researchQuestionHash } from "./research-answer";
const question="Is Example independent of Cudy, and does it currently have any supplier, reseller, distribution, ownership, or contractual relationship with Cudy?";
const input={candidateId:"candidate-1",questionHash:researchQuestionHash(question),relationshipStatus:"none",answer:"No current relationship"};
beforeEach(()=>{
  vi.clearAllMocks();
  m.state.mockResolvedValue({next:["recover_incomplete_processing"],values:{assessmentReviews:[{candidateId:"candidate-1",status:"targeted-research-required",researchQuestion:question}],correctedCandidates:[{candidateId:"candidate-1",companyName:"Example"}]}});
  m.query.mockImplementation(async(sql:string)=>({rows:sql.includes("from assistant_action")?[{status:"failed",payload:{}}]
    :sql.includes("from lead_workflow_job")?[{status:"failed",graph_thread_id:"thread-1",attempts:1}]
    :sql.includes("insert into lead_research_answer")?[{id:"receipt",receivedAt:"2026-10-30T00:00:00Z"}]:[]}));
});
it("saves before queueing and scopes every database access to the authenticated owner",async()=>{
  expect(await researchAnswerService("owner","action",input)).toMatchObject({queued:true,duplicate:false,status:"queued"});
  const calls=m.query.mock.calls;
  expect(calls.findIndex(([sql])=>sql.includes("insert into lead_research_answer"))).toBeLessThan(calls.findIndex(([sql])=>sql.includes("update lead_workflow_job")));
  for(const [,args] of calls)expect(args).toContain("owner");
});
it("returns an identical replay without scheduling another execution",async()=>{
  const original=m.query.getMockImplementation()!;
  m.query.mockImplementation(async(sql:string,args:unknown[])=>sql.includes("from lead_research_answer")?{rows:[{...input,id:"saved"}]}:original(sql,args));
  expect(await researchAnswerService("owner","action",input)).toMatchObject({duplicate:true,queued:false});
  expect(m.state).not.toHaveBeenCalled();
  expect(m.query.mock.calls.some(([sql])=>/^\s*(insert|update)\b/.test(sql))).toBe(false);
  await expect(researchAnswerService("owner","action",{...input,answer:"Different answer"})).rejects.toThrow("不能覆盖");
});
it.each(["exists","unknown"])("keeps %s answers pending",async(relationshipStatus)=>{
  expect(await researchAnswerService("owner","action",{...input,relationshipStatus})).toMatchObject({queued:false,status:"failed"});
  expect(m.query.mock.calls.some(([sql])=>sql.includes("update lead_workflow_job"))).toBe(false);
});
it("rejects stale questions, running work, and other accounts before any mutation",async()=>{
  await expect(researchAnswerService("owner","action",{...input,questionHash:"f".repeat(64)})).rejects.toThrow("已变化");
  m.query.mockResolvedValue({rows:[]});
  await expect(researchAnswerService("peer","action",input)).rejects.toThrow("无权访问");
  expect(m.query.mock.calls.some(([sql])=>/insert|update/.test(sql)&&!sql.includes("for update"))).toBe(false);
});
