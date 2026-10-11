import {afterEach,it,expect,vi} from 'vitest';
import {requestModeModel} from './model';
import {modeModelConfig} from './mode-config';
import {mayFallback,orderedModeDecision} from './mode-fallback';
import {ModelWaitError} from './model-stream';

afterEach(()=>{vi.unstubAllEnvs();vi.useRealTimers();});
function setup(){vi.stubEnv('OPENROUTER_API_KEY','synthetic-key');return modeModelConfig('quick').profile!;}
it('rejects cancellation before admission or transport',async()=>{
 const controller=new AbortController(),transport=vi.fn();controller.abort(new Error('Evaluation cancelled'));
 await expect(requestModeModel([],setup(),0,transport,controller.signal)).rejects.toThrow('Evaluation cancelled');
 expect(transport).not.toHaveBeenCalled();expect(mayFallback(controller.signal.reason)).toBe(false);
});
it('cancels an unresponsive transport and discards a late response',async()=>{
 const profile=setup(),controller=new AbortController();let reached!:()=>void,finish!:(value:Response)=>void;
 const started=new Promise<void>(resolve=>{reached=resolve;});let innerSignal:AbortSignal|undefined;
 const transport=vi.fn(async(_url,init)=>{innerSignal=init?.signal??undefined;reached();return new Promise<Response>(resolve=>{finish=resolve;});});
 const pending=requestModeModel([],profile,0,transport,controller.signal);
 const rejected=expect(pending).rejects.toThrow('Evaluation cancelled');
 await started;controller.abort(new Error('Evaluation cancelled'));await rejected;
 expect(innerSignal?.aborted).toBe(true);
 finish(Response.json({model:profile.routes[0].model,choices:[{finish_reason:'stop',message:{role:'assistant',content:'late'}}]}));
 expect(transport).toHaveBeenCalledOnce();
});
it('cancels a stream after receiving headers and cancels its reader',async()=>{
 const profile=setup(),controller=new AbortController(),cancel=vi.fn();let reached!:()=>void;
 const started=new Promise<void>(resolve=>{reached=resolve;});
 const transport=vi.fn(async()=>{reached();return new Response(new ReadableStream({cancel}),{headers:{'content-type':'text/event-stream'}});});
 const pending=requestModeModel([],profile,0,transport,controller.signal),rejected=expect(pending).rejects.toThrow('Evaluation cancelled');
 await started;await new Promise(resolve=>setTimeout(resolve,10));controller.abort(new Error('Evaluation cancelled'));await rejected;
 expect(cancel).toHaveBeenCalled();
});
it('removes the outer listener on success and preserves the request manifest',async()=>{
 const profile=setup(),controller=new AbortController(),remove=vi.spyOn(controller.signal,'removeEventListener');
 const frame={model:profile.routes[0].model,provider:'synthetic',id:'synthetic-generation',choices:[{index:0,finish_reason:'stop',delta:{content:'OK'}}]};
 const response=await requestModeModel([],profile,0,async()=>new Response(`data: ${JSON.stringify(frame)}\n\ndata: [DONE]\n\n`,{headers:{'content-type':'text/event-stream'}}),controller.signal);
 expect(response.requestManifest.response.modelMatchesRequested).toBe(true);
 expect(remove).toHaveBeenCalledWith('abort',expect.any(Function));
 controller.abort();expect(response.message.content).toBe('OK');
});
it('persists cancellation without advancing to another model even for a retryable timeout reason',async()=>{
 const controller=new AbortController(),save=vi.fn(),begin=vi.fn(async()=>({id:'first',fresh:true}));
 await expect(orderedModeDecision({signal:controller.signal,begin,save,request:async()=>{
  const reason=new ModelWaitError('total');controller.abort(reason);throw reason;
 }})).rejects.toBeInstanceOf(ModelWaitError);
 expect(begin).toHaveBeenCalledOnce();expect(save).toHaveBeenCalledWith('first',0,{status:'unavailable',retryable:false,reason:'execution-cancelled'});
});
it('preserves a completed response receipt but does not return it after cancellation',async()=>{
 const controller=new AbortController(),save=vi.fn();
 await expect(orderedModeDecision({signal:controller.signal,begin:async()=>({id:'first',fresh:true}),save,request:async()=>{
  controller.abort(new Error('stopped'));return 'late result';
 }})).rejects.toThrow('stopped');
 expect(save).toHaveBeenCalledWith('first',0,{status:'success',value:'late result'});
});
it('does not start a request if cancellation arrives during journal admission',async()=>{
 const controller=new AbortController(),request=vi.fn(),save=vi.fn();
 await expect(orderedModeDecision({signal:controller.signal,begin:async()=>{
  controller.abort(new Error('stopped'));return {id:'first',fresh:true};
 },request,save})).rejects.toThrow('stopped');
 expect(request).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled();
});
