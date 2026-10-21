import {beforeEach,expect,it,vi} from 'vitest';
import {digest} from './contracts';
import {skillCandidateExecutionPolicy} from './skill-candidate-execution-policy';
import {auditSkillRuntimeCandidate} from './skill-runtime-candidate-audit';
import {disableLocalAnalysisTracing} from './local-analysis-boundary';
const m=vi.hoisted(()=>({completed:vi.fn(),source:vi.fn(),journal:vi.fn(),prepare:vi.fn(),query:vi.fn(),run:vi.fn()}));
vi.mock('@/lib/rag/db',()=>({tenantQuery:m.query}));
vi.mock('./skill-candidate-runtime-task',()=>({readCompletedSkillCandidateRuntimeTask:m.completed}));
vi.mock('./skill-runtime-candidate-source',()=>({prepareSkillRuntimeCandidateSource:m.source}));
vi.mock('./skill-candidate-audit',()=>({readSkillCandidateJournal:m.journal,prepareSkillModelJournalAudit:m.prepare}));
vi.mock('./skill-candidate-runner',()=>({runSkillCandidateArm:m.run}));
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,sha='a'.repeat(64);
const input={taskId:id(2),runId:id(3),skillId:id(4),version:1,freezeId:id(5),caseId:'synthetic',evaluationId:id(6),arm:'candidate' as const};
const messages=[{role:'user' as const,content:'Synthetic original question'}],profile={mode:'standard'},reply={role:'assistant' as const,content:'Synthetic answer'};
beforeEach(()=>{
 disableLocalAnalysisTracing();vi.resetAllMocks();
 const spec={snapshotHash:sha,executionPolicy:skillCandidateExecutionPolicy(3)},specHash=digest(spec);
 const completed={spec,specHash,reply:reply.content,role:'member',mode:'standard',knowledgeScope:['company'],completedAt:'2026-10-21T02:00:00.000Z'};
 const row={id:id(8),step:0,route_index:0,started_at:'2026-10-21T01:00:00.000Z',input:{messages,profile,index:0}};
 m.completed.mockResolvedValue(completed);m.source.mockResolvedValue({sourceHash:sha,taskInputHash:sha,modelConfigHash:sha,
  snapshot:{initialMessages:messages,candidate:{listing:{id:input.skillId}}}});
 m.journal.mockResolvedValue([row]);m.query.mockResolvedValue([]);
 m.prepare.mockReturnValue({snapshotHash:digest({protocol:'skill-runtime-candidate-v2-postgres',sourceHash:sha,taskId:input.taskId,specHash}),
  freezeId:input.freezeId,sourceKind:'production-runner-pending-verification',journalHash:sha,ordered:[row],
  selected:[{row,message:reply,request:{selectedRoute:{model:'synthetic'},originalResponse:{model:'synthetic',provider:'synthetic'},requestHash:sha,body:{tools:[]}}}]});
 m.run.mockImplementation(async(_snapshot:unknown,_arm:string,model:(request:unknown)=>Promise<unknown>)=>{
  expect(await model({messages,profile,step:0})).toEqual(reply);
  return {status:'completed',stopReason:null,reply:reply.content,candidateSkillUsed:true,messages:[...messages,reply],trace:[]};
 });
});
it('reconstructs one completed decision under its stored quota of three and binds that policy to the audit',async()=>{
 const out=await auditSkillRuntimeCandidate({userId:id(1)},input,{});
 expect(m.run.mock.calls[0][4]).toBe(3);
 expect(out.projection.executionPolicy).toEqual(skillCandidateExecutionPolicy(3));
 expect(out.projection.selectedModels).toHaveLength(1);expect(out.productionAgentEquivalent).toBe(false);
});
it('does not infer an execution quota from journal length when the stored policy is absent',async()=>{
 const saved=await m.completed();delete saved.spec.executionPolicy;m.completed.mockResolvedValue(saved);
 await expect(auditSkillRuntimeCandidate({userId:id(1)},input,{})).rejects.toThrow();expect(m.run).not.toHaveBeenCalled();
});
