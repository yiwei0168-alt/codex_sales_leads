import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{SkillAcceptanceReviews}from'./src/components/skill-acceptance-reviews';createRoot(document.getElementById('root')).render(<SkillAcceptanceReviews skillId="skill" name="合成方法" onClose={()=>{}}/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'tmp/skill-acceptance-ui/component.js',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const js=bundle.outputFiles.find(f=>f.path.endsWith('.js'))!.text,css=await readFile('src/app/globals.css','utf8')+'\n'+bundle.outputFiles.find(f=>f.path.endsWith('.css'))!.text;
const server=createServer((req,res)=>{if(req.url==='/component.js'){res.setHeader('content-type','application/javascript');res.end(js);}else if(req.url==='/styles.css'){res.setHeader('content-type','text/css');res.end(css);}else{res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"><div id="root" style="padding:16px"></div><script src="/component.js"></script></html>');}});
await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert(address&&typeof address!=='string');
const browser=await chromium.launch({channel:'chrome',headless:true}),errors:string[]=[],screenshots:string[]=[];
try{
 await mkdir('tmp/skill-acceptance-ui',{recursive:true});
 for(const width of [1366,390,320]){
  const context=await browser.newContext({viewport:{width,height:800}});let revision=0,failed=false,revoked=false;
  const coordinate={page:3,block:4,diagnosticKey:'SYNTHETIC'.repeat(180)};
  await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:`http://127.0.0.1:${address.port}`});
  const verdict={answer:true,citation:true,permission:true,injection:true};
  const judgment=()=>revision?{caseId:'replay',revision,revoked,baseline:verdict,candidate:verdict,rationale:'核对原文与来源',kind:'human',reviewerId:'owner',observationHash:'observation'}:null;
  const summary=()=>({id:'bundle',artifactHash:'artifact',version:1,sourceKind:'synthetic-fixture',sourcesCurrent:true,freezeStatus:{state:'active',freezeId:'freeze'},automaticActivation:false,
   cases:[{id:'replay',category:'replay',hasObservation:true,materialAvailable:true,observationHash:'observation',judgment:judgment()},{id:'negative',category:'negative',hasObservation:false,materialAvailable:false,observationHash:null,judgment:null}]});
  await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(url.hostname!=='127.0.0.1')return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();
   if(request.method()==='POST'){
    const body=request.postDataJSON();assert.equal(body.expectedRevision,revision);assert(!('reviewerKind' in body));assert(!('reviewerId' in body.judgment));
    if(!failed){failed=true;revision++;return route.fulfill({status:409,json:{error:'审核修订已变化'}});}
    revision++;revoked=body.judgment.revoked;return route.fulfill({json:{revision}});
   }
   if(url.searchParams.has('skillId'))return route.fulfill({json:{items:[{id:'bundle',version:1,createdAt:'2026-10-11T01:00:00Z',sourceKind:'synthetic-fixture',caseCount:1}],hasMore:false}});
   if(url.searchParams.has('caseId'))return route.fulfill({json:{bundleId:'bundle',caseId:'replay',artifactHash:'artifact',observationHash:'observation',question:'合成设备有几个物理网口？',baseline:'2 个 RJ45 网口，见原文第 3 页。',candidate:'两个 RJ45 物理网口。',canPass:{baseline:true,candidate:true},receipts:[{content:'设备有 2 个 RJ45 网口。',sourceLocation:coordinate}],sourceKind:'synthetic-fixture',freezeStatus:{state:'active'},judgment:judgment(),automaticActivation:false}});
   return route.fulfill({json:summary()});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(`http://127.0.0.1:${address.port}`);
  await page.getByRole('button',{name:'打开验收',exact:true}).click();
  await expect(page.getByText('合成设备有几个物理网口？',{exact:true})).toBeVisible();
  await expect(page.getByText('页：3 · 块：4',{exact:true})).toBeVisible();
  const raw=page.locator('.skill-review-source .raw-json-details');await expect(raw).not.toHaveAttribute('open');
  await raw.locator('summary').click();await expect(raw.locator('pre')).toContainText(coordinate.diagnosticKey);
  assert(await raw.locator('pre').evaluate(element=>element.scrollWidth<=element.clientWidth+1));
  await raw.getByRole('button',{name:'复制 JSON'}).click();
  assert.deepEqual(JSON.parse(await page.evaluate(()=>navigator.clipboard.readText())),coordinate);
  await raw.scrollIntoViewIfNeeded();
  await page.screenshot({path:`tmp/skill-acceptance-ui/${width}-coordinates.png`});
  const save=page.getByRole('button',{name:'保存本题判决',exact:true});await expect(save).toBeDisabled();
  for(const side of ['原流程','候选 Skill'])for(const metric of ['答案正确','精确引用正确','权限边界遵守','未受注入影响'])await page.getByLabel(`${side}：${metric}`,{exact:true}).selectOption('true');
  await page.getByLabel('判决依据',{exact:true}).fill('核对原文与来源');await expect(page.getByRole('button',{name:'返回 Skill',exact:true})).toBeDisabled();
  await save.click();await expect(page.getByRole('alert')).toContainText('修订已变化');await page.getByRole('button',{name:'重新核对并保留草稿'}).click();await expect(page.getByLabel('判决依据',{exact:true})).toHaveValue('核对原文与来源');await expect(save).toBeEnabled();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.locator('.skill-acceptance').evaluate(element=>{element.scrollTop=0;});
  const path=`tmp/skill-acceptance-ui/${width}.png`;await page.screenshot({path,fullPage:true});screenshots.push(path);
  await save.click();await expect(page.getByText('本题判决已保存',{exact:true})).toBeVisible();await page.getByRole('button',{name:'撤销本题判决',exact:true}).click();await expect(page.getByText('判决已撤销',{exact:true})).toBeVisible();
  await page.getByRole('navigation',{name:'验收题目'}).getByRole('combobox').selectOption('negative');await expect(save).toBeDisabled();await expect(page.getByText('本题尚无可审核的完整材料，不能提交通过判决。',{exact:true})).toBeVisible();
  await page.keyboard.press('Tab');assert(await page.evaluate(()=>document.activeElement!==document.body));await context.close();
 }
 assert.deepEqual(errors,[]);const result={viewports:3,answersAndCoordinatesVisible:true,explicitMetricsRequired:true,conflictDraftPreserved:true,saveAndRevoke:true,missingMaterialCannotPass:true,noHorizontalOverflow:true,keyboardFocus:true,modelCalls:0,screenshots};await writeFile('tmp/skill-acceptance-ui/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}
