import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {digest} from './contracts';
import {disableLocalAnalysisTracing} from './local-analysis-boundary';
import {runRecordedSkillCandidateArm} from './skill-candidate-source';
const mocks=vi.hoisted(()=>({chain:vi.fn(),transaction:vi.fn(),current:vi.fn(),runner:vi.fn()}));
vi.mock('./recorded-task-source',()=>({loadRecordedTaskChain:mocks.chain}));
vi.mock('@/lib/rag/db',()=>({tenantTransaction:mocks.transaction}));
vi.mock('./skill-source-guard',()=>({skillSourcesCurrent:mocks.current}));
vi.mock('./skill-candidate-runner',()=>({runSkillCandidateArm:mocks.runner}));
const owner='00000000-0000-4000-8000-000000000001',skillId='00000000-0000-4000-8000-000000000002',runId='00000000-0000-4000-8000-000000000003';
let listing:Record<string,unknown>,value:Record<string,unknown>,receipt:Record<string,unknown>;
beforeEach(()=>{
 vi.resetAllMocks();disableLocalAnalysisTracing();vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Network forbidden');}));
 listing={id:skillId,name:'Candidate',scope:'account',current_version:1,enabled:false,published:false,owned:true};
 const files={'SKILL.md':'Read exact evidence.'};value={skill_id:skillId,version:1,files,content_hash:digest(files),dependencies:[],owner_id:owner,scope:'account',source:'test',validation:{}};
 receipt={id:'read',user_id:owner,run_id:runId,input:{query:'original'},output:{status:'success'},tool_id:'knowledge_search'};
 const receiptHash=digest(receipt);
 mocks.chain.mockImplementation(async()=>({requests:[{receiptBinding:{receipts:[{id:'read',hash:receiptHash}]},accountRole:'member',profile:{mode:'standard'},body:{messages:[{role:'system',content:'original'}]}}]}));
 mocks.current.mockResolvedValue(true);
 mocks.transaction.mockImplementation(async(userId,fn)=>{
  expect(userId).toBe(owner);
  return fn({query:async(sql:string,params:unknown[])=>{
   if(sql.includes('order by name,id'))return {rows:[listing]};
   if(sql.includes('select v.*')){expect(params).toEqual([skillId,owner,1]);return {rows:[value]};}
   expect(params).toEqual([owner,runId,['read']]);return {rows:[receipt]};
  }});
 });
 mocks.runner.mockImplementation(async(snapshot,arm,model,validate)=>{await validate();return {snapshot,arm,automaticActivation:false};});
});
afterEach(()=>{vi.unstubAllGlobals();});
it('loads original server data and revalidates without trusting a supplied snapshot',async()=>{
 const output=await runRecordedSkillCandidateArm({userId:owner},{runId,skillId,version:1},'candidate',vi.fn());
 expect(output).toMatchObject({serverSnapshotRevalidated:true,productionAgentEquivalent:false,automaticActivation:false});
 expect(mocks.runner.mock.calls[0][0]).toMatchObject({context:{userId:owner,role:'member'},candidate:{listing,value},initialMessages:[{role:'system',content:'original'}]});
 expect(mocks.chain).toHaveBeenCalledTimes(3);expect(fetch).not.toHaveBeenCalled();
});
it.each(['enabled','version','owner','script','hash','dependencies','source'])('rejects ineligible %s before a model callback',async kind=>{
 if(kind==='enabled')listing.enabled=true;if(kind==='version')listing.current_version=2;if(kind==='owner')listing.owned=false;
 if(kind==='script')value.files={'run.js':'console.log(1)'};if(kind==='hash')value.content_hash='bad';if(kind==='dependencies')value.dependencies=['script'];if(kind==='source')mocks.current.mockResolvedValue(false);
 await expect(runRecordedSkillCandidateArm({userId:owner},{runId,skillId,version:1},'candidate',vi.fn())).rejects.toThrow('source unavailable');
 expect(mocks.runner).not.toHaveBeenCalled();
});
it('rejects changed full receipt bodies',async()=>{
 receipt.output={status:'success',data:'changed'};
 await expect(runRecordedSkillCandidateArm({userId:owner},{runId,skillId,version:1},'candidate',vi.fn())).rejects.toThrow('receipt source changed');
});
it('rechecks the source during execution and refuses changed Skill metadata',async()=>{
 mocks.runner.mockImplementation(async(_snapshot,_arm,_model,validate)=>{listing.name='changed';await validate();});
 await expect(runRecordedSkillCandidateArm({userId:owner},{runId,skillId,version:1},'candidate',vi.fn())).rejects.toThrow('sources changed');
});
it('rejects caller-supplied source objects',async()=>{
 await expect(runRecordedSkillCandidateArm({userId:owner},{runId,skillId,version:1,snapshot:{}} as never,'candidate',vi.fn())).rejects.toThrow();
 expect(mocks.chain).not.toHaveBeenCalled();
});
