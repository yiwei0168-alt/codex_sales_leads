import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium,expect,type Route} from '@playwright/test';

const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{MailboxCustomers}from'./src/components/mailbox-customers';createRoot(document.getElementById('root')).render(<MailboxCustomers/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const css=(await Promise.all(['globals','ipados','conversation-theme','intelligence-theme','agent-mode-picker'].map(name=>readFile(`src/app/${name}.css`,'utf8')))).join('\n');
const server=createServer((req,res)=>{if(req.url==='/component.js'){res.setHeader('content-type','application/javascript');res.end(bundle.outputFiles[0].text);}else if(req.url==='/styles.css'){res.setHeader('content-type','text/css');res.end(css);}else{res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body class="conversation-theme"><div id="root"></div><script src="/component.js"></script></body></html>');}});
await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert(address&&typeof address!=='string');
const source={id:'source',name:'Source Company',domain:'source.example',country:'DE',customer_type:'inquiry',notes:'Saved note',confirmed:true,archived:false,revision:1};
const target={...source,id:'target',name:'Target Company',domain:'target.example'};
const event=(id:string)=>({id:id+'-mail',time:null,subject:id+' subject',excerpt:'Synthetic timeline excerpt',thread:null,threadEvidence:'headers',sender:[],recipients:[],source:'confirmed',summary:null});
const longBody='Target original\n'+('GeneratedOriginalCoordinate'.repeat(8)+'\n').repeat(40);
const browser=await chromium.launch({channel:'chrome',headless:true}),results:unknown[]=[];
try{
 await mkdir('tmp/customer-original-recovery',{recursive:true});
 for(const viewport of [{width:1366,height:900},{width:390,height:760},{width:320,height:480}]){
  const page=await browser.newPage({viewport}),errors:string[]=[],writes:string[]=[];let timelineReads=0,held:Route|null=null,heldDeadline:Route|null=null,mode='valid';
  page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.url().includes('/api/')&&request.method()!=='GET')writes.push(request.method());});
  await page.addInitScript(()=>{const original=window.fetch.bind(window);window.fetch=(input,init)=>original(input,{...init,signal:undefined});});
  await page.route('**/api/mailbox/customers?*',async route=>{const id=new URL(route.request().url()).searchParams.get('id');if(id){timelineReads++;await route.fulfill({json:{customer:id==='source'?source:target,events:[event(id)],hasMore:false}});}else await route.fulfill({json:{items:[source,target],countries:[],hasMore:false}});});
  await page.route('**/api/mailbox/messages/*',async route=>{
   if(route.request().url().endsWith('/source-mail')){held=route;return;}
   if(mode==='delay'){heldDeadline=route;return;}
   if(mode==='503'){await route.fulfill({status:503,json:{error:'synthetic-original-read-failure'}});return;}
   if(mode==='404'){await route.fulfill({status:404,json:{error:'missing'}});return;}
   await route.fulfill({json:{message:mode==='wrong-id'?{id:'other-mail',bodyText:'WRONG ORIGINAL'}:mode==='malformed'?{id:'target-mail',bodyText:null}:{id:'target-mail',subject:'Target subject',bodyText:longBody}}});
  });
  await page.goto(`http://127.0.0.1:${address.port}`);const list=page.locator('.customer-list'),timeline=page.getByRole('region',{name:'客户沟通时间线'}),dialog=page.getByRole('dialog',{name:'原邮件正文'});
  await list.getByRole('button',{name:/Source Company/}).click();await timeline.getByRole('button',{name:'查看原邮件',exact:true}).click();await expect.poll(()=>Boolean(held)).toBe(true);
  if(await dialog.count())await dialog.getByRole('button',{name:'关闭窗口'}).click();
  if(viewport.width<700)await timeline.getByRole('button',{name:'返回公司列表'}).click();await list.getByRole('button',{name:/Target Company/}).click();await expect(timeline.getByRole('heading',{name:'target subject',exact:true})).toBeVisible();
  const readCount=timelineReads;await timeline.getByRole('button',{name:'查看原邮件',exact:true}).click();await expect(dialog.locator('pre')).toHaveText(longBody);
  assert(held);const completed=page.waitForResponse(response=>response.url().endsWith('/source-mail'));await (held as Route).fulfill({json:{message:{id:'source-mail',subject:'Source subject',bodyText:'LATE SOURCE ORIGINAL',sender:[],recipients:[]}}});await (await completed).finished();await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  console.log(JSON.stringify({customerOriginalRaceObservation:{width:viewport.width,lateSourceShown:await dialog.locator('pre').textContent()==='LATE SOURCE ORIGINAL'}}));await expect(dialog.locator('pre')).toHaveText(longBody);assert.equal(timelineReads,readCount,'Reading originals must not refresh timeline metadata');
  await dialog.getByRole('button',{name:'关闭窗口'}).click();
  for(const failure of ['503','wrong-id','malformed','404']){
   mode=failure;await timeline.getByRole('button',{name:'查看原邮件',exact:true}).click();await expect(dialog.getByRole('alert')).toBeVisible();await expect(dialog.locator('pre')).toHaveCount(0);mode='valid';await dialog.getByRole('button',{name:'重试原邮件'}).click();await expect(dialog.locator('pre')).toHaveText(longBody);await dialog.getByRole('button',{name:'关闭窗口'}).click();
  }
  if(viewport.width===1366){mode='delay';await timeline.getByRole('button',{name:'查看原邮件',exact:true}).click();await expect(dialog.getByRole('status')).toContainText('正在读取');await expect(dialog.getByRole('alert')).toContainText('超时',{timeout:15000});assert(heldDeadline);mode='valid';await dialog.getByRole('button',{name:'重试原邮件'}).click();await expect(dialog.locator('pre')).toHaveText(longBody);const done=page.waitForResponse(response=>response.url().endsWith('/target-mail'));await (heldDeadline as Route).fulfill({json:{message:{id:'target-mail',bodyText:'LATE DEADLINE ORIGINAL'}}});await(await done).finished();await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await expect(dialog.locator('pre')).toHaveText(longBody);await dialog.getByRole('button',{name:'关闭窗口'}).click();}
  await timeline.getByRole('button',{name:'查看原邮件',exact:true}).click();await expect(dialog.locator('pre')).toHaveText(longBody);assert(await dialog.locator('.workspace-dialog-body').evaluate(el=>el.scrollWidth<=el.clientWidth+1));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.equal(timelineReads,readCount);
  const screenshot=`tmp/customer-original-recovery/recovered-${viewport.width}.png`;await page.screenshot({path:screenshot,fullPage:true});results.push({viewport,lateOriginalCannotCrossCompany:true,originalReadDoesNotRefreshTimeline:true,status503And404Retry:true,wrongIdentityAndMalformedBodyRefused:true,actualDeadlineAndLateRetryGuard:viewport.width===1366,noHorizontalOverflow:true,pageErrors:0,mutations:0,screenshot});await page.close();
 }
 const result={customerOriginalRecoveryComponent:'passed',syntheticHttpOnly:true,actualModelCalls:0,results};await writeFile('tmp/customer-original-recovery/result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}
