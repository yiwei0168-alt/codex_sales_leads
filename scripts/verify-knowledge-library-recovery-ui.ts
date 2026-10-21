import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';

const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',unavailable='33333333-3333-4333-8333-333333333333';
const built=await build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import{KnowledgeLibrary}from'./src/components/knowledge-library';createRoot(document.getElementById('root')).render(<KnowledgeLibrary/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const css=(await Promise.all(['src/app/globals.css','src/app/conversation-theme.css'].map(path=>readFile(path,'utf8')))).join('\n');
const server=createServer((req,res)=>{if(req.url==='/component.js'){res.setHeader('content-type','application/javascript');res.end(built.outputFiles[0].text);}else if(req.url==='/styles.css'){res.setHeader('content-type','text/css');res.end(css);}else{res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body class="conversation-theme"><main style="padding:16px"><div id="root"></div></main><script src="/component.js"></script></body></html>');}});
await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`;
const item=(id:string,title:string,contentAvailable=true)=>({id,title,contentAvailable,scope:'private',status:'active',updatedAt:'2026-10-22T00:00:00Z',assetId:id,excerpt:contentAvailable?'Generated current excerpt':'MUST_NOT_DISPLAY_UNAVAILABLE_EXCERPT',treeStatus:'searchable'});
const browser=await chromium.launch({channel:'chrome',headless:true}),results:unknown[]=[],screenshots:string[]=[];
const watchdog=setTimeout(()=>{console.error('Library UI watchdog expired');process.exit(1);},90000);watchdog.unref();
try{
 await mkdir('tmp/knowledge-library-recovery',{recursive:true});
 for(const width of [1366,390,320]){
  const context=await browser.newContext({viewport:{width,height:900}});await context.addInitScript(({id})=>{const original=window.fetch;window.fetch=(input,init)=>original(input,String(input).includes('/library/'+id)?{...init,signal:undefined}:init);},{id:a});
  const page=await context.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  let listFails=false,malformed=false,readFails=false,holdRead=false,releaseRead:(()=>void)|undefined,lateDone=false;
  let deleteMode:'drop'|'hold'='drop',releaseDelete:(()=>void)|undefined,deletes=0;const removed=new Set<string>();
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
   if(url.pathname==='/api/knowledge/tree')return route.fulfill({json:{nodes:[],hasMore:false}});
   if(url.pathname==='/api/knowledge/library/history')return route.fulfill({json:{items:[{id:'old',title:'Explicit historical revision',time:'2026-01-01',content:'Generated old owner history',truncated:false,reconstructed:false}],hasMore:false}});
   if(url.pathname==='/api/knowledge/library'){
    if(route.request().method()==='DELETE'){deletes++;removed.add((route.request().postDataJSON() as {id:string}).id);if(deleteMode==='drop')return route.abort('connectionreset');await new Promise<void>(done=>{releaseDelete=done;});listFails=true;return route.fulfill({json:{deleted:true}});}
    return route.fulfill(listFails?{status:503,json:{}}:malformed?{json:{items:null,hasMore:false}}:{json:{items:[item(a,'Document A'),item(b,'Document B'),item(unavailable,'Unavailable metadata',false)].filter(row=>!removed.has(row.id)),hasMore:false}});
   }
   if(url.pathname.startsWith('/api/knowledge/library/')){
    const id=url.pathname.split('/').at(-1)!;if(readFails||id===unavailable)return route.fulfill({status:404,json:{}});
    if(holdRead&&id===a)await new Promise<void>(done=>{releaseRead=done;});
    await route.fulfill({json:{item:{...item(id,id===a?'Fresh A authoritative title':'Fresh B authoritative title'),assetId:id===a?b:a,content:id===a?'Generated A saved body':'Generated B saved body'}}}).catch(()=>{});lateDone=true;return;
   }
   return route.continue();
  });
  await page.goto(base);const library=page.getByRole('region',{name:'资料列表'}),rows=library.locator('.library-row');await expect(rows).toHaveCount(3);await expect(library).not.toContainText('MUST_NOT_DISPLAY');await expect(rows.filter({hasText:'Unavailable metadata'}).getByRole('link',{name:'打开原始资料'})).toHaveCount(0);
  listFails=true;await library.getByRole('button',{name:'刷新资料',exact:true}).click();await expect(library.getByRole('alert')).toContainText('列表读取失败');await expect(rows).toHaveCount(0);await expect(library.getByText('此范围暂无资料。可以调整筛选，或通过“上传资料”加入知识。',{exact:true})).toHaveCount(0);listFails=false;malformed=true;await library.getByRole('button',{name:'重试读取列表'}).click();await expect(library.getByRole('alert')).toContainText('列表读取失败');malformed=false;await library.getByRole('button',{name:'重试读取列表'}).click();await expect(rows).toHaveCount(3);
  await library.getByRole('button',{name:'Document A',exact:true}).click();await expect(library.getByRole('heading',{name:'Fresh A authoritative title'})).toBeVisible();await expect(library.getByRole('link',{name:'打开原始资料'})).toHaveAttribute('href','/api/knowledge/assets/'+b);await library.getByText('查看已保存的检索正文',{exact:true}).click();await expect(library).toContainText('Generated A saved body');readFails=true;await library.getByRole('button',{name:'刷新当前资料'}).click();await expect(library.getByRole('alert')).toContainText('来源可能已失效');await expect(library).not.toContainText('Generated A saved body');await expect(library.getByRole('link',{name:'打开原始资料'})).toHaveCount(0);await expect(library.getByRole('region',{name:'原文坐标'})).toHaveCount(0);await library.getByText('历史内容版本',{exact:true}).click();await expect(library).toContainText('Explicit historical revision');
  const shot=`tmp/knowledge-library-recovery/unavailable-${width}.png`;await library.screenshot({path:shot});screenshots.push(shot);readFails=false;await library.getByRole('button',{name:'重试读取资料'}).click();await expect(library.getByRole('heading',{name:'Fresh A authoritative title'})).toBeVisible();
  holdRead=true;await library.getByRole('button',{name:'刷新当前资料'}).click();await expect.poll(()=>Boolean(releaseRead)).toBe(true);await library.getByRole('button',{name:'返回资料列表'}).click();await library.getByRole('button',{name:'Document B',exact:true}).click();await expect(library.getByRole('heading',{name:'Fresh B authoritative title'})).toBeVisible();lateDone=false;releaseRead!();releaseRead=undefined;await expect.poll(()=>lateDone).toBe(true);await expect(library.getByRole('heading',{name:'Fresh B authoritative title'})).toBeVisible();await expect(library).not.toContainText('Generated A saved body');holdRead=false;await library.getByRole('button',{name:'返回资料列表'}).click();await expect(rows).toHaveCount(3);
  await rows.filter({hasText:'Document A'}).getByRole('button',{name:'删除此私有知识'}).click();await expect(library.getByRole('alert')).toContainText('可能已删除');assert.equal(deletes,1);await library.getByRole('button',{name:'刷新资料',exact:true}).click();await expect(rows).toHaveCount(2);assert.equal(deletes,1);await expect(library.getByRole('status')).toHaveCount(0);
  deleteMode='hold';await rows.filter({hasText:'Document B'}).getByRole('button',{name:'删除此私有知识'}).click();await expect.poll(()=>Boolean(releaseDelete)).toBe(true);await expect(library.getByRole('button',{name:'Document B',exact:true})).toBeDisabled();await expect(rows.filter({hasText:'Document B'}).getByRole('button',{name:'正在删除…'})).toBeDisabled();assert.equal(deletes,2);releaseDelete!();releaseDelete=undefined;await expect(library.getByRole('status').filter({hasText:'私有知识已删除'})).toBeVisible();await expect(library.getByRole('alert').filter({hasText:'列表读取失败'})).toBeVisible();await expect(rows).toHaveCount(0);listFails=false;await library.getByRole('button',{name:'重试读取列表'}).click();await expect(rows).toHaveCount(1);assert.equal(deletes,2);assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await context.close();
  results.push({width,listFailureAndMalformedClearActions:true,unavailableExcerptAndSourceHidden:true,authoritativeReadMetadata:true,failedReadClearsBodyTreeAndLinks:true,explicitOwnerHistorySeparate:true,lateReaderCannotReplaceAnotherDocument:true,unknownDeleteNoAutomaticRetryOrSuccessClaim:true,deleteLock:true,confirmedDeleteNoticeSurvivesReadFailure:true});
 }
 const result={knowledgeLibraryRecoveryComponent:'passed',results,screenshots,syntheticHttpOnly:true,actualModelCalls:0};await writeFile('tmp/knowledge-library-recovery/result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{clearTimeout(watchdog);await browser.close();server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}
