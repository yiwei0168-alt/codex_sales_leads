import assert from 'node:assert/strict';
import type {Browser,BrowserContextOptions} from '@playwright/test';
import {Agent,fetch as localFetch} from 'undici';

type ProbeOptions={base:string;allowSelfSignedLoopback?:boolean};
function selfSignedBase(options:ProbeOptions){
  const base=new URL(options.base);
  assert(base.protocol==='https:'&&['127.0.0.1','localhost','[::1]'].includes(base.hostname),
    'Self-signed probe requires loopback HTTPS');
  return base;
}

/** Direct fixture API reads share the same strictly loopback TLS exception. */
export async function ma24FixtureFetch(options:ProbeOptions,input:string,init?:RequestInit):Promise<Response>{
  if(!options.allowSelfSignedLoopback)return globalThis.fetch(input,init);
  const base=selfSignedBase(options),url=new URL(input);
  assert(url.origin===base.origin&&!url.username&&!url.password,'Fixture API request escaped loopback origin');
  const agent=new Agent({connect:{rejectUnauthorized:false}});
  try{
    const response=await localFetch(input,{...init,dispatcher:agent,redirect:'error'} as Parameters<typeof localFetch>[1]);
    const body=await response.arrayBuffer();
    return new Response([204,205,304].includes(response.status)?null:body,{status:response.status,headers:Object.fromEntries(response.headers)});
  }finally{await agent.close();}
}

/** Self-signed trust bypass is confined to disposable loopback HTTPS probes. */
export function ma24BrowserContext(browser:Browser,options:ProbeOptions,context:BrowserContextOptions){
  if(!options.allowSelfSignedLoopback)return browser.newContext(context);
  selfSignedBase(options);
  return browser.newContext({...context,ignoreHTTPSErrors:true});
}
