import { z } from 'zod';
import { AsyncLocalStorage } from 'node:async_hooks';
import { modeModelIds } from './mode-config';

const scope = new AsyncLocalStorage<boolean>();
export const withModeStream = <T>(fn:()=>T):T => scope.run(true,fn);
/** Admission is scoped to the server adapter, never enabled by a client request flag. */
export function isModeStreamRequest(url:URL, body:Record<string,unknown>):boolean {
  const p=body.provider as Record<string,unknown>|undefined;
  return scope.getStore()===true&&url.origin==='https://openrouter.ai'&&url.pathname==='/api/v1/chat/completions'&&!url.search
    &&typeof body.model==='string'&&modeModelIds.has(body.model)&&body.stream===true
    &&p?.data_collection==='deny'&&p.require_parameters===true&&p.allow_fallbacks===false
    &&Number.isInteger(body.max_tokens)&&Number(body.max_tokens)>0&&Number(body.max_tokens)<=16384;
}
export class ModelWaitError extends Error { constructor(readonly kind:'first-output'|'total'){super(`Model wait exceeded: ${kind}`);} }
export class ModelReceiptError extends Error {constructor(){super('Model receipt requires reconciliation');}}
export class ModelStreamError extends Error {constructor(){super('Incomplete or invalid model stream');}}
const chunkSchema=z.object({id:z.string().optional(),model:z.string().optional(),provider:z.string().optional(),usage:z.record(z.string(),z.unknown()).optional(),error:z.unknown().optional(),
  choices:z.array(z.object({index:z.number().optional(),finish_reason:z.string().nullable().optional(),delta:z.object({
    content:z.string().nullable().optional(),reasoning:z.string().nullable().optional(),reasoning_details:z.array(z.record(z.string(),z.unknown())).optional(),
    tool_calls:z.array(z.object({index:z.number().int().min(0).max(11),id:z.string().optional(),type:z.string().optional(),function:z.object({name:z.string().optional(),arguments:z.string().optional()}).optional()})).optional(),
  }).optional()})).optional()});

/** Buffer until terminal completion: partial tool arguments can never reach execution. */
export async function collectModelStream(response:Response,signal:AbortSignal,onProgress:()=>void):Promise<Response>{
  if(!response.ok)return response;
  if(!response.headers.get('content-type')?.includes('text/event-stream')||!response.body)throw new ModelStreamError();
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let buffer='',bytes=0,doneMarker=false,finish:string|undefined,content='',reasoning='';
  const calls=new Map<number,{id:string;type:'function';function:{name:string;arguments:string}}>();
  const details=new Map<number,Record<string,unknown>>();
  let meta:Record<string,unknown>={};
  function frame(raw:string){
    const data=raw.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
    if(!data)return;
    if(data==='[DONE]'){doneMarker=true;return;}
    if(doneMarker)throw new ModelStreamError();
    const chunk=chunkSchema.parse(JSON.parse(data));
    if(chunk.error)throw new ModelStreamError();
    meta={...meta,...(chunk.id?{id:chunk.id}:{}),...(chunk.model?{model:chunk.model}:{}),...(chunk.provider?{provider:chunk.provider}:{}),...(chunk.usage?{usage:chunk.usage}:{})};
    for(const choice of chunk.choices??[]){
      if((choice.index??0)!==0)throw new ModelStreamError();
      if(choice.finish_reason){if(finish&&finish!==choice.finish_reason)throw new ModelStreamError();finish=choice.finish_reason;}
      const d=choice.delta;if(!d)continue;
      if(d.content||d.reasoning||d.reasoning_details?.some(v=>v.text||v.data||v.summary)||d.tool_calls?.some(c=>c.id||c.function?.name||c.function?.arguments))onProgress();
      content+=d.content??'';reasoning+=d.reasoning??'';
      for(const [i,part] of (d.reasoning_details??[]).entries()){
        const index=typeof part.index==='number'?part.index:i,prior=details.get(index)??{};
        const merged={...prior,...part};
        for(const key of ['text','data','summary'])if(typeof prior[key]==='string'&&typeof part[key]==='string')merged[key]=prior[key]+part[key];
        details.set(index,merged);
      }
      for(const delta of d.tool_calls??[]){
        const call=calls.get(delta.index)??{id:'',type:'function' as const,function:{name:'',arguments:''}};
        if(delta.type&&delta.type!=='function')throw new ModelStreamError();
        if(delta.id){if(call.id&&call.id!==delta.id)throw new ModelStreamError();call.id=delta.id;}
        call.function.name+=delta.function?.name??'';call.function.arguments+=delta.function?.arguments??'';
        calls.set(delta.index,call);
      }
    }
  }
  const cancel=()=>{void reader.cancel().catch(()=>undefined);};signal.addEventListener('abort',cancel,{once:true});
  try{
    while(!doneMarker){signal.throwIfAborted();const next=await reader.read();signal.throwIfAborted();if(next.done)break;
      bytes+=next.value.byteLength;if(bytes>4_000_000)throw new ModelStreamError();
      buffer+=decoder.decode(next.value,{stream:true});buffer=buffer.replaceAll('\r\n','\n');
      let end;while((end=buffer.indexOf('\n\n'))>=0){frame(buffer.slice(0,end));buffer=buffer.slice(end+2);}
    }
    if(!doneMarker||!finish||!['stop','tool_calls'].includes(finish))throw new ModelStreamError();
    return Response.json({...meta,choices:[{finish_reason:finish,message:{role:'assistant',content:content||null,
      ...(calls.size?{tool_calls:[...calls.entries()].sort(([a],[b])=>a-b).map(([,v])=>v)}:{}),
      ...(reasoning?{reasoning}:{}),...(details.size?{reasoning_details:[...details.values()]}:{})}}]});
  }finally{signal.removeEventListener('abort',cancel);await reader.cancel().catch(()=>undefined);reader.releaseLock();}
}
