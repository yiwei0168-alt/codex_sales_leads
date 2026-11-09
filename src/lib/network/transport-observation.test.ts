import {channel} from 'node:diagnostics_channel';
import {expect,it} from 'vitest';
import {observeModelTransport,markTransportFailure} from './transport-observation';
import {failureDiagnostic} from './failure-diagnostic';
import {mayFallback} from '../assistant/main/mode-fallback';
const url='https://openrouter.ai/api/v1/chat/completions';
const request=()=>({origin:'https://openrouter.ai',path:'/api/v1/chat/completions',method:'POST',headers:'secret credential'});
it.each(['before-request-headers','awaiting-response-headers','response-stream'] as const)('records %s without exposing request content or changing retry policy',async phase=>{
 const error=new TypeError('secret',{cause:{code:'ECONNRESET'}}),r=request();
 await expect(observeModelTransport(url,{method:'POST',body:'private'},async()=>{
  channel('undici:request:create').publish({request:r});
  if(phase!=='before-request-headers')channel('undici:client:sendHeaders').publish({request:r,headers:'secret'});
  if(phase==='response-stream')channel('undici:request:headers').publish({request:r,response:{headers:'secret'}});
  throw error;
 })).rejects.toBe(error);
 expect(failureDiagnostic(error).transport).toMatchObject({phase});
 expect(JSON.stringify(failureDiagnostic(error))).not.toMatch(/secret|private|openrouter|"headers"\s*:/);
 expect(mayFallback(error)).toBe(false);
});
it('does not mistake a proxy CONNECT or a missing instrumentation event for sending the target request',async()=>{
 const error=new Error('private');
 await expect(observeModelTransport(url,{method:'POST'},async()=>{
  const proxy={origin:'http://localhost:7892',path:'openrouter.ai:443',method:'CONNECT'};
  channel('undici:request:create').publish({request:proxy});channel('undici:client:sendHeaders').publish({request:proxy});throw error;
 })).rejects.toBe(error);
 expect(failureDiagnostic(error).transport?.phase).toBe('unknown');
});
it('keeps concurrent same-endpoint requests separate and cleans up listeners',async()=>{
 const before=channel('undici:request:create').hasSubscribers;
 let release:()=>void=()=>{};const gate=new Promise<void>(r=>{release=r;});
 const errors=[new Error('a'),new Error('b')];
 const outcomes=await Promise.allSettled(errors.map((error,i)=>observeModelTransport(url,{method:'POST'},async()=>{
  const r=request();channel('undici:request:create').publish({request:r});
  if(i===0){channel('undici:client:sendHeaders').publish({request:r});await gate;}else release();
  throw error;
 })));
 expect(outcomes.every(o=>o.status==='rejected')).toBe(true);
 expect(failureDiagnostic(errors[0]).transport?.phase).toBe('awaiting-response-headers');
 expect(failureDiagnostic(errors[1]).transport?.phase).toBe('before-request-headers');
 expect(channel('undici:request:create').hasSubscribers).toBe(before);
});
it('retains stream phase locally without trusting arbitrary error fields',()=>{
 const error=Object.assign(new Error('private'),{transport:{phase:'fake',credential:'secret'}});
 expect(failureDiagnostic(error).transport).toBeUndefined();
 markTransportFailure(error,'response-stream',performance.now());
 expect(failureDiagnostic(error).transport?.phase).toBe('response-stream');
});
