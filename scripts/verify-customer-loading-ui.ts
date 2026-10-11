import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium,expect,type Route} from '@playwright/test';
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{MailboxCustomers}from'./src/components/mailbox-customers';createRoot(document.getElementById('root')).render(<MailboxCustomers/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const css=(await Promise.all(['globals','ipados','conversation-theme','intelligence-theme','agent-mode-picker'].map(name=>readFile(`src/app/${name}.css`,'utf8')))).join('\n');
const server=createServer((req,res)=>{if(req.url==='/component.js'){res.setHeader('content-type','application/javascript');res.end(bundle.outputFiles[0].text);}else if(req.url==='/styles.css'){res.setHeader('content-type','text/css');res.end(css);}else{res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body class="conversation-theme"><div id="root"></div><script src="/component.js"></script></body></html>');}});
await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert(address&&typeof address!=='string');
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
const source={id:'source',name:'Source Company',domain:'source.example',country:'DE',customer_type:'inquiry',notes:'Saved note',confirmed:true,archived:false,revision:1};
const target={...source,id:'target',name:'Target Company',domain:'target.example',country:'US'};
const event=(subject:string)=>({id:subject,time:null,subject,excerpt:'Synthetic local content',thread:null,threadEvidence:'headers',sender:[],recipients:[],source:'confirmed',summary:null});
try{
 await mkdir('tmp/customer-loading-ui',{recursive:true});
 for(const viewport of [{width:1366,height:900},{width:320,height:480}]){
  const page=await browser.newPage({viewport}),errors:string[]=[],posts:unknown[]=[];
  let failList=true,failPage=true,delaySource=false,delayTarget=false,held:Route|null=null,heldTarget:Route|null=null,releaseDone=false;
  page.on('pageerror',error=>errors.push(error.message));
  // Deliberately ignore AbortSignal in this fixture, forcing late responses to arrive.
  await page.addInitScript(()=>{const original=window.fetch.bind(window);window.fetch=(input,init)=>original(input,{...init,signal:undefined});});
  await page.route('**/api/mailbox/customers?*',async route=>{
   const url=new URL(route.request().url()),id=url.searchParams.get('id');
   if(id){
    if(id==='target'&&delayTarget){heldTarget=route;return;}
    if(id==='source'&&delaySource){held=route;return;}
    if(url.searchParams.get('offset')==='20'&&failPage){await route.fulfill({status:503,json:{error:'Synthetic page failure'}});return;}
    await route.fulfill({json:{customer:id==='source'?source:target,events:[event(id==='source'?(url.searchParams.get('offset')==='20'?'Older source event':'Current source event'):'Target event')],hasMore:url.searchParams.get('offset')==='0'}});return;
   }
   if(failList){await new Promise(done=>setTimeout(done,150));await route.fulfill({status:503,json:{error:'Synthetic list failure'}});return;}
   await route.fulfill({json:{items:url.searchParams.get('country')==='US'?[target]:[source,target],countries:[{country:'DE',count:1},{country:'US',count:1}],hasMore:false}});
  });
  await page.route('**/api/mailbox/customers',async route=>{posts.push(route.request().postDataJSON());await route.fulfill({json:{ok:true}});});
  await page.goto(`http://127.0.0.1:${address.port}`);
  const list=page.locator('.customer-list'),timeline=page.getByRole('region',{name:'客户沟通时间线'});
  await expect(list.getByText('正在读取公司…')).toBeVisible();await expect(list.getByText(/暂无公司/)).toHaveCount(0);
  await expect(list.getByRole('button',{name:'重试公司列表'})).toBeVisible();await expect(list.getByText(/暂无公司/)).toHaveCount(0);
  failList=false;await list.getByRole('button',{name:'重试公司列表'}).click();await list.getByRole('button',{name:/Source Company/}).click();
  await expect(timeline.getByRole('heading',{name:'Current source event'})).toBeVisible();
  await timeline.getByRole('button',{name:'更早往来'}).click();await expect(timeline.getByRole('button',{name:'重试时间线'})).toBeVisible();
  await expect(timeline.getByRole('heading',{name:'Current source event'})).toHaveCount(0);await expect(timeline.getByText('当前页没有往来记录。')).toHaveCount(0);
  await expect(timeline.getByRole('button',{name:'确认 / 编辑 / 备注'})).toBeDisabled();
  failPage=false;await timeline.getByRole('button',{name:'重试时间线'}).click();await expect(timeline.getByRole('heading',{name:'Older source event'})).toBeVisible();
  await timeline.getByLabel('本页只看重要节点').check();await expect(timeline.getByText(/当前页没有重要节点/)).toBeVisible();await timeline.getByLabel('本页只看重要节点').uncheck();
  delaySource=true;await timeline.getByRole('button',{name:'较新往来'}).click();await expect.poll(()=>Boolean(held)).toBe(true);
  await expect(timeline.getByText('正在读取往来记录…')).toBeVisible();await expect(timeline.getByRole('heading',{name:'Older source event'})).toHaveCount(0);
  if(viewport.width<700)await timeline.getByRole('button',{name:'返回公司列表'}).click();
  await list.getByRole('button',{name:/Target Company/}).click();await expect(timeline.getByRole('heading',{name:'Target event'})).toBeVisible();
  assert(held);await (held as Route).fulfill({json:{customer:source,events:[event('Late source event')],hasMore:true}});releaseDone=true;
  // Observe completion of the delayed fetch and a render opportunity, not merely immediate DOM state.
  await page.waitForLoadState('networkidle');await expect(timeline.getByRole('heading',{name:'Target Company',exact:true})).toBeVisible();await expect(timeline.getByRole('heading',{name:'Target event'})).toBeVisible();await expect(timeline.getByRole('heading',{name:'Late source event'})).toHaveCount(0);
  // Revisit the same URL while another company's fetch is still unresolved.
  held=null;delayTarget=true;
  if(viewport.width<700)await timeline.getByRole('button',{name:'返回公司列表'}).click();
  await list.getByRole('button',{name:/Source Company/}).click();await expect.poll(()=>Boolean(held)).toBe(true);
  if(viewport.width<700)await timeline.getByRole('button',{name:'返回公司列表'}).click();
  await list.getByRole('button',{name:/Target Company/}).click();await expect.poll(()=>Boolean(heldTarget)).toBe(true);
  await expect(timeline.getByText('正在读取往来记录…')).toBeVisible();await expect(timeline.getByRole('heading',{name:'Target event'})).toHaveCount(0);
  assert(heldTarget);await (heldTarget as Route).fulfill({json:{customer:target,events:[event('Fresh target event')],hasMore:false}});
  assert(held);await (held as Route).fulfill({json:{customer:source,events:[event('Another late source event')],hasMore:false}});
  await page.waitForLoadState('networkidle');await expect(timeline.getByRole('heading',{name:'Fresh target event'})).toBeVisible();await expect(timeline.getByRole('heading',{name:'Another late source event'})).toHaveCount(0);
  if(viewport.width<700)await timeline.getByRole('button',{name:'返回公司列表'}).click();
  failList=true;await page.locator('.mailbox-actionbar select').selectOption('US');
  await expect(page.getByText('选择公司查看统一时间线')).toHaveCount(1);await expect(list.getByRole('button',{name:'重试公司列表'})).toBeVisible();await expect(list.getByRole('button',{name:/Source Company/})).toHaveCount(0);await expect(list.getByRole('button',{name:/Target Company/})).toHaveCount(0);
  failList=false;await list.getByRole('button',{name:'重试公司列表'}).click();await expect(list.getByRole('button',{name:/Target Company/})).toBeVisible();await expect(list.getByRole('button',{name:/Source Company/})).toHaveCount(0);
  await page.screenshot({path:`tmp/customer-loading-ui/${viewport.width}.png`});assert.deepEqual(errors,[]);assert.deepEqual(posts,[]);assert(releaseDone);
  results.push({...viewport,listFailureNotEmpty:true,pageFailureHidesOldEvidence:true,retry:true,lateResponseIgnoredWithoutTransportAbort:true,sameUrlRevisitWaitsForFreshData:true,filterClearsSelection:true,noStaleList:true,importantEmptyState:true,noMutations:true});await page.close();
 }
 await writeFile('tmp/customer-loading-ui/result.json',JSON.stringify({actualComponent:true,productionStyles:true,syntheticApi:true,transportAbortDeliberatelyDisabled:true,results},null,2));console.log(JSON.stringify({passed:true,results}));
}finally{await browser.close();await new Promise<void>(done=>server.close(()=>done()));}
