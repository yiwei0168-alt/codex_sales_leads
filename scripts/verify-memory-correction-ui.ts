import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';

// Render the real component with synthetic HTTP receipts, without a product account or model calls.
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{MemoryObservations}from'./src/components/memory-observations';createRoot(document.getElementById('root')).render(<MemoryObservations/>);`,resolveDir:process.cwd(),loader:'tsx'},
  bundle:true,write:false,outfile:'tmp/memory-correction-ui/component.js',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const js=bundle.outputFiles.find(file=>file.path.endsWith('.js'))!.text,css=bundle.outputFiles.find(file=>file.path.endsWith('.css'))!.text;
const globalCss=await readFile('src/app/globals.css','utf8');
const server=createServer((request,response)=>{
  if(request.url==='/component.js'){response.setHeader('content-type','application/javascript');return void response.end(js);}
  if(request.url==='/styles.css'){response.setHeader('content-type','text/css');return void response.end(globalCss+'\n'+css);}
  response.setHeader('content-type','text/html');response.end('<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"><div id="root"></div><script src="/component.js"></script></html>');
});
await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
const address=server.address();assert(address&&typeof address!=='string');
const browser=await chromium.launch({channel:'chrome',headless:true});
const screenshots:string[]=[],errors:string[]=[];
try{
  await mkdir('tmp/memory-correction-ui',{recursive:true});
  for(const viewport of [{width:1366,height:768},{width:390,height:844},{width:320,height:740}]){
    const context=await browser.newContext({viewport});let saved=false,fail=false,posts=0;
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.hostname!=='127.0.0.1')return route.abort();
      if(url.pathname!=='/api/knowledge/observations')return route.continue();
      if(request.method()==='POST'){
        posts++;const body=request.postDataJSON();assert.equal(body.action,'correct');assert.equal(body.id,'memory-0');
        if(fail)return route.fulfill({status:409,json:{error:'这条记忆已被更正或撤销，请刷新后查看最新记录。'}});
        assert.equal(body.content,'更正后的合成偏好：使用简短摘要。');saved=true;return route.fulfill({json:{id:'new-memory'}});
      }
      return route.fulfill({json:{items:Array.from({length:12},(_,index)=>({id:`memory-${index}`,kind:'preference',
        content:saved&&index===0?'更正后的合成偏好：使用简短摘要。':`合成记忆 ${index}：我喜欢包含上下文的摘要。`,
        valid_from:null,recorded_at:'2026-10-10',source_receipt:{type:'local-qwen3-extraction'}})),hasMore:true}});
    });
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.getByRole('button',{name:'更正这条记忆',exact:true}).first().click();
    const field=page.getByLabel('更正后的完整内容');await expect(field).toBeFocused();
    await expect(page.getByRole('button',{name:'保存更正',exact:true})).toBeDisabled();
    await field.fill('不会保存的草稿');await page.getByRole('button',{name:'取消',exact:true}).click();assert.equal(posts,0);
    await page.getByRole('button',{name:'更正这条记忆',exact:true}).first().click();
    await field.fill('更正后的合成偏好：使用简短摘要。');await page.getByLabel('更正原因（可选）').fill('核对后修正');
    const editorPath=`tmp/memory-correction-ui/editor-${viewport.width}.png`;await page.screenshot({path:editorPath});screenshots.push(editorPath);
    fail=true;await page.getByRole('button',{name:'保存更正',exact:true}).click();
    await expect(page.getByRole('alert')).toContainText('刷新');await expect(field).toHaveValue('更正后的合成偏好：使用简短摘要。');
    fail=false;await page.getByRole('button',{name:'保存更正',exact:true}).click();
    await expect(page.getByRole('status')).toContainText('更正已保存');await expect(field).toHaveCount(0);
    await expect(page.getByText('更正后的合成偏好：使用简短摘要。',{exact:true})).toBeVisible();
    const geometry=await page.evaluate(()=>{
      const article=document.querySelector('article')!,list=article.parentElement!;
      list.scrollTop=100;return {width:innerWidth,scroll:document.documentElement.scrollWidth,listScrolled:list.scrollTop>0};
    });
    assert(geometry.scroll<=geometry.width+1);assert(geometry.listScrolled);assert.equal(posts,2);
    const path=`tmp/memory-correction-ui/${viewport.width}.png`;await page.screenshot({path});screenshots.push(path);
    await context.close();
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({componentHarness:true,viewports:3,cancelNoWrite:true,staleEditPreserved:true,saveAndRefresh:true,keyboardFocus:true,scrollAndNoOverflow:true,modelCalls:0,screenshots}));
}finally{await browser.close();server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}
