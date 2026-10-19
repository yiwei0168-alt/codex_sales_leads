import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:https';
import {request as httpRequest} from 'node:http';
import {chromium} from '@playwright/test';

export async function verifyOriginalsBrowser(input:{base:string;cookie:string;keyPath:string;certPath:string;skillName:string}){
 const upstream=new URL(input.base);assert.equal(upstream.protocol,'http:');assert.equal(upstream.hostname,'127.0.0.1');
 const proxy=createServer({key:await readFile(input.keyPath),cert:await readFile(input.certPath)},(request,response)=>{
  const forward=httpRequest({hostname:upstream.hostname,port:upstream.port,path:request.url,method:request.method,headers:{...request.headers,'x-forwarded-proto':'https'}},res=>{
   response.writeHead(res.statusCode??502,res.headers);res.pipe(response);
  });forward.on('error',()=>{response.writeHead(502);response.end();});request.pipe(forward);
 });
 let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 try{
  await new Promise<void>(done=>proxy.listen(0,'127.0.0.1',done));const address=proxy.address();assert(address&&typeof address!=='string');const base=`https://127.0.0.1:${address.port}`;
  browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1280,height:1000}});
  const separator=input.cookie.indexOf('=');assert(separator>0);
  await context.addCookies([{name:input.cookie.slice(0,separator),value:input.cookie.slice(separator+1),url:base,httpOnly:true,secure:true,sameSite:'Lax'}]);
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  const page=await context.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(30000);
  assert.equal((await page.goto(`${base}/knowledge`))?.status(),200);
  await page.getByRole('button',{name:'个人记忆',exact:true}).click();
  await page.getByRole('navigation',{name:'学习记忆分区'}).getByRole('button',{name:'Skill',exact:true}).click();
  await page.locator('.memory-skill-row').filter({hasText:input.skillName}).getByRole('button',{name:'验收审核',exact:true}).click();
  await page.getByRole('button',{name:'打开验收',exact:true}).click();
  const original=page.getByRole('group',{name:'文件原件副本',exact:true});
  await original.getByText('共 2 个原件，0.0 MiB；已保存 0 个。',{exact:true}).waitFor();
  const save=original.getByRole('button',{name:'保存原件副本',exact:true});assert(await save.isEnabled());
  const response=page.waitForResponse(value=>value.url().includes('/acceptance-originals')&&value.request().method()==='POST');await save.click();assert.equal((await response).status(),200);
  await original.getByText('本组文件原件副本已保存。',{exact:true}).waitFor();
  await original.getByText('共 2 个原件，0.0 MiB；已保存 2 个。',{exact:true}).waitFor();assert(await save.isDisabled());
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);assert.deepEqual(errors,[]);
  const screenshot=`tmp/ma24-originals-ui-${randomUUID()}.png`;await page.screenshot({path:screenshot,fullPage:true});
  await context.close();return {actualHttpsBrowserCapture:true,previewBeforeWriteVerified:true,explicitSaveAndDisabledReplayVerified:true,noPageErrors:true,noHorizontalOverflow:true,screenshot};
 }finally{await browser?.close();await new Promise<void>((done,reject)=>proxy.close(error=>error?reject(error):done()));}
}
