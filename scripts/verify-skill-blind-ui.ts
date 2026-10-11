import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{SkillBlindReview}from'./src/components/skill-blind-review';createRoot(document.getElementById('root')).render(<SkillBlindReview id="round" onClose={()=>{}}/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'tmp/skill-blind-ui/component.js',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const js=bundle.outputFiles.find(f=>f.path.endsWith('.js'))!.text,css=await readFile('src/app/globals.css','utf8')+'\n'+bundle.outputFiles.find(f=>f.path.endsWith('.css'))!.text;
const server=createServer((req,res)=>{if(req.url==='/component.js'){res.setHeader('content-type','application/javascript');res.end(js);}else if(req.url==='/styles.css'){res.setHeader('content-type','text/css');res.end(css);}else{res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"><div id="root" style="padding:16px"></div><script src="/component.js"></script></html>');}});
await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert(address&&typeof address!=='string');
const browser=await chromium.launch({channel:'chrome',headless:true}),errors:string[]=[],screenshots:string[]=[];
try{
 await mkdir('tmp/skill-blind-ui',{recursive:true});
 for(const viewport of [{width:1366,height:620},{width:390,height:844},{width:320,height:740}]){
  const context=await browser.newContext({viewport});let revision=0,failed=false,revealed=false;const judgments:unknown[]=[];
  await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(url.hostname!=='127.0.0.1')return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();
   if(request.method()==='POST'){
    const body=request.postDataJSON();assert(!('reviewerKind' in body));assert(!('baseline' in body));assert(!('candidate' in body));assert.equal(body.expectedRevision,revision);
    if(body.operation==='reveal'){revealed=true;return route.fulfill({json:{revealed:true}});}
    if(!failed){failed=true;revision=1;return route.fulfill({status:409,json:{error:'审核修订已变化，请重新读取'}});}
    revision++;judgments.push({case_id:'c',judgment:{A:body.A,B:body.B},reviewer_kind:'account-user'});return route.fulfill({json:{revision}});
   }
   return route.fulfill({json:{id:'round',revision,artifactHash:'artifact',revealed,...(revealed?{identities:{c:{A:'候选 Skill',B:'原流程'}}}:{}),
    pairs:[{caseId:'c',pairHash:'pair',question:'合成资料有几个物理网口？',partialTask:false,receipts:[{content:'设备有 2 个 RJ45 网口。',sourceLocation:{page:3,block:4}}],A:{answer:'2 个 RJ45 网口，见第 3 页。',canPass:true},B:{answer:'两个 RJ45 端口。',canPass:true}}],judgments,history:judgments.length?[{revision,caseId:'c',reviewerKind:'account-user',createdAt:'2026-10-11T01:00:00Z'}]:[]}});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${address.port}`);
  const save=page.getByRole('button',{name:'保存 A/B 判决',exact:true}),reveal=page.getByRole('button',{name:'揭示身份并锁定判决',exact:true});await expect(save).toBeDisabled();await expect(reveal).toBeDisabled();
  await expect(page.getByText('设备有 2 个 RJ45 网口。',{exact:true})).toBeVisible();await expect(page.getByLabel('来源坐标 1')).toContainText('page');
  for(const side of ['A','B']){for(const label of ['答案正确','精确引用正确','权限边界遵守','未受注入影响'])await page.getByLabel(`${side}：${label}`,{exact:true}).selectOption('true');await page.getByLabel(`${side}：判决依据`,{exact:true}).fill('核对第 3 页原文，草稿应保留。');}
  await expect(page.getByRole('button',{name:'返回评测列表',exact:true})).toBeDisabled();await save.click();await expect(page.getByRole('alert')).toContainText('修订已变化');
  await page.getByRole('button',{name:'刷新修订并保留草稿',exact:true}).click();await expect(page.getByLabel('A：判决依据',{exact:true})).toHaveValue('核对第 3 页原文，草稿应保留。');
  await save.click();await expect(page.getByText('本题判决已保存',{exact:true})).toBeVisible();await expect(reveal).toBeEnabled();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.keyboard.press('Tab');assert(await page.evaluate(()=>document.activeElement!==document.body));
  const path=`tmp/skill-blind-ui/${viewport.width}.png`;await page.screenshot({path,fullPage:true});screenshots.push(path);
  await reveal.click();await expect(page.getByText(/身份已揭示，本轮判决已锁定/)).toBeVisible();await expect(page.getByLabel('A：判决依据',{exact:true})).toBeDisabled();await expect(save).toBeDisabled();await expect(page.locator('legend').first()).toContainText('候选 Skill');
  await context.close();
 }
 assert.deepEqual(errors,[]);const result={viewports:3,anonymousAnswers:true,sourceTextVisible:true,coordinatesVisible:true,staleDraftPreserved:true,revisionRefreshPreservesDraft:true,explicitDisclosure:true,disclosureSeals:true,noHorizontalOverflow:true,keyboardFocus:true,modelCalls:0,screenshots};await writeFile('tmp/skill-blind-ui/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}
