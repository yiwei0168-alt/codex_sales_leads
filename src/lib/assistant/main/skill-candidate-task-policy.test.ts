import {beforeEach,expect,it,vi} from 'vitest';
import {digest} from './contracts';
import {skillCandidateExecutionPolicy} from './skill-candidate-execution-policy';
import {enqueueSkillCandidateRuntimeTask,readCompletedSkillCandidateRuntimeTask} from './skill-candidate-runtime-task';
import {disableLocalAnalysisTracing} from './local-analysis-boundary';
const m=vi.hoisted(()=>({query:vi.fn(),enqueue:vi.fn(),source:vi.fn(),baseline:vi.fn(),identity:vi.fn(),freeze:vi.fn(),stored:null as null|{id:string;execution_spec:unknown;input:unknown;model_config:unknown}}));
vi.mock('@/lib/rag/db',()=>({tenantTransaction:async(_user:string,work:(client:unknown)=>Promise<unknown>)=>work({query:m.query}),
 withBoundTenantTransaction:async(_client:unknown,_user:string,work:()=>Promise<unknown>)=>work()}));
vi.mock('./repository',()=>({enqueueRun:m.enqueue,finishRun:vi.fn()}));
vi.mock('./skill-acceptance-freeze',()=>({inspectLockedSkillAcceptanceFreeze:m.freeze}));
vi.mock('./skill-runtime-candidate-source',()=>({prepareSkillRuntimeCandidateSource:m.source}));
vi.mock('./skill-acceptance-baseline',()=>({prepareSkillAcceptanceBaseline:m.baseline}));
vi.mock('./skill-runtime-identity',()=>({prepareSkillExecutionIdentity:m.identity}));
vi.mock('./skill-prospective-source',()=>({prepareSkillProspectiveSource:vi.fn()}));
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,sha='a'.repeat(64),model={model:'synthetic',version:'synthetic-v1'};
const identity={runtimeHash:sha,promptHash:sha,toolSchemaHash:sha,modelConfigHash:sha,scopeHash:sha};
const context={userId:id(1)},pin={runId:id(2),skillId:id(3),version:1,freezeId:id(4),caseId:'replay',evaluationId:id(5),arm:'candidate' as const};
const plan={protocol:'skill-acceptance-plan-v1',pin:{ownerId:id(1),skillId:id(3),version:1,contentHash:sha,sourceHash:sha},identity,
 frozenAt:'2026-10-21T00:00:00.000Z',expiresAt:'2026-10-22T00:00:00.000Z',
 cases:(['replay','negative','injection','permissions','shadow'] as const).map(category=>({id:category,category,inputHash:sha,sourceHash:sha,
  provenance:category==='replay'?'historical-task':category==='shadow'?'prospective-task':'safety-fixture'}))};
