import {beforeEach,expect,it,vi} from 'vitest';
import type {ModelMessage} from './contracts';
import {assertSkillRuntimeReadSources} from './skill-runtime-read-sources';
import {skillCandidateTaskSpecSchema,evaluationTaskSpecSchema} from './evaluation-task-spec';
const guards=vi.hoisted(()=>({skill:vi.fn(),memory:vi.fn(),knowledge:vi.fn(),private:vi.fn()}));
vi.mock('./skill-message-guard',()=>({assertCurrentSkillMessages:guards.skill}));
vi.mock('./memory-message-guard',()=>({assertCurrentMemoryMessages:guards.memory}));
vi.mock('./knowledge-message-guard',()=>({assertCurrentKnowledgeMessages:guards.knowledge}));
vi.mock('./private-replay-guard',()=>({assertCurrentPrivateReplayMessages:guards.private}));
beforeEach(()=>{for(const guard of Object.values(guards))guard.mockReset().mockResolvedValue(undefined);});
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,context={userId:id(1),runId:id(2),knowledgeScope:['company'] as ['company']};
const pair=(key:string,skillId:string):ModelMessage[]=>[
 {role:'assistant',content:null,tool_calls:[{id:key,type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool:'skill_read',arguments:{id:skillId}})}}]},
 {role:'tool',tool_call_id:key,content:'{"status":"success","data":{}}'},
];
it('only excludes the pinned virtual candidate output from ordinary Skill pin checks',async()=>{
 const messages=[...pair('candidate',id(3)),...pair('other',id(4))];
 await assertSkillRuntimeReadSources(context,messages,id(3));
 expect(guards.skill.mock.calls[0][1].filter((m:ModelMessage)=>m.role==='tool').map((m:ModelMessage)=>m.tool_call_id)).toEqual(['other']);
 expect(guards.knowledge).toHaveBeenCalledWith(id(1),messages,['company']);
 expect(guards.memory).toHaveBeenCalledWith(id(1),messages);expect(guards.private).toHaveBeenCalledWith(id(1),messages);
});
it.each(['skill','memory','knowledge','private'] as const)('propagates %s source withdrawal without a provider call',async domain=>{
 guards[domain].mockRejectedValue(new Error('Synthetic source withdrawn'));
 await expect(assertSkillRuntimeReadSources(context,[],id(3))).rejects.toThrow('source withdrawn');
});
it('binds the live execution marker to a captured prospective task only',()=>{
 const hash='a'.repeat(64),spec={schema:'skill-candidate-task-v1',freezeId:id(1),planHash:hash,caseId:'case',evaluationId:id(2),arm:'candidate',
  originalRunId:id(3),skillId:id(4),version:1,contentHash:hash,snapshotHash:hash,inputHash:hash,sourceHash:hash,identityHash:hash,readExecution:'registered-live-read-v1'};
 expect(skillCandidateTaskSpecSchema.safeParse(spec).success).toBe(false);
 expect(skillCandidateTaskSpecSchema.safeParse({...spec,prospectiveJobId:id(5),prospectiveProjectionHash:hash}).success).toBe(true);
 expect(evaluationTaskSpecSchema.safeParse({...spec,prospectiveJobId:id(5),prospectiveProjectionHash:hash}).success).toBe(true);
 expect(skillCandidateTaskSpecSchema.safeParse({...spec,prospectiveJobId:id(5),prospectiveProjectionHash:hash,safetyCaseId:'case'}).success).toBe(false);
});
