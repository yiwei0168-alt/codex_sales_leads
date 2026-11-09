import {AsyncLocalStorage} from 'node:async_hooks';
import {channel} from 'node:diagnostics_channel';

type Phase='before-request-headers'|'awaiting-response-headers'|'response-stream'|'unknown';
type Observation={phase:Phase;elapsedMs:number};
const observations=new WeakMap<object,Observation>();
const active=new AsyncLocalStorage<object>();
/** Local observations only. Never copy error properties, URLs, headers, bodies or socket addresses. */
export function markTransportFailure(error:unknown,phase:Phase,started:number){
 if(error&&typeof error==='object')observations.set(error,{phase,elapsedMs:Math.max(0,Math.round(performance.now()-started))});
}
export function transportFailureObservation(error:unknown){
 return error&&typeof error==='object'?observations.get(error):undefined;
}

/** Diagnostic evidence, never authorization to retry or infer zero provider spend. */
export async function observeModelTransport<T>(input:RequestInfo|URL,init:RequestInit|undefined,operation:()=>Promise<T>):Promise<T>{
 const url=new URL(input instanceof Request?input.url:String(input));
 const method=(init?.method??(input instanceof Request?input.method:'GET')).toUpperCase();
 const token={},requests=new Set<object>(),started=performance.now();let sent=false,received=false;
 const created=(message:unknown)=>{
  if(active.getStore()!==token)return;
  const request=(message as {request?:{origin?:unknown;path?:unknown;method?:unknown}})?.request;
  // Ignore the proxy CONNECT exchange and other concurrent operations.
  if(request&&String(request.origin)===url.origin&&request.path===url.pathname+url.search&&request.method===method)requests.add(request);
 };
 const sentHeaders=(message:unknown)=>{if(requests.has((message as {request:object})?.request))sent=true;};
 const receivedHeaders=(message:unknown)=>{if(requests.has((message as {request:object})?.request))received=true;};
 const handlers=[['undici:request:create',created],['undici:client:sendHeaders',sentHeaders],['undici:request:headers',receivedHeaders]] as const;
 for(const [name,handler] of handlers)channel(name).subscribe(handler);
 try{return await active.run(token,operation);}
 catch(error){
  markTransportFailure(error,requests.size!==1?'unknown':received?'response-stream':sent?'awaiting-response-headers':'before-request-headers',started);
  throw error;
 }finally{for(const [name,handler] of handlers)channel(name).unsubscribe(handler);}
}
