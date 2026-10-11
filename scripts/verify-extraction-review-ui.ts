import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
const job='00000000-0000-4000-8000-000000000001';
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{KnowledgeExtractionReview}from'./src/components/knowledge-extraction-review';function App(){const[open,setOpen]=React.useState(false);return <><button onClick={()=>setOpen(true)}>打开审核</button>{open&&<KnowledgeExtractionReview jobId="${job}" onClose={()=>setOpen(false)}/>}</>};createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const css=await readFile('src/app/globals.css','utf8');
const previewPackage=JSON.parse(await readFile('tmp/ma24-public-eval-candidates/visual-review/review.json','utf8'));
const previewRecord=previewPackage.records.find((row:{imageFile?:string})=>row.imageFile);assert(previewRecord);
const previewPng=await readFile(`tmp/ma24-public-eval-candidates/visual-review/${previewRecord.imageFile}`);
const server=createServer((req,res)=>{if(req.url==='/component.js'){res.setHeader('content-type','application/javascript');res.end(bundle.outputFiles[0].text);}else if(req.url==='/styles.css'){res.setHeader('content-type','text/css');res.end(css);}else{res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"><body class="conversation-theme"><div id="root"></div><script src="/component.js"></script></body></html>');}});
await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert(address&&typeof address!=='string');
const browser=await chromium.launch({channel:'chrome',headless:true});const results=[];
try{
 await mkdir('tmp/extraction-review-ui',{recursive:true});
 for(const width of [1366,390,320]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors:string[]=[],posts:Record<string,unknown>[]=[];
  const judgments=new Map<string,Record<string,unknown>>();let conflict=true;
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/knowledge/uploads/review**',async route=>{
   const url=new URL(route.request().url());
   if(url.searchParams.get('format')==='image'){await route.fulfill({contentType:'image/png',body:previewPng});return;}
   if(route.request().method()==='POST'){
    const input=route.request().postDataJSON();posts.push(input);
    if(conflict){conflict=false;await route.fulfill({status:409,json:{error:'该对象已有新的审核，请重新加载'}});return;}
    judgments.set(input.blockId,{revision:1,decision:input.decision,evidence_text:input.evidenceText,note:input.note});
    await route.fulfill({json:{revision:1,indexingResumed:false}});return;
   }
   const offset=Number(url.searchParams.get('offset')??0);
   await route.fulfill({json:{jobId:job,title:'公开开发资料抽取核对',artifactSha256:'a'.repeat(64),sourceSha256:'b'.repeat(64),total:21,resolved:0,offset,
    blocks:Array.from({length:Math.min(20,21-offset)},(_,i)=>{const n=offset+i;return {block:{id:`object-${n}`,unitType:'slide',unitIndex:n+1,blockType:'visual',shapePath:[2,n+1],shapeIdPath:[5,n+10]},candidate:{...previewRecord,blockId:`object-${n}`,unitIndex:n+1,ocrLines:[{text:'待核对的本地文字候选',confidence:0.75,box:[]}]},judgment:judgments.get(`object-${n}`)??null};})}});
  });
  await page.goto(`http://127.0.0.1:${address.port}`);await page.getByRole('button',{name:'打开审核'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByRole('button',{name:'保存本条审核'})).toBeDisabled();
  await expect(page.getByRole('link',{name:'下载本次原件进行对照'})).toHaveAttribute('href',new RegExp(`artifactSha256=${'a'.repeat(64)}`));
  await page.getByLabel('核对依据 / 备注').fill('需要检查图中的连接关系');
  await page.getByRole('button',{name:'下一对象',exact:true}).click();await expect(page.getByText('有未保存的修改，是否放弃？')).toBeVisible();
  await page.getByRole('button',{name:'继续编辑'}).click();await expect(page.getByLabel('核对依据 / 备注')).toHaveValue('需要检查图中的连接关系');
  await page.getByRole('button',{name:'保存本条审核'}).click();await expect(page.getByRole('alert')).toContainText('该对象已有新的审核');
  await expect(page.getByLabel('核对依据 / 备注')).toHaveValue('需要检查图中的连接关系');
  await page.getByRole('button',{name:'保存本条审核'}).click();await expect(page.getByText('已保存修订 1。',{exact:true})).toBeVisible();
  assert.equal(posts[1].expectedRevision,0);assert.equal(posts[1].artifactSha256,'a'.repeat(64));
  for(let i=0;i<20;i++)await page.getByRole('button',{name:'下一对象',exact:true}).click();
  await expect(page.getByText('对象 21 / 21',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'下一对象',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'上一对象',exact:true}).click();await expect(page.getByText('对象 20 / 21',{exact:true})).toBeVisible();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await expect(page.getByRole('img')).toBeVisible();assert(await page.getByRole('img').evaluate((image:HTMLImageElement)=>image.complete&&image.naturalWidth>0));
  await page.getByText('OCR 候选文字（1 行，未经审核）',{exact:true}).click();await expect(page.getByText('待核对的本地文字候选（置信度 0.75）',{exact:true})).toBeVisible();
  await page.screenshot({path:`tmp/extraction-review-ui/${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'关闭窗口'}).click();await expect(page.getByRole('button',{name:'打开审核'})).toBeFocused();
  assert.deepEqual(errors,[]);results.push({width,noOverflow:true,dirtyGuard:true,conflictPreservesDraft:true,pagination:true,focusRestored:true});await page.close();
 }
 await writeFile('tmp/extraction-review-ui/result.json',JSON.stringify({results,scope:'actual component and CSS with synthetic authenticated API responses'},null,2));console.log(JSON.stringify({passed:true,results}));
}finally{await browser.close();await new Promise<void>(done=>server.close(()=>done()));}
