import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';

const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{SkillReplayReviews}from'./src/components/skill-replay-reviews';createRoot(document.getElementById('root')).render(<SkillReplayReviews skillId="skill-fixture" name="原文核对方法" onClose={()=>{}}/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'tmp/skill-review-ui/component.js',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const js=bundle.outputFiles.find(f=>f.path.endsWith('.js'))!.text;
const css=await readFile('src/app/globals.css','utf8')+'\n'+bundle.outputFiles.find(f=>f.path.endsWith('.css'))!.text;
const server=createServer((req,res)=>{
  if(req.url==='/component.js'){res.setHeader('content-type','application/javascript');res.end(js);return;}
  if(req.url==='/styles.css'){res.setHeader('content-type','text/css');res.end(css);return;}
  res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"><div id="root" style="padding:16px"></div><script src="/component.js"></script></html>');
});
await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert(address&&typeof address!=='string');
const browser=await chromium.launch({channel:'chrome',headless:true}),errors:string[]=[],screenshots:string[]=[];
try{
  await mkdir('tmp/skill-review-ui',{recursive:true});
  for(const viewport of [{width:1366,height:768},{width:390,height:844},{width:320,height:740}]){
    const context=await browser.newContext({viewport});let fail=true,posts=0,revision=0;
    const blank=()=>({answer:null,citation:null,permission:null,injection:null,rationale:''});
    const rows=[0,1].map(i=>({caseId:`case${i}`,pairHash:`hash${i}`,reviewer:null as string|null,baseline:blank(),candidate:blank()}));
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());if(url.hostname!=='127.0.0.1')return route.abort();
      if(!url.pathname.startsWith('/api/'))return route.continue();
      if(request.method()==='POST'){
        posts++;const body=request.postDataJSON();assert.equal(body.expectedRevision,revision);assert.equal(body.judgment.pairHash,'hash0');assert(!('reviewer' in body.judgment));
        if(fail)return route.fulfill({status:409,json:{error:'审核修订已变化，请重新读取'}});
        revision++;Object.assign(rows[0],body.judgment,{reviewer:'account-fixture'});return route.fulfill({json:{revision}});
      }
      if(!url.searchParams.has('id'))return route.fulfill({json:{items:[{id:'evaluation',version:1,created_at:'2026-10-11T01:00:00Z'}],hasMore:false}});
      return route.fulfill({json:{id:'evaluation',revision,review:{suiteHash:'suite',resultHash:'result',reviews:rows},
        snapshot:{suite:{cases:[0,1].map(i=>({id:`case${i}`,question:`核对合成资料中的端口数量，第 ${i+1} 题`,receipts:[{content:'两个 RJ45 端口',source_location:{page:3}}]}))}},
        result:{pairs:[0,1].map(i=>({caseId:`case${i}`,baseline:{status:'completed',reply:'两个 RJ45 端口，来源为第 3 页。'},candidate:{status:'completed',reply:'2 个 RJ45 网口；原件第 3 页。'}}))}}});
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${address.port}`);
    await page.getByRole('button',{name:'打开审核',exact:true}).click();
    const save=page.getByRole('button',{name:'保存本题判决',exact:true});await expect(save).toBeDisabled();
    for(const side of ['原流程','候选 Skill']){
      for(const metric of ['答案正确','精确引用正确','权限边界遵守','未受注入影响'])await page.getByLabel(`${side}：${metric}`,{exact:true}).selectOption('true');
      await page.getByLabel(`${side}：判决依据`,{exact:true}).fill('已核对合成原文及第 3 页坐标。');
    }
    await expect(page.getByRole('button',{name:'下一题',exact:true})).toBeDisabled();
    await save.click();await expect(page.getByRole('alert')).toContainText('重新读取');
    await expect(page.getByLabel('候选 Skill：判决依据',{exact:true})).toHaveValue('已核对合成原文及第 3 页坐标。');
    fail=false;await save.click();await expect(page.getByText('本题判决已保存；再次保存会保留旧记录。')).toBeVisible();
    await page.getByText('查看本题原始证据与来源坐标',{exact:true}).click();await expect(page.locator('pre')).toContainText('page');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    const path=`tmp/skill-review-ui/${viewport.width}.png`;await page.screenshot({path,fullPage:true});screenshots.push(path);
    await page.getByRole('button',{name:'下一题',exact:true}).click();await expect(save).toBeDisabled();
    await expect(page.getByText('本题判决尚未保存',{exact:true})).toBeVisible();assert.equal(posts,2);
    await context.close();
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({syntheticBrowserHarness:true,viewports:3,noDefaultPass:true,staleDraftPreserved:true,
    noSilentNavigationLoss:true,savedAndUnreviewedDistinguished:true,sourceDisclosure:true,noHorizontalOverflow:true,modelCalls:0,screenshots}));
}finally{await browser.close();server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}
