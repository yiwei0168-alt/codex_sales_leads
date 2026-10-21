import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';

const built=await build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import{AgentAttachments}from'./src/components/agent-attachments';function App(){const[ids,setIds]=React.useState([]);return <AgentAttachments selected={ids} onChange={setIds}/>};createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'}});
const css=(await Promise.all(['src/app/globals.css','src/app/conversation-theme.css'].map(path=>readFile(path,'utf8')))).join('\n');
const server=createServer((req,res)=>{if(req.url==='/component.js'){res.setHeader('content-type','application/javascript');res.end(built.outputFiles[0].text);}else if(req.url==='/styles.css'){res.setHeader('content-type','text/css');res.end(css);}else{res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body class="conversation-theme"><div id="root"></div><script src="/component.js"></script></body></html>');}});
await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`;
const browser=await chromium.launch({channel:'chrome',headless:true});const results:unknown[]=[],screenshots:string[]=[];
const watchdog=setTimeout(()=>{console.error('Attachment upload UI watchdog expired');process.exit(1);},90000);watchdog.unref();
try{
 await mkdir('tmp/attachment-upload-ui',{recursive:true});
 for(const width of [1366,390,320]){
  const context=await browser.newContext({viewport:{width,height:760}}),page=await context.newPage(),errors:string[]=[];page.on('pageerror',error=>{errors.push(error.message);console.error('Browser error:',error.message);});
  let posts=0,failJobs=false,failLibrary=false,malformedJobs=false,mode:'hold'|'drop'|'reuse'='hold',release:(()=>void)|undefined;
  const jobs=['pending','running','review-required','searchable','historical','unavailable','failed','unknown'].map((treeStatus,index)=>({id:`job-${index}`,title:index===0?'Generated long title '+ 'X'.repeat(300):`Generated ${treeStatus}`,visibility:'private',status:'pending',treeStatus}));
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
   if(url.pathname==='/api/knowledge/library')return route.fulfill(failLibrary?{status:503,json:{}}:{json:{items:url.searchParams.get('scope')==='private'?[{assetId:'11111111-1111-4111-8111-111111111111',title:'Processed original',scope:'private'}]:[],hasMore:false}});
   if(url.pathname!=='/api/knowledge/uploads')return route.continue();
   if(route.request().method()==='GET'){const offset=Number(url.searchParams.get('offset'));return route.fulfill(failJobs?{status:503,json:{}}:malformedJobs?{json:{jobs:null}}:{json:{jobs:jobs.slice(offset,offset+7)}});}
   assert.equal(route.request().method(),'POST');posts++;assert(route.request().postDataBuffer()!.includes(Buffer.from('name="visibility"\r\n\r\nprivate')));
   if(mode==='hold')await new Promise<void>(done=>{release=done;});
   if(mode==='drop')return route.abort('connectionreset');
   return route.fulfill({status:mode==='reuse'?200:202,json:{id:'22222222-2222-4222-8222-222222222222',status:'pending',reused:mode==='reuse'}});
  });
  const open=async()=>{await page.getByRole('button',{name:/^资料/}).click();return page.getByRole('dialog',{name:'本次任务资料'});};
  await page.goto(base);let dialog=await open();const progress=()=>dialog.getByRole('region',{name:'我的上传处理进度'});
  await expect(progress().locator('article')).toHaveCount(6);await expect(progress()).toContainText('待审核抽取内容');await expect(progress()).toContainText('可检索');await expect(progress()).not.toContainText('100%');await expect(dialog.locator('.ai-attachment-list input')).toHaveCount(1);
  await dialog.locator('.ai-attachment-list input').check();await expect(dialog.getByRole('region',{name:'已选资料'})).toContainText('Processed original');
  await progress().getByRole('button',{name:'下一页上传'}).click();await expect(progress().locator('article')).toHaveCount(2);await expect(progress()).toContainText('处理失败');await expect(progress()).toContainText('处理状态待核对');await expect(progress().getByRole('button',{name:'下一页上传'})).toBeDisabled();await progress().getByRole('button',{name:'上一页上传'}).click();await expect(progress().locator('article')).toHaveCount(6);
  failJobs=true;await progress().getByRole('button',{name:'刷新上传进度'}).click();await expect(progress().getByRole('alert')).toContainText('读取失败');await expect(progress().locator('article')).toHaveCount(0);failJobs=false;malformedJobs=true;await progress().getByRole('button',{name:'刷新上传进度'}).click();await expect(progress().getByRole('alert')).toContainText('读取失败');malformedJobs=false;await progress().getByRole('button',{name:'刷新上传进度'}).click();await expect(progress().locator('article')).toHaveCount(6);
  const file={name:'generated.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nsynthetic pending original\n%%EOF')};await dialog.getByLabel('上传私有原件').setInputFiles(file);await expect.poll(()=>Boolean(release)).toBe(true);await page.keyboard.press('Escape');dialog=await open();await expect(dialog.getByLabel('上传私有原件')).toBeDisabled();await expect(dialog.getByRole('combobox',{name:'资料类别'})).toBeDisabled();await expect(dialog.getByText('正在上传原件。关闭窗口不会取消本次提交，请勿重复上传。',{exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'刷新已处理资料'}).click();await expect(dialog.locator('.ai-attachment-list input')).toHaveCount(1);await expect(dialog.getByLabel('上传私有原件')).toBeDisabled();assert.equal(posts,1);release!();release=undefined;await expect(dialog.getByLabel('上传私有原件')).toBeEnabled();await expect(dialog.getByText(/私有原件已保存/)).toBeVisible();await expect(dialog.getByRole('region',{name:'已选资料'})).toContainText('Processed original');
  const shot=`tmp/attachment-upload-ui/progress-${width}.png`;await progress().scrollIntoViewIfNeeded();await dialog.screenshot({path:shot});screenshots.push(shot);assert(await progress().evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  mode='drop';await dialog.getByLabel('上传私有原件').setInputFiles(file);await expect(dialog.getByRole('alert').filter({hasText:'原件可能已保存'})).toBeVisible();await expect(dialog.getByLabel('上传私有原件')).toBeEnabled();assert.equal(posts,2);await progress().getByRole('button',{name:'刷新上传进度'}).click();await expect(progress().locator('article')).toHaveCount(6);assert.equal(posts,2);
  mode='reuse';await dialog.getByLabel('上传私有原件').setInputFiles(file);await expect(dialog.getByText(/沿用原处理进度/)).toBeVisible();assert.equal(posts,3);
  failLibrary=true;await dialog.getByRole('button',{name:'刷新已处理资料'}).click();await expect(dialog.getByRole('alert').filter({hasText:'资料读取失败'})).toBeVisible();await expect(dialog.locator('.ai-attachment-list input')).toHaveCount(0);await expect(dialog.getByRole('region',{name:'已选资料'})).toContainText('Processed original');await expect(dialog.getByRole('button',{name:'下一页资料'})).toBeDisabled();failLibrary=false;await dialog.getByRole('button',{name:'重试读取资料'}).click();await expect(dialog.locator('.ai-attachment-list input')).toHaveCount(1);await expect(dialog.getByRole('alert')).toHaveCount(0);assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await context.close();
  results.push({width,posts,statusPaging:true,unknownStatusExplicit:true,readFailureAndMalformedClearStale:true,selectedProcessedOriginalRetained:true,closeReopenAndReadCannotUnlockUpload:true,unknownAcknowledgementNoAutomaticPost:true,reusedReceiptExplained:true,privateUploadOnly:true,noHorizontalOverflow:true});
 }
 const result={attachmentUploadComponent:'passed',results,screenshots,syntheticHttpOnly:true,actualModelCalls:0};await writeFile('tmp/attachment-upload-ui/result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{clearTimeout(watchdog);await browser.close();server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}
