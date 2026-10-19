import {expect,it,vi} from 'vitest';
import {digest,type ModelMessage} from './contracts';
import {runGraphSkillReplay} from './skill-graph-replay';
import {CallbackManager} from '@langchain/core/callbacks/manager';
import {disableLocalAnalysisTracing} from './local-analysis-boundary';
import {skillReplaySuiteSchema,type SkillReplaySuite} from './skill-replay';
const id='00000000-0000-4000-8000-000000000001';
const args={entities:['Synthetic A','Synthetic B'],attributes:['ports']};
function fixture(){
  const files={'SKILL.md':'Read both original interface tables.'};
  const receipt={tool:'knowledge_compare',arguments:args,result:{status:'success',data:{text:'Synthetic A has two ports, B has three.'}}};
  return {id:'graph-test',ownerId:id,skill:{id,version:1,files,contentHash:digest(files),sourceHash:digest('synthetic')},
    model:{name:'qwen3:8b',digest:'a'.repeat(64)},cases:[{id:'comparison',category:'replay',provenance:'synthetic',question:'Compare ports of A and B.',receipts:[{...receipt,sha256:digest(receipt)}]}]};
}
function call(name:string,input:unknown,callId='call'){
  return {role:'assistant',content:null,tool_calls:[{id:callId,type:'function',function:{name,arguments:JSON.stringify(input)}}]};
}
const answer={role:'assistant',content:'A: two; B: three.'};
it.each(['knowledge_originals','knowledge_facts','memory_read','memory_history_search','memory_observation_search'])('exposes %s only through described exact recorded reads',async tool=>{
 disableLocalAnalysisTracing();
 const s:SkillReplaySuite=skillReplaySuiteSchema.parse(fixture());
 const arguments_=tool==='knowledge_originals'?{query:'',assetId:id}:tool==='knowledge_facts'?{entity:'Synthetic A',attributes:['ports']}:
  tool==='memory_read'?{}:tool==='memory_history_search'?{query:'past',offset:0,limit:20}:{query:'past'};
 const receipt={tool,arguments:arguments_,result:{status:'success',data:{synthetic:true}}};
 s.cases[0].receipts=[{...receipt,sha256:digest(receipt)}];let steps=0;
 const out=await runGraphSkillReplay(s,async()=>{
  const step=steps++%3;
  return step===0?call('describe_tool',{tool}):step===1?call('execute_tool',{tool,arguments:arguments_}):answer;
 },async()=>{});
 expect(out.pairs[0].baseline.status).toBe('completed');expect(out.pairs[0].candidate.status).toBe('completed');
 expect(out.pairs[0].candidate.calls.some(row=>row.receiptHash===digest(receipt))).toBe(true);
});
it('rejects inherited tracing before model access and runs only with tracing explicitly disabled',async()=>{
 vi.stubEnv('LANGSMITH_TRACING','true');vi.stubEnv('LANGCHAIN_TRACING_V2','true');
 const network=vi.fn(async()=>{throw new Error('No external tracing permitted');});vi.stubGlobal('fetch',network);
 try{
  const blocked=vi.fn(async()=>answer);
  await expect(runGraphSkillReplay(fixture(),blocked,async()=>{})).rejects.toThrow('external tracing disabled');
  expect(blocked).not.toHaveBeenCalled();expect(network).not.toHaveBeenCalled();
  disableLocalAnalysisTracing();
  const output=await runGraphSkillReplay(fixture(),async()=>{
   expect(CallbackManager.configure([])?.handlers.some(h=>h.name==='langchain_tracer')).toBe(false);
   return answer;
  },async()=>{});
  expect(output.pairs[0].baseline.status).toBe('completed');
  expect(output.pairs[0].candidate.status).toBe('completed');
  expect(network).not.toHaveBeenCalled();
 }finally{vi.unstubAllEnvs();vi.unstubAllGlobals();}
});
it('uses actual graph and registered schemas through discover, describe, read and final answer',async()=>{
  const model=vi.fn(async(messages:ModelMessage[])=>{
    const n=messages.filter(m=>m.role==='tool').length;
    return n===0?call('discover_tools',{},'discover'):n===1?call('describe_tool',{tool:'knowledge_compare'},'describe'):
      n===2?call('execute_tool',{tool:'knowledge_compare',arguments:args},'read'):answer;
  });
  const validate=vi.fn(async()=>{}),persist=vi.fn(async()=>{});
  const output=await runGraphSkillReplay(fixture(),model,validate,persist);
  expect(output.pairs[0].baseline.status).toBe('completed');expect(output.pairs[0].candidate.modelCalls).toBe(4);
  expect(output.pairs[0].candidate.calls[2].receiptHash).toBe(fixture().cases[0].receipts[0].sha256);
  expect(output.pairs[0].candidate.messages.filter(m=>m.role==='tool')).toHaveLength(3);
  expect(output).toMatchObject({productionGraphReused:true,productionAgentEquivalent:false,liveShadow:false,autoEnable:false});
  expect(persist).toHaveBeenCalledTimes(1);expect(validate.mock.calls.length).toBeGreaterThan(16);
});
it.each(['mail_send','knowledge_private_delete','skill_manage'])('blocks effect %s without an execution callback',async tool=>{
  const model=vi.fn(async()=>call('execute_tool',{tool,arguments:{}}));
  const output=await runGraphSkillReplay(fixture(),model,async()=>{});
  expect(output.pairs[0].baseline).toMatchObject({status:'paused',stopReason:'tool-not-allowed',modelCalls:1});
  expect(model).toHaveBeenCalledTimes(2);
});
it('requires description before invoking a tool',async()=>{
  const output=await runGraphSkillReplay(fixture(),async()=>call('execute_tool',{tool:'knowledge_compare',arguments:args}),async()=>{});
  expect(output.pairs[0].candidate.stopReason).toBe('tool-not-described');
});
it('rejects a schema-valid query outside the exact saved receipts',async()=>{
  const output=await runGraphSkillReplay(fixture(),async messages=>messages.some(m=>m.role==='tool')
    ?call('execute_tool',{tool:'knowledge_compare',arguments:{...args,entities:['Other A','Other B']}})
    :call('describe_tool',{tool:'knowledge_compare'}),async()=>{});
  expect(output.pairs[0].baseline.stopReason).toBe('no-exact-recorded-receipt');
});
it('inherits production repeated-action stop rather than running an unlimited model loop',async()=>{
  const output=await runGraphSkillReplay(fixture(),async()=>call('discover_tools',{}),async()=>{});
  expect(output.pairs[0].baseline.status).toBe('partial');expect(output.pairs[0].baseline.modelCalls).toBe(3);
  expect(output.pairs[0].baseline.calls).toHaveLength(2);
});
it('does not persist a pair if sources change while the model runs',async()=>{
  let changed=false;const persist=vi.fn(async()=>{});
  await expect(runGraphSkillReplay(fixture(),async()=>{changed=true;return answer;},async()=>{if(changed)throw new Error('revoked');},persist)).rejects.toThrow('revoked');
  expect(persist).not.toHaveBeenCalled();
});
it('captures malformed native model output as a failed arm',async()=>{
  const output=await runGraphSkillReplay(fixture(),async()=>({role:'user',content:'bad'}),async()=>{});
  expect(output.pairs[0].candidate).toMatchObject({status:'partial',stopReason:'invalid-model-schema'});
});
