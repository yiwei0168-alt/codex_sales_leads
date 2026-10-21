import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';

const built=await build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import{MemoryHistory}from'./src/components/memory-history';createRoot(document.getElementById('root')).render(<MemoryHistory/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'component.js',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const js=built.outputFiles.find(file=>file.path.endsWith('.js'))!.text,css=await readFile('src/app/globals.css','utf8');
const server=createServer((req,res)=>{
 if(req.url==='/component.js'){res.setHeader('content-type','application/javascript');return void res.end(js);}
 if(req.url==='/styles.css'){res.setHeader('content-type','text/css');return void res.end(css);}
 res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><main style="padding:16px"><div class="panel" style="padding:12px" id="root"></div></main><script src="/component.js"></script></html>');
});
await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`;
const state={kind:'email-style',status:'active',usageScope:'internal-learning',marketCodes:[],channelRoles:['SI'],contentCharacters:12};
const item=(id:string,operation:string,changedFields:string[],beforeState:unknown,afterState:unknown)=>({id,memoryId:'11111111-1111-4111-8111-111111111111',operation,changedFields,beforeState,afterState,createdAt:'2026-10-22 00:00:00+00'});
const entries=[item('insert','INSERT',['INSERT'],null,state),item('scope','UPDATE',['status','usage_scope','market_codes','channel_roles'],state,{...state,status:'archived',usageScope:'external-use-approved',marketCodes:['GB','MX'],channelRoles:['Generated long role '+ 'X'.repeat(256)]}),item('body','UPDATE',['content'],state,{...state}),item('delete','DELETE',['DELETE'],state,null),item('legacy','UPDATE',['status','market_codes','content'],{status:null},{status:{raw:'unknown'},marketCodes:'invalid',contentCharacters:-1})];
const browser=await chromium.launch({channel:'chrome',headless:true}),screenshots:string[]=[],errors:string[]=[];let writes=0;
const watchdog=setTimeout(()=>{console.error('Memory audit component watchdog expired');process.exit(1);},90000);watchdog.unref();
try{
 await mkdir('tmp/memory-audit-ui',{recursive:true});
 for(const width of [1366,390,320]){
  const context=await browser.newContext({viewport:{width,height:900}});await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:base});let fail=false;const reads:string[]=[];
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin!==base)return route.abort();if(url.pathname!=='/api/knowledge/memories/history')return route.continue();
   if(route.request().method()!=='GET'){writes++;return route.abort();}reads.push(url.search);
   if(fail)return route.fulfill({status:503,json:{error:'Synthetic read failure'}});
   const next=url.searchParams.get('offset')==='50';return route.fulfill({json:{items:next?[item('page-two','INSERT',['INSERT'],null,state)]:entries,hasMore:!next}});
  });
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));await page.goto(base);
  const entry=(id:string)=>page.locator(`[data-memory-audit-id="${id}"]`),cells=async(id:string,label:string)=>entry(id).getByRole('row').filter({has:page.getByRole('rowheader',{name:label,exact:true})}).getByRole('cell').allTextContents();
  await expect(page.getByRole('table',{name:'已记录的状态与范围',exact:true})).toHaveCount(5);assert.deepEqual(await cells('insert','国家范围'),['新增前无记录','未限定']);assert.deepEqual(await cells('scope','状态'),['启用','停用']);assert.deepEqual(await cells('scope','使用范围'),['内部学习','已授权对外使用']);assert.deepEqual(await cells('body','正文字符数'),['12 字符','12 字符']);await expect(entry('body')).toContainText('正文已修改');await expect(entry('legacy')).toContainText('未记录');await expect(entry('legacy')).toContainText('空值');await expect(entry('legacy')).toContainText('记录格式异常');
  assert(await page.locator('details.raw-json-details').evaluateAll(elements=>elements.length===5&&elements.every(element=>!(element as HTMLDetailsElement).open)));
  for(const id of ['scope','body']){await entry(id).scrollIntoViewIfNeeded();const table=entry(id).getByRole('table');assert(await table.evaluate(element=>element.scrollWidth<=element.clientWidth+1));const path=`tmp/memory-audit-ui/${id}-${width}.png`;await entry(id).screenshot({path});screenshots.push(path);}
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await entry('scope').getByText('状态与范围快照',{exact:true}).click();await entry('scope').getByRole('button',{name:'复制 JSON',exact:true}).click();await expect(entry('scope').getByRole('status')).toHaveText('已复制原始 JSON');assert.deepEqual(JSON.parse(await page.evaluate(()=>navigator.clipboard.readText())),{before:entries[1].beforeState,after:entries[1].afterState});
  await page.getByRole('button',{name:'下一页',exact:true}).click();await expect(entry('page-two')).toBeVisible();await expect(page.getByRole('button',{name:'下一页',exact:true})).toBeDisabled();assert(reads.includes('?offset=50'));await page.getByRole('button',{name:'上一页',exact:true}).click();await expect(entry('scope')).toBeVisible();
  fail=true;await page.getByRole('button',{name:'刷新历史',exact:true}).click();await expect(page.getByRole('alert')).toContainText('读取失败');await expect(page.locator('[data-memory-audit-id]')).toHaveCount(0);fail=false;await page.getByRole('button',{name:'刷新历史',exact:true}).click();await expect(entry('scope')).toBeVisible();await expect(page.getByRole('alert')).toHaveCount(0);await context.close();
 }
 assert.deepEqual(errors,[]);assert.equal(writes,0);const result={memoryAuditComponent:'passed',viewports:3,readableInsertDeleteAndScopeChanges:true,sameLengthBodyChangeExplicit:true,missingNullMalformedDistinguished:true,rawSnapshotInitiallyCollapsedAndCopyExact:true,pagination:true,failedReadClearsOldDiffAndRetryRecovers:true,longScopeWrapsWithoutOverflow:true,screenshots,syntheticHttpOnly:true,writes,actualModelCalls:0};await writeFile('tmp/memory-audit-ui/result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{clearTimeout(watchdog);await browser.close();server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}
