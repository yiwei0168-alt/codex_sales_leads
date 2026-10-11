import {expect,it} from 'vitest';
import {digest} from './contracts';
import {modeModelConfig} from './mode-config';
import {assertRecordedFallbackChain} from './recorded-fallback-chain';
function attempt(index:number,success=false){
 const input={messages:[{role:'user',content:'Synthetic'}],profile:modeModelConfig('standard').profile!,index};
 return {id:`attempt-${index}`,call_key:`mode-model:0:0:${index}`,status:'completed',input,input_hash:digest(input),output:success?{status:'success',data:{}}:{status:'unavailable',data:{retryable:true,reason:'http-429'}}};
}
it.each([0,1,2])('accepts selected route %s only with all retryable predecessors',index=>{
 const rows=Array.from({length:index+1},(_,i)=>attempt(i,i===index));expect(assertRecordedFallbackChain(rows).attempts).toBe(index+1);
});
it.each(['http-429','http-500','http-502','http-503','http-504','connection-failed','timeout-first-output','timeout-total'])('accepts recorded supported reason %s',reason=>{
 const first=attempt(0);first.output={status:'unavailable',data:{retryable:true,reason}};
 expect(()=>assertRecordedFallbackChain([first,attempt(1,true)])).not.toThrow();
});
it('rejects missing predecessors, duplicate identity, unfinished calls and calls after success',()=>{
 expect(()=>assertRecordedFallbackChain([attempt(1,true)])).toThrow('predecessor');
 expect(()=>assertRecordedFallbackChain([attempt(0),attempt(0),attempt(1,true)])).toThrow();
 expect(()=>assertRecordedFallbackChain([{...attempt(0),status:'started'},attempt(1,true)])).toThrow();
 expect(()=>assertRecordedFallbackChain([attempt(0,true),attempt(1,true)])).toThrow();
});
it('rejects nonretryable or unexplained fallback and changed requests',()=>{
 for(const data of [{retryable:false,reason:'http-429'},{retryable:true,reason:'http-401'},{retryable:true,reason:'unknown'}]){
  const first=attempt(0);first.output={status:'unavailable',data};expect(()=>assertRecordedFallbackChain([first,attempt(1,true)])).toThrow();
 }
 const next=attempt(1,true);next.input.messages[0].content='Changed';next.input_hash=digest(next.input);
 expect(()=>assertRecordedFallbackChain([attempt(0),next])).toThrow('request changed');
});
it('does not infer a completed response from exhausted or empty journals',()=>{
 expect(()=>assertRecordedFallbackChain([attempt(0),attempt(1),attempt(2)])).toThrow('no selected');
 expect(()=>assertRecordedFallbackChain([])).toThrow('empty');
});
