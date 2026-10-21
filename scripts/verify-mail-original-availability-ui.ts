import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';

const id='11111111-1111-4111-8111-111111111111';
const built=await build({stdin:{contents:`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{useMailCompanyLink}from'./src/components/mail-company-link';const initial={companyId:'physical-old',companyName:'Old initial company',source:'user-confirmed'};function Harness(){const[body,setBody]=useState<string|undefined>('Generated cached original'),[error,setError]=useState('');const view=useMailCompanyLink({messageId:'${id}',current:initial,onUnavailable:()=>{window.__unavailable=(window.__unavailable??0)+1;setBody(undefined);setError('原邮件当前不可读取，请刷新列表核对。');},onDeleted:()=>{window.__deleted=(window.__deleted??0)+1;},onChanged:()=>{}});async function restore(){const response=await fetch('/api/mailbox/messages/${id}',{cache:'no-store'});if(!response.ok)return;const value=await response.json();if(value.message.id==='${id}'&&typeof value.message.bodyText==='string'){setBody(value.message.bodyText);setError('');}}return <>{error&&<p role="alert">{error}</p>}<button onClick={()=>void restore()}>重新读取原文</button>{body!==undefined&&<><pre aria-label="缓存原文">{body}</pre><section aria-label="关联面板">{view}</section></>}</>;}createRoot(document.getElementById('root')).render(<Harness/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const css=(await Promise.all(['src/app/globals.css','src/app/conversation-theme.css'].map(path=>readFile(path,'utf8')))).join('\n');
const server=createServer((req,res)=>{if(req.url==='/component.js'){res.setHeader('content-type','application/javascript');res.end(built.outputFiles[0].text);}else if(req.url==='/styles.css'){res.setHeader('content-type','text/css');res.end(css);}else{res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body class="conversation-theme"><main style="padding:16px"><div id="root"></div></main><script src="/component.js"></script></body></html>');}});
await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`;
const browser=await chromium.launch({channel:'chrome',headless:true}),results:unknown[]=[],screenshots:string[]=[];
const watchdog=setTimeout(()=>{console.error('Mail original availability watchdog expired');process.exit(1);},90000);watchdog.unref();
try{
 await mkdir('tmp/mail-original-availability',{recursive:true});
 for(const width of [1366,390,320]){
  const context=await browser.newContext({viewport:{width,height:760}}),page=await context.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  let status=200,reads=0,mutations=0;
  await context.route('**/api/mailbox/messages/*',async route=>{
   assert.equal(new URL(route.request().url()).pathname,'/api/mailbox/messages/'+id);
   if(route.request().method()!=='GET'){mutations++;return route.fulfill({status:500,json:{}});}reads++;
   return route.fulfill(status!==200?{status,json:{error:'Generated source response'}}:{json:{message:{id,bodyText:'Generated restored original'},companyLink:{companyId:'physical-fresh',companyName:'Generated fresh company',source:'user-confirmed'}}});
  });
  for(const denied of [401,403,404]){
   status=denied;reads=0;await page.goto(base);const panel=page.getByRole('region',{name:'关联面板'});
   await expect(page.getByLabel('缓存原文')).toContainText('Generated cached original');await panel.getByRole('button',{name:'读取当前关联'}).click();
   await expect(page.getByRole('alert')).toContainText('原邮件当前不可读取');await expect(page.getByLabel('缓存原文')).toHaveCount(0);await expect(panel).toHaveCount(0);await expect(page.locator('body')).not.toContainText('本地邮件已删除');assert.equal(mutations,0);assert.equal(reads,1);
   assert.equal(await page.evaluate(()=>(window as Window&{__unavailable?:number}).__unavailable??0),1);assert.equal(await page.evaluate(()=>(window as Window&{__deleted?:number}).__deleted??0),0);
   status=200;await page.getByRole('button',{name:'重新读取原文'}).click();await expect(page.getByLabel('缓存原文')).toContainText('Generated restored original');await panel.getByRole('button',{name:'读取当前关联'}).click();
   await expect(panel.locator('p').filter({hasText:/^关联公司：/})).toContainText('Generated fresh company');await expect(panel).not.toContainText('Old initial company');assert.equal(reads,3);assert.equal(mutations,0);
  }
  status=503;reads=0;await page.goto(base);const panel=page.getByRole('region',{name:'关联面板'});await panel.getByRole('button',{name:'读取当前关联'}).click();await expect(panel.getByRole('alert')).toContainText('当前关联读取失败');await expect(page.getByLabel('缓存原文')).toContainText('Generated cached original');assert.equal(await page.evaluate(()=>(window as Window&{__unavailable?:number}).__unavailable??0),0);
  status=200;await panel.getByRole('button',{name:'读取当前关联'}).click();await expect(panel.locator('p').filter({hasText:/^关联公司：/})).toContainText('Generated fresh company');assert.equal(reads,2);assert.equal(mutations,0);assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  const shot=`tmp/mail-original-availability/recovered-${width}.png`;await page.screenshot({path:shot,fullPage:true});screenshots.push(shot);await context.close();results.push({width,denialStatuses:[401,403,404],cachedOriginalAndActionsClearedOnAccessDenial:true,noDeleteAttributionOrMutation:true,explicitOriginalAndMetadataRetryRecover:true,serverErrorDoesNotImplyRevocation:true,verifiedReadNotOverwrittenByInitialMetadata:true,noPageErrors:true});
 }
 const result={mailOriginalAvailabilityComponent:'passed',results,screenshots,syntheticHttpOnly:true,actualModelCalls:0};await writeFile('tmp/mail-original-availability/result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{clearTimeout(watchdog);await browser.close();server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}
