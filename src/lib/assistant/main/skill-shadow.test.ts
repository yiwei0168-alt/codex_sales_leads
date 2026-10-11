import {beforeEach,expect,it,vi} from 'vitest';
import {digest} from './contracts';
const mocks=vi.hoisted(()=>({query:vi.fn(),tenant:vi.fn(),sources:vi.fn(),snapshot:vi.fn(),model:vi.fn(),generate:vi.fn(),close:vi.fn()}));
vi.mock('node:fs/promises',()=>({readFile:async(file:string)=>`Synthetic source of ${file}`}));
vi.mock('@/lib/rag/db',()=>({tenantQuery:mocks.tenant,tenantTransaction:async(_u:string,f:(c:unknown)=>unknown)=>f({query:mocks.query})}));
vi.mock('./skill-source-guard',()=>({skillSourcesCurrent:mocks.sources}));
vi.mock('./skill-replay-snapshot',()=>({prepareHistoricalSkillReplay:mocks.snapshot}));
vi.mock('./skill-replay-local',()=>({localReplayModel:mocks.model}));
import {prepareSkillShadow,prepareShadowRegistration,processNextSkillShadow,shadowRuntimeHash,SHADOW_MODEL_DIGEST} from './skill-shadow';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const context={userId:id(1),jobId:id(2),leaseToken:id(3)},files={'SKILL.md':'Read only the saved original.'};
let job:Record<string,unknown>,version:Record<string,unknown>,config:Record<string,unknown>;
beforeEach(async()=>{
 vi.clearAllMocks();mocks.sources.mockResolvedValue(true);mocks.generate.mockResolvedValue({role:'assistant',content:'Synthetic response.'});mocks.close.mockResolvedValue(undefined);
 mocks.model.mockImplementation(async()=>({generateAgent:mocks.generate,close:mocks.close}));
 version={owner_id:id(1),scope:'account',current_version:1,files,content_hash:digest(files),source:'synthetic-fixture',validation:{},dependencies:[]};
 const sourceHash=digest({source:version.source,validation:version.validation,dependencies:[]});
 config={protocol:'prospective-local-shadow-v1',runtimeHash:await shadowRuntimeHash(),model:'qwen3:8b',modelDigest:SHADOW_MODEL_DIGEST,
  selection:{kind:'whole-read-only-task'},maximumModelCalls:16,maximumAgeSeconds:1800,automaticActivation:false};
 const final={inputHash:'a',modelConfigHash:'b',receipts:[]};
 job={...version,id:id(2),run_id:id(4),campaign_id:id(5),skill_id:id(6),version:1,source_hash:sourceHash,config,
  state:'running',lease_token:id(3),lease_valid:true,ready_at:new Date(),instructions:[],reply:{reply:'Actual production observation'},
  start_context:{kind:'prospective-server-capture',campaignId:id(5),skillId:id(6),version:1,contentHash:digest(files),sourceHash,config,inputHash:'a',modelConfigHash:'b'},
  final_context:final,current_context:final};
 mocks.query.mockImplementation(async(sql:string)=>({rows:[sql.includes('select j.*')?job:version]}));
 mocks.tenant.mockImplementation(async(_u:string,sql:string)=>sql.includes('claim_skill_shadow_job')?[{id:id(2),lease_token:id(3)}]:[{ok:true}]);
 const receipt={tool:'knowledge_search',arguments:{question:'Synthetic count?'},result:{status:'success',data:[]}};
 const suite={id:'synthetic-shadow',ownerId:id(1),skill:{id:id(6),version:1,files,contentHash:digest(files),sourceHash},
  model:{name:'qwen3:8b',digest:SHADOW_MODEL_DIGEST},cases:[{id:'case',category:'replay',provenance:'historical',sourceRunId:id(4),question:'Synthetic count?',receipts:[{...receipt,sha256:digest(receipt)}]}]};
 mocks.snapshot.mockResolvedValue({suite,bindings:[],suiteHash:digest(suite),bindingHash:digest([])});
});
it('runs the actual graph with local pairs while preserving the separate observed production answer',async()=>{
 expect(await processNextSkillShadow(id(1))).toMatchObject({status:'completed',acceptance:false});
 const finish=mocks.tenant.mock.calls.find(c=>c[1].includes('finish_skill_shadow_job'))!;
 const artifact=JSON.parse(finish[2][3]);
 expect(artifact).toMatchObject({automaticActivation:false,productionAgentEquivalent:false,
  provenance:{observedProductionResult:{reply:'Actual production observation'}},localAnalysis:{liveShadow:false}});
 expect(mocks.generate).toHaveBeenCalledTimes(2);expect(mocks.close).toHaveBeenCalled();
 expect(mocks.tenant.mock.calls.filter(c=>c[1].includes('record_skill_shadow_model_call')).map(c=>c[2][3])).toEqual(['started','completed','started','completed']);
 expect(finish[2][4]).toBe('pending-semantic-review');
});
it.each(['lease','old','journal','registration','runtime','source','version','script','instructions'] as const)('blocks %s changes before model access',async kind=>{
 if(kind==='lease')job.lease_token=id(99);
 if(kind==='old')job.ready_at=new Date(Date.now()-1801000);
 if(kind==='journal')job.current_context={changed:true};
 if(kind==='registration')job.source_hash='f'.repeat(64);
 if(kind==='runtime')config.runtimeHash='f'.repeat(64);
 if(kind==='source')mocks.sources.mockResolvedValue(false);
 if(kind==='version')job.current_version=2;
 if(kind==='script')job.files={'SKILL.md':'Run code','run.py':'print(1)'};
 if(kind==='instructions')job.instructions=[{content:'New instructions'}];
 expect(await processNextSkillShadow(id(1))).toMatchObject({status:'failed',acceptance:false});expect(mocks.model).not.toHaveBeenCalled();
});
it('revalidates after generation and discards changed sources',async()=>{
 mocks.generate.mockImplementation(async()=>{job.current_context={changed:true};return {role:'assistant',content:'Cannot persist as accepted'};});
 expect(await processNextSkillShadow(id(1))).toMatchObject({status:'failed'});
 expect(mocks.generate).toHaveBeenCalledTimes(1);expect(mocks.close).toHaveBeenCalled();
 const finish=mocks.tenant.mock.calls.find(c=>c[1].includes('finish_skill_shadow_job'))!;
 expect(finish[1]).toContain("'failed'");expect(finish[2][2]).toBeNull();
});
it('preserves incomplete pairs as failed artifacts without activation',async()=>{
 mocks.generate.mockRejectedValue(new Error('offline'));
 expect(await processNextSkillShadow(id(1))).toMatchObject({status:'failed'});
 const finish=mocks.tenant.mock.calls.find(c=>c[1].includes('finish_skill_shadow_job'))!;
 expect(finish[2][2]).toBe('failed');expect(JSON.parse(finish[2][3]).localAnalysis.pairs).toHaveLength(1);
});
it('does not call a model when the queue has no eligible task',async()=>{
 mocks.tenant.mockResolvedValue([]);expect(await processNextSkillShadow(id(1))).toEqual({claimed:false});expect(mocks.model).not.toHaveBeenCalled();
});
it('keeps lost-lease completion out of accepted state',async()=>{
 mocks.tenant.mockImplementation(async(_u:string,sql:string)=>sql.includes('claim_skill_shadow_job')?[{id:id(2),lease_token:id(3)}]:[{ok:false}]);
 expect(await processNextSkillShadow(id(1))).toMatchObject({status:'lease-lost',acceptance:false});
});
it('builds subtask selection only from owned completed read rows',async()=>{
 config.selection={kind:'read-only-subtask',objective:'Analyze only saved mailbox content.',tools:['mail_read']};
 mocks.tenant.mockResolvedValue([{id:id(7)}]);await prepareSkillShadow(context);
 expect(mocks.snapshot).toHaveBeenCalledWith({userId:id(1)},expect.objectContaining({subtasks:[{runId:id(4),readCallIds:[id(7)],objective:'Analyze only saved mailbox content.'}]}));
 expect(mocks.tenant.mock.calls[0][1]).toContain("effect='read'");
});
it('registers only current account instruction packages with exact source binding',async()=>{
 const plan=await prepareShadowRegistration(id(1),{skillId:id(6),version:1,hours:1,selection:{kind:'whole-read-only-task'}});
 expect(plan.sourceHash).toBe(job.source_hash);expect(plan.config.automaticActivation).toBe(false);
 version.dependencies=['new dependency'];await expect(prepareShadowRegistration(id(1),{skillId:id(6),version:1,hours:1,selection:{kind:'whole-read-only-task'}})).rejects.toThrow();
});
