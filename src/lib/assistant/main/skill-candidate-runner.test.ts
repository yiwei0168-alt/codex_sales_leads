import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {digest,toolResultSchema,type ModelMessage} from './contracts';
import {modeModelConfig} from './mode-config';
import {initialTaskMessages} from './initial-task-messages';
import {decisionMemoryMessage} from './decision-memory-message';
import {disableLocalAnalysisTracing} from './local-analysis-boundary';
import {runSkillCandidateArm} from './skill-candidate-runner';
import {productTools} from './tools';
import {dispatchTool} from './executor';
import {orderedModeDecision} from './mode-fallback';
const execution=vi.hoisted(()=>({run:vi.fn()}));
vi.mock('./tool-execution',()=>({executeRegisteredTool:execution.run}));
const owner='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002';
beforeEach(()=>{disableLocalAnalysisTracing();vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('No network in candidate mechanism test');}));});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
function fixture(){
 const config=modeModelConfig('standard'),context={userId:owner,role:'member' as const,mode:'standard' as const};
 const initial=initialTaskMessages(context,{content:'Answer from original sources.',attachments:[]},config,[]);
 const files={'SKILL.md':'Check exact model and source coordinates before answering.'};
 const listing={id,name:'Original candidate',scope:'account',current_version:1,enabled:false,published:false,owned:true};
 const receipt={tool:'knowledge_search',arguments:productTools.find(tool=>tool.id==='knowledge_search')!.input.parse({query:'original sources'}) as Record<string,unknown>,output:{status:'success',data:{text:'Synthetic original evidence'}}};
 return {context,initialMessages:[initial[0],decisionMemoryMessage([]),...initial.slice(1)],profile:config.profile!,skills:[listing],
  candidate:{listing,value:{skill_id:id,version:1,files,content_hash:digest(files),dependencies:[],owner_id:owner,scope:'account'}},receipts:[{...receipt,hash:digest(receipt)}]};
}
function call(name:string,args:unknown,id:string){return {role:'assistant',content:null,tool_calls:[{id,type:'function',function:{name,arguments:JSON.stringify(args)}}]};}
const answer={role:'assistant',content:'Synthetic answer.'};
it('preserves the actual initial prompt/config and introduces Skill only via list/read',async()=>{
 const snapshot=fixture(),original=digest(snapshot),inputs:ModelMessage[][]=[];
 const steps=[call('describe_tool',{tool:'skill_list'},'d-list'),call('execute_tool',{tool:'skill_list',arguments:{}},'list'),call('describe_tool',{tool:'skill_read'},'d-read'),call('execute_tool',{tool:'skill_read',arguments:{id}},'read'),answer];
 for(const arm of ['baseline','candidate'] as const){
  let index=0;const out=await runSkillCandidateArm(snapshot,arm,async request=>{inputs.push(request.messages);expect(request.profile).toEqual(snapshot.profile);return steps[index++];},async()=>{});
  expect(inputs[inputs.length-5]).toEqual(snapshot.initialMessages);
  const results=out.messages.filter(message=>message.role==='tool').map(message=>JSON.parse(message.content!));
  expect(results[1].data).toEqual([{...snapshot.candidate.listing,enabled:arm==='candidate'}]);
  expect(results[3].data).toEqual(arm==='candidate'?snapshot.candidate.value:null);
  expect(out).toMatchObject({status:'completed',modelCalls:5,candidateSkillUsed:arm==='candidate',businessToolExecutions:0,productionGraphReused:true,productionAgentEquivalent:false,automaticActivation:false});
 }
 expect(digest(snapshot)).toBe(original);expect(fetch).not.toHaveBeenCalled();
});
it('returns only the exact recorded read result and records its hash',async()=>{
 const snapshot=fixture();let index=0;const steps=[call('describe_tool',{tool:'knowledge_search'},'d'),call('execute_tool',{tool:'knowledge_search',arguments:{query:'original sources'}},'r'),answer];
 const out=await runSkillCandidateArm(snapshot,'candidate',async()=>steps[index++],async()=>{});
 expect(out.status).toBe('completed');expect(out.trace[1].receiptHash).toBe(snapshot.receipts[0].hash);expect(out.candidateSkillUsed).toBe(false);expect(fetch).not.toHaveBeenCalled();
});
it('shares production discovery, description and normalized read arguments without executing business tools',async()=>{
 const snapshot=fixture();execution.run.mockReset();
 const steps=[call('discover_tools',{ignoredByProduction:true},'discovery'),call('describe_tool',{tool:'knowledge_search'},'description'),
  call('execute_tool',{tool:'knowledge_search',arguments:{query:'original sources'}},'read'),answer];
 let index=0;const candidate=await runSkillCandidateArm(snapshot,'candidate',async()=>steps[index++],async()=>{});
 expect(candidate.status).toBe('completed');expect(execution.run).not.toHaveBeenCalled();
 execution.run.mockResolvedValue(toolResultSchema.parse(snapshot.receipts[0].output));
 for(let i=0;i<3;i++){
  const message=steps[i];if(!('tool_calls' in message))throw new Error('Expected tool call');
  const output=await dispatchTool(message.tool_calls[0] as Parameters<typeof dispatchTool>[0],{...snapshot.context,runId:id,leaseToken:id});
  expect(candidate.trace[i].outputHash,`cross-path call ${i}`).toBe(digest(output));
 }
 expect(execution.run).toHaveBeenCalledTimes(1);
 expect(execution.run).toHaveBeenCalledWith(expect.objectContaining({id:'knowledge_search'}),snapshot.receipts[0].arguments,'read',expect.objectContaining({userId:owner}));
});
it.each(['mail_send','skill_manage','knowledge_private_delete'])('cannot dispatch %s even when exposed by the normal mode prompt',async tool=>{
 const out=await runSkillCandidateArm(fixture(),'candidate',async()=>call('execute_tool',{tool,arguments:{}},'effect'),async()=>{});
 expect(out).toMatchObject({status:'paused',stopReason:'effect-or-tool-not-allowed',businessToolExecutions:0});expect(fetch).not.toHaveBeenCalled();
});
it.each(['missing','modified','duplicate'])('blocks %s recorded evidence',async kind=>{
 const snapshot=fixture();if(kind==='missing')snapshot.receipts=[];if(kind==='modified')snapshot.receipts[0].output.data.text='changed';if(kind==='duplicate')snapshot.receipts.push(snapshot.receipts[0]);
 let index=0;const steps=[call('describe_tool',{tool:'knowledge_search'},'d'),call('execute_tool',{tool:'knowledge_search',arguments:{query:'original sources'}},'r')];
 const out=await runSkillCandidateArm(snapshot,'candidate',async()=>steps[index++],async()=>{});
 expect(out.status).toBe('paused');expect(out.stopReason).toBe(kind==='modified'?'receipt-changed':'no-unique-recorded-receipt');
});
it('does not consume a response after source revocation during generation',async()=>{
 let revoked=false;const model=vi.fn(async()=>{revoked=true;return answer;});
 await expect(runSkillCandidateArm(fixture(),'candidate',model,async()=>{if(revoked)throw new Error('source revoked');})).rejects.toThrow('source revoked');expect(model).toHaveBeenCalledTimes(1);
});
it('bounds model calls and rejects reused call IDs',async()=>{
 const limited=await runSkillCandidateArm(fixture(),'candidate',async()=>call('discover_tools',{},'d'),async()=>{},1);
 expect(limited.modelCalls).toBe(1);expect(limited.stopReason).toBe('model-call-limit');
 const duplicated=await runSkillCandidateArm(fixture(),'candidate',async()=>call('discover_tools',{},'d'),async()=>{});
 expect(duplicated.stopReason).toBe('model-or-source-unavailable');expect(duplicated.modelCalls).toBe(2);
});
it('aborts a timed-out model callback and ignores its late tool call',async()=>{
 const snapshot=fixture();snapshot.profile.firstOutputMs=1000;snapshot.profile.totalMs=1000;let aborted=false;
 const out=await runSkillCandidateArm(snapshot,'candidate',({signal})=>new Promise(resolve=>{
  signal.addEventListener('abort',()=>{aborted=true;resolve(call('execute_tool',{tool:'mail_send',arguments:{}},'late'));},{once:true});
 }),async()=>{});
 expect(out).toMatchObject({modelCalls:1,stopReason:'model-deadline',businessToolExecutions:0,trace:[]});expect(aborted).toBe(true);
});
it('allows legal ordered fallback beyond one route budget while retaining the aggregate bound',async()=>{
 vi.useFakeTimers();
 try{
  const snapshot=fixture();snapshot.profile.firstOutputMs=1000;snapshot.profile.totalMs=1000;
  const attempts:number[]=[],saved:number[]=[];
  const output=runSkillCandidateArm(snapshot,'candidate',request=>orderedModeDecision({signal:request.signal,
   begin:async index=>({id:String(index),fresh:true}),
   request:async index=>{
    attempts.push(index);await new Promise(resolve=>setTimeout(resolve,900));
    if(index===0)throw Object.assign(new Error('Synthetic retryable connection failure'),{code:'ECONNREFUSED'});
    return answer;
   },
   save:async(_id,index)=>{saved.push(index);},
  }),async()=>{});
  await vi.advanceTimersByTimeAsync(1800);
  expect(await output).toMatchObject({status:'completed',reply:answer.content,modelCalls:1,stopReason:null});
  expect(attempts).toEqual([0,1]);expect(saved).toEqual([0,1]);expect(fetch).not.toHaveBeenCalled();
 }finally{vi.useRealTimers();}
});
it.each(['active','script','dependency','owner','hash','version','missing-list'])('rejects %s candidate before model access',async kind=>{
 const snapshot=fixture();if(kind==='active')snapshot.candidate.listing.enabled=true;if(kind==='script')snapshot.candidate.value.files['SKILL.md']='```bash\necho hi\n```';if(kind==='dependency')snapshot.candidate.value.dependencies=['package'] as never[];if(kind==='owner')snapshot.candidate.value.owner_id=id;if(kind==='hash')snapshot.candidate.value.content_hash=digest('bad');if(kind==='version')snapshot.candidate.value.version=2;if(kind==='missing-list')snapshot.skills=[];
 const model=vi.fn(async()=>answer);await expect(runSkillCandidateArm(snapshot,'candidate',model,async()=>{})).rejects.toThrow('ineligible');expect(model).not.toHaveBeenCalled();
});
it('rejects external tracing before reading sources or model access',async()=>{
 vi.stubEnv('LANGSMITH_TRACING','true');const model=vi.fn(async()=>answer),validate=vi.fn(async()=>{});
 await expect(runSkillCandidateArm(fixture(),'candidate',model,validate)).rejects.toThrow('external tracing disabled');expect(model).not.toHaveBeenCalled();expect(validate).not.toHaveBeenCalled();
});
