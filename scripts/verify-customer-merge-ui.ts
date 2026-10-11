import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{MailboxCustomers}from'./src/components/mailbox-customers';createRoot(document.getElementById('root')).render(<MailboxCustomers/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const css=(await Promise.all(['globals','ipados','conversation-theme','intelligence-theme','agent-mode-picker'].map(name=>readFile(`src/app/${name}.css`,'utf8')))).join('\n');
const server=createServer((req,res)=>{if(req.url==='/component.js'){res.setHeader('content-type','application/javascript');res.end(bundle.outputFiles[0].text);}else if(req.url==='/styles.css'){res.setHeader('content-type','text/css');res.end(css);}else{res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body class="conversation-theme"><div id="root"></div><script src="/component.js"></script></body></html>');}});
await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert(address&&typeof address!=='string');
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
const source={id:'source',name:'Source Company',domain:'source.example',country:'DE',customer_type:'inquiry',notes:'Saved note',confirmed:true,archived:false,revision:1};
const target={...source,id:'target',name:'Target Company',domain:'target.example'};
try{
 await mkdir('tmp/customer-merge-ui',{recursive:true});
 for(const viewport of [{width:1366,height:900},{width:1366,height:360},{width:390,height:760},{width:320,height:480}]){
  const page=await browser.newPage({viewport}),errors:string[]=[],posts:unknown[]=[];let fail=true,mergeReads=0;
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/mailbox/customers?*',async route=>{
   const url=new URL(route.request().url());
   if(url.searchParams.has('id')){await route.fulfill({json:{customer:url.searchParams.get('id')==='source'?source:target,events:[],hasMore:false}});return;}
   if(!url.searchParams.has('country')){
    mergeReads++;
    if(fail){await new Promise(done=>setTimeout(done,300));await route.fulfill({status:503,json:{error:'Synthetic failure'}});return;}
    await route.fulfill({json:url.searchParams.get('offset')==='0'?{items:[source],hasMore:true}:{items:[target],hasMore:false}});return;
   }
   await route.fulfill({json:{items:[source,target],countries:[],hasMore:false}});
  });
  await page.route('**/api/mailbox/customers',async route=>{posts.push(route.request().postDataJSON());await route.fulfill({json:{ok:true}});});
  await page.goto(`http://127.0.0.1:${address.port}`);
  await page.getByRole('button',{name:/Source Company/}).click();
  await page.getByRole('button',{name:'确认 / 编辑 / 备注'}).click();
  const dialog=page.getByRole('dialog'),summary=dialog.locator('summary'),select=dialog.getByLabel('合并目标'),merge=dialog.getByRole('button',{name:'确认合并'});
  await summary.click();await expect(select).toBeDisabled();await expect(merge).toBeDisabled();
  await expect(dialog.getByRole('button',{name:'重试合并目标'})).toBeVisible();assert.equal(mergeReads,1);
  fail=false;await dialog.getByRole('button',{name:'重试合并目标'}).click();await expect(select).toBeEnabled();
  await expect(select.locator('option')).toHaveCount(2);assert.equal(mergeReads,3);
  await select.selectOption('target');await expect(merge).toBeEnabled();
  await dialog.locator('textarea').fill('Unsaved edit');await expect(merge).toBeDisabled();await expect(dialog.getByText('请先保存当前编辑，再进行合并。')).toBeVisible();assert.equal(posts.length,0);
  await summary.click();await summary.click();await expect(select).toBeEnabled();await expect(select).toHaveValue('');await expect(merge).toBeDisabled();
  await select.selectOption('target');await expect(merge).toBeDisabled();await dialog.locator('textarea').fill('Saved note');await expect(merge).toBeEnabled();
  await merge.scrollIntoViewIfNeeded();assert.equal(await dialog.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert(await page.locator('.workspace-dialog-body').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  await page.screenshot({path:`tmp/customer-merge-ui/${viewport.width}-${viewport.height}.png`});
  await merge.click();await expect(dialog).toHaveCount(0);await expect(page.getByRole('heading',{name:'Target Company'})).toBeVisible();
  assert.deepEqual(posts,[{action:'merge',id:'source',targetId:'target'}]);assert.deepEqual(errors,[]);
  results.push({...viewport,loadingFailureRetry:true,pagination:true,selfExcluded:true,dirtyBlocked:true,reopenClearsSelection:true,targetTimeline:true,opaque:true,noOverflow:true});await page.close();
 }
 await writeFile('tmp/customer-merge-ui/result.json',JSON.stringify({actualComponent:true,productionStyles:true,syntheticApi:true,results},null,2));console.log(JSON.stringify({passed:true,results}));
}finally{await browser.close();await new Promise<void>(done=>server.close(()=>done()));}
