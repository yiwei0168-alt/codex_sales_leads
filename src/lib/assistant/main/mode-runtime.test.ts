import { afterEach, describe, expect, it, vi } from 'vitest';
import { modeModelConfig } from './mode-config';
import { modeAllowsTool } from './mode-tools';
import { collectModelStream, ModelWaitError, ModelReceiptError, withModeStream, isModeStreamRequest } from './model-stream';
import { orderedModeDecision, mayFallback } from './mode-fallback';
import { requestModeModel } from './model';
import { OpenRouterRequestError } from '@/providers/openrouter-batch';

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
  it('saves a failed route before advancing and reuses saved success on recovery',async()=>{
    const saved=new Map<number,{status:string;data:unknown}>(),calls:number[]=[],events:string[]=[];
    const deps={begin:async(i:number)=>({id:String(i),fresh:!saved.has(i),output:saved.get(i)}),request:async(i:number)=>{calls.push(i);events.push(`request${i}`);if(i===0)throw new ModelWaitError('first-output');return 'answer';},save:async(id:string,i:number,value:{status:'success';value:string}|{status:'unavailable';retryable:boolean})=>{events.push(`save${i}`);saved.set(i,{status:value.status,data:value.status==='success'?{value:value.value}:{retryable:value.retryable}});}};
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
