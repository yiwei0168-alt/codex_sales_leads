import {expect,it} from 'vitest';
import {digest,type ModelMessage} from './contracts';
import {modeModelConfig} from './mode-config';
import {modelFunctions,transportMessages} from './model';
import {modelRequestManifest} from './model-request-manifest';
import {decisionMemoryMessage} from './decision-memory-message';
import {prepareRecordedTaskChain} from './recorded-task-chain';
const profile=modeModelConfig('standard').profile!;
function turn(step:number,messages:ModelMessage[],message:ModelMessage,revision=0){
 const input={messages,profile,index:0},body={model:profile.routes[0].model,messages:transportMessages(messages),tools:modelFunctions,stream:true,reasoning:{effort:profile.routes[0].effort}};
 return {id:`turn-${step}`,call_key:`mode-model:${step}:${revision}:0`,input,input_hash:digest(input),output:{status:'success',data:{value:{message,requestManifest:modelRequestManifest(body,{model:body.model,provider:'fixture',id:`response-${step}`})}}}};
}
function fixture(){
 const initial:ModelMessage[]=[{role:'system',content:'Synthetic instructions'},decisionMemoryMessage([]),{role:'user',content:'Synthetic task'}];
 const reply:ModelMessage={role:'assistant',content:null,tool_calls:[{id:'read-1',type:'function',function:{name:'execute_tool',arguments:'{"tool":"memory_read","arguments":{}}'}}]};
 const result:ModelMessage={role:'tool',tool_call_id:'read-1',content:'{"status":"success","data":[]}'};
 const final:ModelMessage={role:'assistant',content:'Synthetic answer'};
 return {initial,reply,result,final,turns:[turn(0,initial,reply),turn(1,[...initial,reply,result],final)]};
}
const task={reply:'Synthetic answer',instructions:[]};
it('binds consecutive exact assistant outputs, paired results and final answer without claiming initial provenance',()=>{
 const value=prepareRecordedTaskChain(fixture().turns,task);
 expect(value).toMatchObject({taskChainIntegrityVerified:true,initialConversationProvenanceVerified:false,executionAuthorized:false,qualityAccepted:false});expect(value.turns).toHaveLength(2);
});
it('rejects changed earlier output even when each individual wire hash is valid',()=>{
 const f=fixture();f.turns[0]=turn(0,f.initial,{...f.reply,content:'Altered'});
 expect(()=>prepareRecordedTaskChain(f.turns,task)).toThrow('diverged');
});
it('rejects gaps, duplicates, wrong route keys and mismatched final answer',()=>{
 const f=fixture();
 expect(()=>prepareRecordedTaskChain([f.turns[1]],task)).toThrow('gap');
 expect(()=>prepareRecordedTaskChain([...f.turns,f.turns[1]],task)).toThrow('duplicated');
 expect(()=>prepareRecordedTaskChain([{...f.turns[0],call_key:'mode-model:0:0:1'},f.turns[1]],task)).toThrow('route');
 expect(()=>prepareRecordedTaskChain(f.turns,{...task,reply:'Other'})).toThrow('final answer');
});
it('requires every prior call result and disallows unbound assistant additions',()=>{
 const f=fixture();
 expect(()=>prepareRecordedTaskChain([f.turns[0],turn(1,[...f.initial,f.reply],f.final)],task)).toThrow('missing');
 expect(()=>prepareRecordedTaskChain([f.turns[0],turn(1,[...f.initial,f.reply,f.result,f.final],f.final)],task)).toThrow('unbound');
});
it('allows authoritative appended instructions only after a revision boundary',()=>{
 const f=fixture(),messages=[...f.initial,f.reply,f.result,{role:'user' as const,content:'Clarification'}];
 const turns=[f.turns[0],turn(1,messages,f.final,1)];
 expect(()=>prepareRecordedTaskChain(turns,{...task,instructions:[{content:'Clarification'}]})).not.toThrow();
 expect(()=>prepareRecordedTaskChain(turns,task)).toThrow('provenance');
 expect(()=>prepareRecordedTaskChain([f.turns[0],turn(1,messages,f.final)],task)).toThrow('order');
});
it('rejects reordered authoritative instructions',()=>{
 const f=fixture(),messages=[...f.initial,f.reply,f.result,{role:'user' as const,content:'Second'},{role:'user' as const,content:'First'}];
 expect(()=>prepareRecordedTaskChain([f.turns[0],turn(1,messages,f.final,1)],{
  ...task,instructions:[{content:'First'},{content:'Second'}],
 })).toThrow('ordered task provenance');
});
