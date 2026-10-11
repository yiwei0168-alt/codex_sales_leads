import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';

const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{KnowledgeBase}from'./src/components/knowledge-base';createRoot(document.getElementById('root')).render(<KnowledgeBase/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'adjacent-page-stubs',setup(builder){
 builder.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));
 builder.onResolve({filter:/^\.\/(personal-memory|memory-observations|knowledge-library|knowledge-review-center)$/},()=>({path:'adjacent',namespace:'fixture'}));
 builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='navigation'?`export const useRouter=()=>({push(){}});export const useSearchParams=()=>new URLSearchParams();`:`export const PersonalMemory=()=>null,MemoryObservations=()=>null,KnowledgeLibrary=()=>null,KnowledgeReviewCenter=()=>null;`,loader:'js'}));
}}]});
const css=await readFile('src/app/globals.css','utf8'),js=bundle.outputFiles[0].text;
const server=createServer((req,res)=>{if(req.url==='/component.js'){res.setHeader('content-type','application/javascript');res.end(js);}else if(req.url==='/styles.css'){res.setHeader('content-type','text/css');res.end(css);}else{res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"><div id="root"></div><script src="/component.js"></script></html>');}});
await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert(address&&typeof address!=='string');
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
const doc='00000000-0000-4000-8000-000000000010',version='00000000-0000-4000-8000-000000000011';
try{
 await mkdir('tmp/upload-revision-ui',{recursive:true});
 for(const width of [1366,390,320]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors:string[]=[],posts:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  let conflict=true;
  await page.route('**/api/**',async route=>{const url=new URL(route.request().url());let data:unknown={};let status=200;
   if(url.pathname==='/api/auth/session')data={user:{role:'admin'}};
   else if(url.pathname==='/api/knowledge/status')data={configured:true,collections:['industry','company','product'].map(type=>({type,documentCount:1,chunkCount:1,embeddedCount:0}))};
   else if(url.pathname==='/api/knowledge/uploads'&&route.request().method()==='POST'){
    posts.push(route.request().postData()??'');status=conflict?409:202;data=conflict?{error:'资料已有更新，请重新选择当前版本后提交；本次未覆盖资料。'}:{id:'new-job',status:'pending'};conflict=false;
   }else if(url.pathname==='/api/knowledge/uploads')data={jobs:Array.from({length:url.searchParams.get('offset')==='6'?1:7},(_,i)=>({id:`job-${i}`,collection:'industry',status:'registered',treeStatus:i===0?'searchable':'historical',currentVersionId:version,documentId:doc,sourceSha256:'a'.repeat(64),title:url.searchParams.get('offset')==='6'?'较早上传的资料':i===0?'当前可检索资料':'历史原件',originalFilename:'source.pdf',documentType:'PDF',byteSize:'4096',errorCode:null,visibility:'private',sourceUrl:null,entityKey:null,revisionBaseVersionId:null}))};
   else if(url.pathname==='/api/knowledge/mailbox')data={items:[],hasMore:false};
   await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(`http://127.0.0.1:${address.port}`);await page.getByRole('button',{name:'上传资料',exact:true}).click();
  await expect(page.getByRole('button',{name:'上传新版',exact:true})).toHaveCount(1);
  await page.getByRole('button',{name:'下一页作业',exact:true}).click();await expect(page.getByText('较早上传的资料',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'上传新版',exact:true}).click();
  await expect(page.getByText('更新：较早上传的资料',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'行业知识库',exact:true})).toBeDisabled();
  await page.locator('#kb-file').setInputFiles({name:'new.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7')});
  await page.getByRole('button',{name:'提交新版',exact:true}).click();await expect(page.getByText('资料已有更新，请重新选择当前版本后提交；本次未覆盖资料。',{exact:true})).toBeVisible();
  assert(posts[0].includes(doc)&&posts[0].includes(version));await expect(page.getByRole('button',{name:'提交新版',exact:true})).toBeEnabled();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:`tmp/upload-revision-ui/${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'提交新版',exact:true}).click();await expect(page.getByText('新版已提交，校验通过后才替换当前版本；处理期间旧版仍可检索。',{exact:true})).toBeVisible();
  assert(posts[1].includes(doc)&&posts[1].includes(version));await expect(page.getByRole('button',{name:'取消更新',exact:true})).toHaveCount(0);
  assert.deepEqual(errors,[]);results.push({width,pagination:true,explicitDocumentAndBase:true,conflictPreservesDraft:true,oldVersionNotice:true,noOverflow:true});await page.close();
 }
 await writeFile('tmp/upload-revision-ui/result.json',JSON.stringify({results,scope:'actual upload component with synthetic APIs; adjacent page components stubbed'},null,2));console.log(JSON.stringify({passed:true,widths:results.length}));
}finally{await browser.close();await new Promise<void>(done=>server.close(()=>done()));}
