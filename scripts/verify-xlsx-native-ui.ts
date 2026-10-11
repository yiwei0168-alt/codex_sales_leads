import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
const job='00000000-0000-4000-8000-000000000001';
const result=JSON.parse(await readFile('tmp/xlsx-visual-local-result.json','utf8'));
const candidates=JSON.parse(await readFile(`${result.output}/review.json`,'utf8'));
const artifact=JSON.parse(await readFile('tmp/xlsx-visual-local/artifact.json','utf8'));
const block=artifact.documents[0].blocks.find((row:{quality:string})=>row.quality==='pending-ocr');assert(block);
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{KnowledgeExtractionReview}from'./src/components/knowledge-extraction-review';createRoot(document.getElementById('root')).render(<KnowledgeExtractionReview jobId="${job}" onClose={()=>{}}/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const css=await readFile('src/app/globals.css','utf8');
const server=createServer((req,res)=>{if(req.url==='/component.js'){res.setHeader('content-type','application/javascript');res.end(bundle.outputFiles[0].text);}else if(req.url==='/styles.css'){res.setHeader('content-type','text/css');res.end(css);}else{res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"><body class="conversation-theme"><div id="root"></div><script src="/component.js"></script></body></html>');}});
await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert(address&&typeof address!=='string');
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{
 for(const width of [1366,390,320]){
  const page=await browser.newPage({viewport:{width,height:760}});
  let damaged=false,requeued=false;
  await page.route('**/api/knowledge/uploads/review**',async route=>{
   if(route.request().method()==='POST'){assert.equal(route.request().postDataJSON().action,'retry-visuals');requeued=true;await route.fulfill({json:{queued:true}});return;}
   const url=new URL(route.request().url());if(url.searchParams.get('format')==='image'){
    assert.equal(url.searchParams.get('objectIndex'),'2');assert.equal(url.searchParams.get('imageIndex'),'1');
    await route.fulfill({contentType:'image/png',body:await readFile(`${result.output}/${candidates.records[0].sheetObjects[1].images[0].imageFile}`)});return;
   }
   await route.fulfill({json:{jobId:job,title:'工作表原生候选',artifactSha256:'a'.repeat(64),sourceSha256:'b'.repeat(64),decisionSha256:'c'.repeat(64),visualState:requeued?'pending':damaged?'corrupt':'ready',total:1,resolved:0,offset:0,blocks:[{block,candidate:damaged?null:candidates.records[0],judgment:null}]}});
  });
  await page.goto(`http://127.0.0.1:${address.port}`);
  await expect(page.getByRole('region',{name:'工作表视觉对象'})).toBeVisible();
  await page.getByText('对象 1 · chart',{exact:true}).click();await expect(page.getByText(/val\[0\] cached: 0/)).toBeVisible();
  await page.getByText('对象 2 · image',{exact:true}).click();await expect(page.getByText(/Embedded image part:/)).toBeVisible();
  await expect(page.getByRole('img',{name:'工作表对象 2 嵌入图片 1'})).toBeVisible();
  assert(await page.getByRole('img').evaluate((image:HTMLImageElement)=>image.complete&&image.naturalWidth===10));
  await page.getByText('图片 OCR 候选（0 行，未经审核）',{exact:true}).click();
  await expect(page.getByText('未识别到文字；不能据此认定为装饰。',{exact:true})).toBeVisible();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await expect(page.getByRole('button',{name:'完成审核并提交后续处理'})).toBeDisabled();
  await page.screenshot({path:`tmp/xlsx-visual-local/ui-${width}.png`,fullPage:true});
  damaged=true;await page.reload();await expect(page.getByText('本地候选文件不可用，可重新生成；已保存的审核记录保留。',{exact:false})).toBeVisible();
  await page.screenshot({path:`tmp/xlsx-visual-local/recovery-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'重试本地候选'}).click();await expect(page.getByText('已排队准备本地候选，可稍后刷新查看。',{exact:true})).toBeVisible();assert(requeued);
  await expect(page.getByRole('button',{name:'完成审核并提交后续处理'})).toBeDisabled();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  results.push({width,noOverflow:true,nativeObjectsExpandable:true,completionDisabled:true,corruptCandidateRetry:true});await page.close();
 }
 await writeFile('tmp/xlsx-native-ui-result.json',JSON.stringify({results,syntheticAPI:true},null,2));console.log(JSON.stringify({results}));
}finally{await browser.close();await new Promise<void>(done=>server.close(()=>done()));}
