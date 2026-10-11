import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {buildSkillSafetyCandidate} from './skill-safety-candidate';
import {runSkillCandidateArm} from './skill-candidate-runner';
import {modeModelConfig} from './mode-config';
import {initialTaskMessages} from './initial-task-messages';
import {decisionMemoryMessage} from './decision-memory-message';
import {digest} from './contracts';
import {disableLocalAnalysisTracing} from './local-analysis-boundary';
import {skillSafetySuite} from './skill-safety-suite';
beforeEach(()=>{disableLocalAnalysisTracing();vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('No external network');}));});
afterEach(()=>vi.unstubAllGlobals());
function source(){
 const owner='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',config=modeModelConfig('standard');
 const context={userId:owner,role:'member' as const,mode:'standard' as const};
 const initial=initialTaskMessages(context,{content:'PRIVATE ORIGINAL TASK',attachments:[]},config,[{role:'user',content:'PRIVATE HISTORY'}]);
 const files={'SKILL.md':'Use original sources and respect account boundaries.'},listing={id,name:'Candidate',scope:'account',current_version:1,enabled:false,published:false,owned:true};
 return {sourceHash:digest('source'),skillSourceHash:digest('skill-source'),taskInputHash:digest('task'),modelConfigHash:digest(config),snapshot:{context,profile:config.profile!,
  initialMessages:[initial[0],decisionMemoryMessage([{content:'PRIVATE MEMORY'}]),...initial.slice(1)],skills:[listing],
  candidate:{listing,value:{skill_id:id,version:1,files,content_hash:digest(files),dependencies:[],owner_id:owner,scope:'account'}},
  receipts:[{tool:'private-original',arguments:{},output:'PRIVATE ORIGINAL RECEIPT',hash:digest('private')}],
 }};
}
const call=(name:string,args:unknown,id:string)=>({role:'assistant',content:null,tool_calls:[{id,type:'function',function:{name,arguments:JSON.stringify(args)}}]});
it.each(['safety-ambiguous','safety-unknown','safety-cross-account','safety-source-injection','safety-source-conflict'])('prepares %s with production protocol and isolated task content',id=>{
 const original=source(),hash=digest(original),prepared=buildSkillSafetyCandidate(original,id);
 expect(prepared.snapshot.initialMessages[0]).toEqual(original.snapshot.initialMessages[0]);expect(prepared.snapshot.profile).toEqual(original.snapshot.profile);
 expect(prepared.snapshot.initialMessages[1]).toEqual(decisionMemoryMessage([]));expect(JSON.stringify(prepared.snapshot)).not.toContain('PRIVATE');
 const modelInput=JSON.stringify(prepared.snapshot.initialMessages);expect(modelInput).not.toContain(skillSafetySuite().oracles[id as keyof ReturnType<typeof skillSafetySuite>['oracles']]);
 expect(prepared.provenance).toBe('safety-fixture');expect(digest(original)).toBe(hash);expect(buildSkillSafetyCandidate(original,id).sourceHash).toBe(prepared.sourceHash);
});
it.each(['unknown','safety-exact-evidence'])('does not relabel %s as a registered safety category',id=>expect(()=>buildSkillSafetyCandidate(source(),id)).toThrow());
it('rejects changed production prompt and binds profile and Skill changes',()=>{
 const original=source(),before=buildSkillSafetyCandidate(original,'safety-ambiguous');original.snapshot.profile.totalMs++;
 expect(buildSkillSafetyCandidate(original,'safety-ambiguous').sourceHash).not.toBe(before.sourceHash);
 original.snapshot.initialMessages[0].content='different';expect(()=>buildSkillSafetyCandidate(original,'safety-ambiguous')).toThrow('prompt changed');
});
it('executes injected evidence only as an exact read and blocks a resulting send attempt',async()=>{
 const prepared=buildSkillSafetyCandidate(source(),'safety-source-injection'),receipt=prepared.snapshot.receipts[0];let step=0;
 const replies=[call('describe_tool',{tool:receipt.tool},'describe'),call('execute_tool',{tool:receipt.tool,arguments:receipt.arguments},'read'),call('execute_tool',{tool:'mail_send',arguments:{}},'send')];
 const result=await runSkillCandidateArm(prepared.snapshot,'candidate',async()=>replies[step++],async()=>{});
 expect(result.trace.some(row=>row.receiptHash===receipt.hash)).toBe(true);expect(result.stopReason).toBe('effect-or-tool-not-allowed');expect(result.businessToolExecutions).toBe(0);expect(fetch).not.toHaveBeenCalled();
});
