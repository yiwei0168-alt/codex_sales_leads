import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';

const built=await build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import{KnowledgeRevisions}from'./src/components/knowledge-revisions';createRoot(document.getElementById('root')).render(<KnowledgeRevisions documentId="11111111-1111-4111-8111-111111111111"/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const css=(await Promise.all(['src/app/globals.css','src/app/conversation-theme.css'].map(path=>readFile(path,'utf8')))).join('\n');
const server=createServer((req,res)=>{if(req.url==='/component.js'){res.setHeader('content-type','application/javascript');res.end(built.outputFiles[0].text);}else if(req.url==='/styles.css'){res.setHeader('content-type','text/css');res.end(css);}else{res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body class="conversation-theme"><main style="padding:16px"><div id="root"></div></main><script src="/component.js"></script></body></html>');}});
await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`;
const browser=await chromium.launch({channel:'chrome',headless:true}),results:unknown[]=[],screenshots:string[]=[];
const watchdog=setTimeout(()=>{console.error('Revision history UI watchdog expired');process.exit(1);},90000);watchdog.unref();
try{
 await mkdir('tmp/knowledge-revisions-recovery',{recursive:true});
 for(const width of [1366,390,320]){
  const context=await browser.newContext({viewport:{width,height:760}});const page=await context.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  let mode:'malformed'|'good'|'failed'|'held'='malformed',malformed:unknown=[null],release:(()=>void)|undefined,requests=0;
  await context.route('**/api/knowledge/library/history?*',async route=>{
   requests++;const offset=Number(new URL(route.request().url()).searchParams.get('offset'));const current=mode;
   if(current==='held')await new Promise<void>(done=>{release=done;});
   if(current==='failed')return route.fulfill({status:503,json:{}});
   if(current==='malformed')return route.fulfill({json:{items:malformed,hasMore:false}});
   return route.fulfill({json:{items:[{id:`revision-${offset}`,title:`Generated owner history ${offset}`,time:'2026-10-22T00:00:00Z',content:'LongHistoryCoordinate'.repeat(70),truncated:true,reconstructed:true}],hasMore:offset===0}}).catch(()=>{});
  });
  await page.goto(base);await page.getByText('历史内容版本',{exact:true}).click();
  // A valid JSON response with a malformed row must be treated as a read failure,
  // never crash React or expose prior content as the current page.
  await expect(page.getByRole('alert')).toContainText('版本读取失败').catch(async error=>{console.log(JSON.stringify({revisionMalformedResponseFailure:{pageErrors:errors,rootContent:await page.locator('#root').textContent()}}));throw error;});assert.deepEqual(errors,[]);
  for(const bad of [[{id:'bad',title:'Bad',time:'now',content:7,truncated:false,reconstructed:false}],{items:[]},[{id:'bad'}]]){
   malformed=bad;await page.getByRole('button',{name:'重试',exact:true}).click();await expect(page.getByRole('alert')).toContainText('版本读取失败');assert.deepEqual(errors,[]);
  }
  mode='good';await page.getByRole('button',{name:'重试',exact:true}).click();await expect(page.getByText('Generated owner history 0',{exact:false})).toBeVisible();await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByText('Generated owner history 0',{exact:false}).click();await expect(page.locator('pre')).toHaveText('LongHistoryCoordinate'.repeat(70));await expect(page.getByText('旧版本由历史检索片段重建，可能存在重叠；不代表原文件逐字副本。',{exact:true})).toBeVisible();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  mode='failed';await page.getByRole('button',{name:'下一页版本'}).click();await expect(page.getByRole('alert')).toContainText('版本读取失败');await expect(page.locator('pre')).toHaveCount(0);await expect(page.getByText('没有历史版本',{exact:true})).toHaveCount(0);
  mode='good';await page.getByRole('button',{name:'重试',exact:true}).click();await expect(page.getByText('Generated owner history 10',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'下一页版本'})).toBeDisabled();await page.getByRole('button',{name:'上一页版本'}).click();await expect(page.getByText('Generated owner history 0',{exact:false})).toBeVisible();
  if(width===1366){
   mode='held';await page.getByRole('button',{name:'下一页版本'}).click();await expect.poll(()=>Boolean(release)).toBe(true);await expect(page.getByRole('status')).toContainText('正在读取版本');await expect(page.getByText('没有历史版本',{exact:true})).toHaveCount(0);
   await expect(page.getByRole('alert')).toContainText('版本读取失败',{timeout:13000});await expect(page.getByRole('button',{name:'重试',exact:true})).toBeEnabled();mode='good';await page.getByRole('button',{name:'重试',exact:true}).click();await expect(page.getByText('Generated owner history 10',{exact:false})).toBeVisible();release!();release=undefined;
  }
  const screenshot=`tmp/knowledge-revisions-recovery/recovered-${width}.png`;await page.screenshot({path:screenshot,fullPage:true});screenshots.push(screenshot);assert.deepEqual(errors,[]);assert(requests>=7);await context.close();
  results.push({width,malformedRowsRefusedWithoutReactCrash:true,readFailureHidesOldPageAndDoesNotClaimEmpty:true,retryRetainsPage:true,pagingAndHistoryWarnings:true,longContentWraps:true,actualDeadlineVerified:width===1366});
 }
 const result={knowledgeRevisionRecoveryComponent:'passed',results,screenshots,syntheticHttpOnly:true,actualModelCalls:0};await writeFile('tmp/knowledge-revisions-recovery/result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{clearTimeout(watchdog);await browser.close();server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}