beforeEach(()=>{
 disableLocalAnalysisTracing();vi.resetAllMocks();m.stored=null;m.freeze.mockResolvedValue('active');m.identity.mockResolvedValue(identity);m.baseline.mockResolvedValue({projectionHash:sha});
 m.source.mockResolvedValue({safety:null,sourceHash:sha,taskInputHash:sha,skillSourceHash:sha,modelConfigHash:digest(model),
  snapshot:{context:{role:'member'},profile:{mode:'standard'},candidate:{value:{content_hash:sha}}}});
 m.query.mockImplementation(async(sql:string)=>{
  if(sql.includes('select r.*,u.role'))return {rows:[{role:'member',input:{content:'Synthetic task',knowledgeScope:['company']},model_config:model}]};
  if(sql.includes('pg_advisory_xact_lock'))return {rows:[]};
  if(sql.startsWith('select id,execution_spec,input,model_config'))return {rows:m.stored?[m.stored]:[]};
  if(sql.startsWith('select execution_spec'))return {rows:m.stored?[{execution_spec:m.stored.execution_spec}]:[]};
  if(sql.startsWith('select result,updated_at'))return {rows:[{result:{reply:'Synthetic completed result'},completed_at:'2026-10-21 01:00:00+00'}]};
  throw new Error('Unexpected task-policy query');
 });
 m.enqueue.mockImplementation(async(_user:string,input:unknown,config:unknown,execution:{spec:unknown})=>{
  m.stored={id:id(6),execution_spec:execution.spec,input,model_config:config};return {id:id(6)};
 });
});
it('binds the explicit quota and unchanged graph policy into spec and request identity',async()=>{
 await enqueueSkillCandidateRuntimeTask(context,{...pin,maximumModelCalls:3},plan);
 const saved=m.stored!;expect(saved.execution_spec).toMatchObject({executionPolicy:skillCandidateExecutionPolicy(3)});
 expect(saved.input).toMatchObject({requestKey:`skill-runtime:${digest(saved.execution_spec)}`});
 expect(m.query.mock.calls.findIndex(([sql])=>sql.includes('pg_advisory_xact_lock'))).toBeLessThan(m.query.mock.calls.findIndex(([sql])=>sql.startsWith('select id,execution_spec,input,model_config')));
});
it('reuses the exact evaluation without enqueueing twice and refuses a changed quota',async()=>{
 const first=await enqueueSkillCandidateRuntimeTask(context,{...pin,maximumModelCalls:3},plan);
 expect(await enqueueSkillCandidateRuntimeTask(context,{...pin,maximumModelCalls:3},plan)).toEqual(first);
 await expect(enqueueSkillCandidateRuntimeTask(context,{...pin,maximumModelCalls:4},plan)).rejects.toThrow('selection changed for existing evaluation');
 expect(m.enqueue).toHaveBeenCalledOnce();
});
it('keeps the default quota at eight and does not treat a bound quota as execution permission',async()=>{
 expect(await enqueueSkillCandidateRuntimeTask(context,pin,plan)).toMatchObject({executionAuthorized:false,automaticActivation:false,productionAgentEquivalent:false});
 expect(m.stored!.execution_spec).toMatchObject({executionPolicy:skillCandidateExecutionPolicy(8)});
});
it('derives a nondefault completed quota from its owned task when review omits the quota',async()=>{
 await enqueueSkillCandidateRuntimeTask(context,{...pin,maximumModelCalls:3},plan);
 const read=await readCompletedSkillCandidateRuntimeTask(context,{...pin,taskId:id(6)},plan);
 expect(read.spec.executionPolicy?.modelCallLimit).toBe(3);
 expect(m.query).toHaveBeenCalledWith(expect.stringContaining("status='completed' and control is null"),[id(6),context.userId]);
 await expect(readCompletedSkillCandidateRuntimeTask(context,{...pin,taskId:id(6),maximumModelCalls:4},plan)).rejects.toThrow('model quota changed');
});
it.each(['execution_spec','input','model_config'] as const)('refuses changed stored %s rather than reusing an unrelated task',async(field)=>{
 await enqueueSkillCandidateRuntimeTask(context,{...pin,maximumModelCalls:3},plan);
 m.stored![field]={changed:true};
 await expect(enqueueSkillCandidateRuntimeTask(context,{...pin,maximumModelCalls:3},plan)).rejects.toThrow('selection changed for existing evaluation');
 expect(m.enqueue).toHaveBeenCalledOnce();
});
it('refuses missing task policy rather than relabeling an old completed trial',async()=>{
 await enqueueSkillCandidateRuntimeTask(context,pin,plan);
 const value=m.stored!.execution_spec as Record<string,unknown>;delete value.executionPolicy;
 await expect(readCompletedSkillCandidateRuntimeTask(context,{...pin,taskId:id(6)},plan)).rejects.toThrow('execution policy unavailable');
});
it.each([0,65,1.5])('rejects invalid quota %s before admitting any task',async(maximumModelCalls)=>{
 await expect(enqueueSkillCandidateRuntimeTask(context,{...pin,maximumModelCalls},plan)).rejects.toThrow();expect(m.enqueue).not.toHaveBeenCalled();
});
