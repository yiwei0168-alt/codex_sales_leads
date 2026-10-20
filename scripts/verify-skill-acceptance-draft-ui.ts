import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';

const compiled=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{SkillAcceptanceReviews}from'./src/components/skill-acceptance-reviews';
const values={answer:false,citation:false,permission:false,injection:false};
const state=window.fixture={revision:1,posts:[],readbackFailure:false};
const scenario=new URLSearchParams(location.search).get('scenario');
const judgment=revision=>({caseId:'case',observationHash:'observation',reviewerId:'owner',kind:'human',revision,revoked:false,baseline:values,candidate:values,rationale:'Stored judgment r'+revision});
const summary=revision=>({id:'bundle',artifactHash:'artifact',version:1,sourceKind:'synthetic-fixture',sourcesCurrent:true,freezeStatus:{state:'active'},automaticActivation:false,
 cases:[{id:'case',category:'negative',hasObservation:true,materialAvailable:true,observationHash:'observation',judgment:judgment(revision)}]});
window.fetch=async(input,init)=>{
 const url=new URL(String(input),location.origin);let body;
 if(url.pathname.includes('acceptance-originals'))body={assetCount:0,pendingCount:0,assets:[],automaticActivation:false};
 else if(init?.method==='POST'){
  const post=JSON.parse(init.body);state.posts.push(post);
  if(post.expectedRevision!==state.revision)return new Response(JSON.stringify({error:'Concurrent revision changed'}),{status:409});
  state.revision++;body={revision:state.revision,automaticActivation:false};
 }else if(url.searchParams.has('skillId'))body={items:[{id:'bundle',version:1,createdAt:'2026-10-20T00:00:00Z',caseCount:1}],hasMore:false};
 else if(url.searchParams.has('caseId')){
  if(scenario==='initial-race')state.revision=2;
  body={bundleId:'bundle',caseId:'case',artifactHash:'artifact',observationHash:'observation',question:'Synthetic concurrency question',baseline:'Synthetic baseline',candidate:'Synthetic candidate',receipts:[],canPass:{baseline:true,candidate:true},sourceKind:'synthetic-fixture',freezeStatus:{state:'active'},judgment:judgment(state.revision)};
 }else{if(state.readbackFailure)throw Error('Synthetic readback unavailable');body=summary(state.revision);}
 return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
};
createRoot(document.getElementById('root')).render(<SkillAcceptanceReviews skillId="skill" name="Synthetic draft" onClose={()=>{}}/>);`,resolveDir:process.cwd(),loader:'tsx'},
 outfile:'component.js',bundle:true,write:false,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const script=compiled.outputFiles.find(f=>f.path.endsWith('.js'))!.text,css=compiled.outputFiles.find(f=>f.path.endsWith('.css'))?.text??'';
const server=createServer((request,response)=>{
 if(request.url==='/component.js'){response.setHeader('content-type','application/javascript');response.end(script);}
 else if(request.url==='/component.css'){response.setHeader('content-type','text/css');response.end(css);}
 else{response.setHeader('content-type','text/html');response.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/component.css"><div id="root"></div><script src="/component.js"></script>');}
});
await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert(address&&typeof address!=='string');
const browser=await chromium.launch({channel:'chrome',headless:true}),checks:string[]=[];
try{
 await mkdir('tmp/skill-acceptance-draft-ui',{recursive:true});
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const open=async(scenario:string)=>{await page.goto(`http://127.0.0.1:${address.port}/?scenario=${scenario}`);await page.getByRole('button',{name:'打开验收',exact:true}).click();await expect(page.getByText('Synthetic concurrency question',{exact:true})).toBeVisible();};
 await open('initial-race');await expect(page.getByRole('textbox',{name:'判决依据',exact:true})).toHaveValue('Stored judgment r2');checks.push('Initial material refresh adopts latest values and revision together');
 await open('draft-race');await page.getByRole('textbox',{name:'判决依据',exact:true}).fill('My preserved draft');
 await page.evaluate(()=>{(window as unknown as {fixture:{revision:number}}).fixture.revision=2;});
 await page.getByRole('button',{name:'重新核对并保留草稿',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'判决依据',exact:true})).toHaveValue('My preserved draft');await expect(page.getByRole('button',{name:'保存本题判决',exact:true})).toBeDisabled();
 await page.getByText('查看最新判决',{exact:true}).click();await expect(page.getByText('Stored judgment r2',{exact:true})).toBeVisible();
 await page.setViewportSize({width:390,height:800});await page.screenshot({path:'tmp/skill-acceptance-draft-ui/conflict-mobile.png'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.setViewportSize({width:1280,height:900});
 await page.getByRole('button',{name:'已核对最新判决，继续使用草稿',exact:true}).click();await page.getByRole('button',{name:'保存本题判决',exact:true}).click();
 await expect(page.getByText('本题判决已保存',{exact:true})).toBeVisible();
 const posts=await page.evaluate(()=>(window as unknown as {fixture:{posts:Array<{expectedRevision:number;judgment:{rationale:string}}>}}).fixture.posts);
 assert.equal(posts.length,1);assert.equal(posts[0].expectedRevision,2);assert.equal(posts[0].judgment.rationale,'My preserved draft');checks.push('Reload preserves draft; concurrent revision blocks save until explicit reconciliation');
 await open('adopt');await page.getByRole('textbox',{name:'判决依据',exact:true}).fill('Draft to discard');await page.evaluate(()=>{(window as unknown as {fixture:{revision:number}}).fixture.revision=2;});
 await page.getByRole('button',{name:'重新核对并保留草稿',exact:true}).click();await page.getByRole('button',{name:'采用最新判决',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'判决依据',exact:true})).toHaveValue('Stored judgment r2');await expect(page.getByRole('button',{name:'返回验收列表',exact:true})).toBeEnabled();checks.push('Adopting latest judgment discards only the explicit draft and releases navigation');
 await open('readback');await page.getByRole('textbox',{name:'判决依据',exact:true}).fill('Saved before readback failure');
 await page.evaluate(()=>{(window as unknown as {fixture:{readbackFailure:boolean}}).fixture.readbackFailure=true;});
 await page.getByRole('button',{name:'保存本题判决',exact:true}).click();await expect(page.getByText('本题判决已保存',{exact:true})).toBeVisible();
 await expect(page.getByText('判决已保存，但最新状态暂时无法读取；请重新核对后继续。',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'撤销本题判决',exact:true})).toBeDisabled();
 await page.evaluate(()=>{(window as unknown as {fixture:{readbackFailure:boolean}}).fixture.readbackFailure=false;});await page.getByRole('button',{name:'重新核对并保留草稿',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'判决依据',exact:true})).toHaveValue('Stored judgment r2');checks.push('Successful write remains acknowledged when readback fails; recheck restores current state');
 await page.screenshot({path:'tmp/skill-acceptance-draft-ui/final.png'});assert.deepEqual(errors,[]);await page.close();
 const result={skillAcceptanceDraftUi:'passed',actualReactComponent:true,realChrome:true,syntheticHttpResponses:true,checks,realJudgmentsWritten:0,modelCalls:0};
 await writeFile('tmp/skill-acceptance-draft-ui/result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();await new Promise<void>(done=>server.close(()=>done()));}
