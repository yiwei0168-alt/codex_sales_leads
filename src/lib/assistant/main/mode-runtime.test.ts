import { afterEach, describe, expect, it, vi } from 'vitest';
import { modeModelConfig } from './mode-config';
import { modeAllowsTool } from './mode-tools';
import { collectModelStream, ModelWaitError, ModelReceiptError, withModeStream, isModeStreamRequest } from './model-stream';
import { orderedModeDecision, mayFallback } from './mode-fallback';
import { requestModeModel } from './model';
import { OpenRouterRequestError } from '@/providers/openrouter-batch';
import { retryableModeFailureReasons } from './mode-failure-reasons';

afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
const frame=(delta:unknown,finish_reason:string|null=null)=>`data: ${JSON.stringify({model:'openai/gpt-6-luna',provider:'fixture',choices:[{index:0,delta,finish_reason}]})}\n\n`;
const sse=(text:string)=>new Response(text,{headers:{'content-type':'text/event-stream'}});
describe('mode runtime boundaries',()=>{
  it('pins default routes and exact initial deadlines',()=>{
    expect(modeModelConfig(undefined).profile).toMatchObject({mode:'standard',firstOutputMs:30000,totalMs:120000});
    expect(modeModelConfig('quick').profile).toMatchObject({firstOutputMs:15000,totalMs:60000});
    expect(modeModelConfig('deep').profile).toMatchObject({firstOutputMs:60000,totalMs:300000,routes:[{model:'openai/gpt-6.1-sol'},{model:'anthropic/claude-opus-5.5'},{model:'z-ai/glm-5.3'}]});
  });
  it.each(['mail_sync','web_search','mail_send','skill_script','schedule_create','company_score'])('quick rejects %s',id=>expect(modeAllowsTool('quick',id)).toBe(false));
  it.each(['company_research','evidence_collect','lead_workflow','skill_script','schedule_create'])('standard rejects %s',id=>expect(modeAllowsTool('standard',id)).toBe(false));
  it('keeps saved data readable without widening historical or deep permissions',()=>{
    for(const id of ['mail_read','customer_timeline','knowledge_search'])expect(modeAllowsTool('quick',id)).toBe(true);
    expect(modeAllowsTool('standard','mail_sync')).toBe(true);
    expect(modeAllowsTool(undefined,'company_score')).toBe(true);
  });
  it('does not admit caller-supplied streaming outside the server scope',()=>{
    const url=new URL('https://openrouter.ai/api/v1/chat/completions');
    const body={model:'openai/gpt-6-luna',stream:true,max_tokens:100,provider:{data_collection:'deny',require_parameters:true,allow_fallbacks:false}};
    expect(isModeStreamRequest(url,body)).toBe(false);
    expect(withModeStream(()=>isModeStreamRequest(url,body))).toBe(true);
    expect(withModeStream(()=>isModeStreamRequest(url,{...body,provider:{...body.provider,allow_fallbacks:true}}))).toBe(false);
  });
  it('ignores heartbeats, preserves reasoning and assembles tool argument fragments',async()=>{
    const progress=vi.fn();
    const response=await collectModelStream(sse(': OPENROUTER PROCESSING\n\n'+frame({role:'assistant'})+frame({reasoning:'checking'})+frame({tool_calls:[{index:0,id:'t',type:'function',function:{name:'execute_tool',arguments:'{"tool":'}}]})+frame({tool_calls:[{index:0,function:{arguments:'"mail_read"}'}}]},'tool_calls')+'data: [DONE]\n\n'),new AbortController().signal,progress);
    expect(progress).toHaveBeenCalledTimes(3);
    expect((await response.json()).choices[0].message).toMatchObject({reasoning:'checking',tool_calls:[{id:'t',function:{name:'execute_tool',arguments:'{"tool":"mail_read"}'}}]});
  });
  it.each([frame({content:'partial'}),frame({content:'partial'},'length')+'data: [DONE]\n\n','data: {"error":{"message":"private"}}\n\n'])('rejects incomplete or failed streams',async text=>{
    await expect(collectModelStream(sse(text),new AbortController().signal,()=>{})).rejects.toThrow();
  });
  it.each(['id','model','provider'])('rejects a changed %s instead of merging different stream identities',async key=>{
    const chunk=(value:string,finish_reason:string|null)=>`data: ${JSON.stringify({id:'gen-first',model:'openai/gpt-6-luna',provider:'fixture',[key]:value,choices:[{index:0,delta:{content:'answer'},finish_reason}]})}\n\n`;
    await expect(collectModelStream(sse(chunk('first',null)+chunk('second','stop')+'data: [DONE]\n\n'),new AbortController().signal,()=>{})).rejects.toThrow('invalid model stream');
  });
  it.each([{content:'late'},{reasoning:'late'},{reasoning_details:[{type:'reasoning.text',text:'late'}]},
    {tool_calls:[{index:0,id:'late-tool',type:'function',function:{name:'execute_tool',arguments:'{}'}}]}])('rejects a content-bearing delta after terminal finish: %j',async delta=>{
    await expect(collectModelStream(sse(frame({content:'finished'},'stop')+frame(delta)+'data: [DONE]\n\n'),new AbortController().signal,()=>{})).rejects.toThrow('invalid model stream');
  });
  it('accepts the documented content-free usage frame with a repeated finish reason',async()=>{
    const usage=`data: ${JSON.stringify({model:'openai/gpt-6-luna',provider:'fixture',choices:[{index:0,delta:{content:'',role:'assistant'},finish_reason:'stop'}],usage:{prompt_tokens:3,completion_tokens:2}})}\n\n`;
    const out=await collectModelStream(sse(frame({content:'answer'},'stop')+usage+'data: [DONE]\n\n'),new AbortController().signal,()=>{});
    expect(await out.json()).toMatchObject({choices:[{message:{content:'answer'}}],usage:{prompt_tokens:3,completion_tokens:2}});
  });
  it('persists protocol failure without advancing to a fallback route',async()=>{
    const request=vi.fn(async()=>collectModelStream(sse(frame({content:'finished'},'stop')+frame({content:'late'})+'data: [DONE]\n\n'),new AbortController().signal,()=>{}));
    const save=vi.fn();
    await expect(orderedModeDecision({begin:async()=>({id:'attempt',fresh:true}),request,save})).rejects.toThrow('invalid model stream');
    expect(request).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith('attempt',0,{status:'unavailable',retryable:false,reason:'requires-reconciliation-or-configuration'});
  });
  it('saves a failed route before advancing and reuses saved success on recovery',async()=>{
    const saved=new Map<number,{status:string;data:unknown}>(),calls:number[]=[],events:string[]=[];
    const deps={begin:async(i:number)=>({id:String(i),fresh:!saved.has(i),output:saved.get(i)}),request:async(i:number)=>{calls.push(i);events.push(`request${i}`);if(i===0)throw new ModelWaitError('first-output');return 'answer';},save:async(id:string,i:number,value:{status:'success';value:string}|{status:'unavailable';retryable:boolean;reason:string})=>{events.push(`save${i}`);saved.set(i,{status:value.status,data:value.status==='success'?{value:value.value}:{retryable:value.retryable,reason:value.reason}});}};
    expect(await orderedModeDecision(deps)).toBe('answer');
    expect(await orderedModeDecision(deps)).toBe('answer');
    expect(calls).toEqual([0,1]);expect(events).toEqual(['request0','save0','request1','save1']);
  });
  it('stops on an unknown started attempt or failed persistence',async()=>{
    const request=vi.fn().mockResolvedValue('answer');
    await expect(orderedModeDecision({begin:async()=>({id:'1',fresh:false}),request,save:vi.fn()})).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
    await expect(orderedModeDecision({begin:async()=>({id:'1',fresh:true}),request,save:async()=>{throw new Error('storage');}})).rejects.toThrow('storage');
    expect(request).toHaveBeenCalledOnce();expect(mayFallback(new ModelReceiptError())).toBe(false);
  });
  it.each([undefined,null,{}, {retryable:true}, {retryable:true,reason:'http-401'},
    {retryable:true,reason:'execution-cancelled'}, {retryable:true,reason:'unknown'},
    {retryable:false,reason:'http-429'}])('does not advance from an unsupported saved failure: %j',async data=>{
    const request=vi.fn(),save=vi.fn(),begin=vi.fn(async()=>({id:'saved',fresh:false,output:{status:'unavailable',data}}));
    await expect(orderedModeDecision({begin,request,save})).rejects.toThrow();
    expect(begin).toHaveBeenCalledTimes(1);expect(request).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled();
  });
  it.each(retryableModeFailureReasons)('advances from a supported saved failure %s without repeating it',async reason=>{
    const request=vi.fn(async()=> 'recovered'),save=vi.fn();
    const begin=vi.fn(async(index:number)=>index===0
      ?{id:'saved',fresh:false,output:{status:'unavailable',data:{retryable:true,reason}}}
      :{id:'next',fresh:true});
    expect(await orderedModeDecision({begin,request,save})).toBe('recovered');
    expect(request).toHaveBeenCalledExactlyOnceWith(1);expect(save).toHaveBeenCalledTimes(1);
  });
  it('tries exactly three routes on explicit retryable errors, but not on 401',async()=>{
    const request=vi.fn(async()=>{throw new ModelWaitError('total');}),save=vi.fn();
    await expect(orderedModeDecision({begin:async i=>({id:String(i),fresh:true}),request,save})).rejects.toThrow();
    expect(request.mock.calls).toHaveLength(3);expect(save).toHaveBeenCalledTimes(3);
    for(const status of [429,500,502,503,504])expect(mayFallback(new OpenRouterRequestError(status,'provider-unavailable'))).toBe(true);
    expect(mayFallback(new OpenRouterRequestError(401,'request-rejected'))).toBe(false);
  });
  it('expires heartbeats without waiting for a transport that ignores abort',async()=>{
    vi.stubEnv('OPENROUTER_API_KEY','fixture');vi.useFakeTimers();
    const profile={...modeModelConfig('quick').profile!,firstOutputMs:1000,totalMs:2000};
    const promise=requestModeModel([],profile,0,vi.fn(()=>new Promise<Response>(()=>{})));
    const assertion=expect(promise).rejects.toMatchObject({kind:'first-output'});
    await vi.advanceTimersByTimeAsync(1001);await assertion;
  });
  it('reasoning clears only the first deadline, never the total deadline',async()=>{
    vi.stubEnv('OPENROUTER_API_KEY','fixture');vi.useFakeTimers();
    const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(frame({reasoning:'thinking'})));}});
    const transport=vi.fn<typeof fetch>().mockResolvedValue(new Response(stream,{headers:{'content-type':'text/event-stream'}}));
    const promise=requestModeModel([],{...modeModelConfig('quick').profile!,firstOutputMs:1000,totalMs:2000},0,transport);
    const assertion=expect(promise).rejects.toMatchObject({kind:'total'});
    await vi.advanceTimersByTimeAsync(2001);await assertion;expect(transport).toHaveBeenCalledOnce();
  });
});
