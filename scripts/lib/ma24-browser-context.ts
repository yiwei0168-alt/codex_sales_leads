import assert from 'node:assert/strict';
import type {Browser,BrowserContextOptions} from '@playwright/test';

/** Self-signed trust bypass is confined to disposable loopback HTTPS probes. */
export function ma24BrowserContext(browser:Browser,options:{base:string;allowSelfSignedLoopback?:boolean},context:BrowserContextOptions){
  if(!options.allowSelfSignedLoopback)return browser.newContext(context);
  const base=new URL(options.base);
  assert(base.protocol==='https:'&&['127.0.0.1','localhost','[::1]'].includes(base.hostname),
    'Self-signed probe requires loopback HTTPS');
  return browser.newContext({...context,ignoreHTTPSErrors:true});
}
