import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
import type {AgentApproval} from '../src/lib/assistant/main/approvals';

// Actual React component, deliberately synthetic HTTP receipts; no product
// account, provider, mail connection or action executor participates.
const compiled=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{AgentApprovals}from'./src/components/agent-approvals';
const root=createRoot(document.getElementById('root'));window.replaceApprovals=items=>root.render(<AgentApprovals items={items}/>);`,resolveDir:process.cwd(),loader:'tsx'},
 bundle:true,write:false,outfile:'component.js',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const js=compiled.outputFiles.find(f=>f.path.endsWith('.js'))!.text,css=await readFile('src/app/globals.css','utf8');
const server=createServer((req,res)=>{
 if(req.url==='/component.js'){res.setHeader('content-type','application/javascript');return void res.end(js);}
 if(req.url==='/styles.css'){res.setHeader('content-type','text/css');return void res.end(css);}
 res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><main><div id="root"></div></main><script src="/component.js"></script></html>');
});
await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`;
const browser=await chromium.launch({channel:'chrome',headless:true}),screenshots:string[]=[],errors:string[]=[];
const watchdog=setTimeout(()=>{console.error('Approval submission component watchdog expired');process.exit(1);},90000);watchdog.unref();
try{
 await mkdir('tmp/approval-submission-ui',{recursive:true});
 for(const width of [1366,390,320]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
  let mode:'hold'|'conflict'|'network'='conflict';const noPending=()=>{throw new Error('No held request');};let release:()=>void=noPending;
  const posts:Array<{url:string;body:Record<string,unknown>}>=[];
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
   if(!url.pathname.startsWith('/api/assistant/approvals'))return route.continue();
   assert.equal(route.request().method(),'POST');posts.push({url:url.pathname,body:route.request().postDataJSON()});
   if(mode==='network')return route.abort('connectionfailed');
   if(mode==='conflict')return route.fulfill({status:409,json:{error:'Synthetic concurrent change'}});
   await new Promise<void>(done=>{release=done;});return route.fulfill({json:{accepted:true,changed:true}});
  });
  await page.goto(base);
  const item=(id:string,tool='mail_send',hash='a'.repeat(64)):AgentApproval=>({id,run_id:'generated-run',tool_id:tool,tool_version:'1',parameter_hash:hash,status:'pending',expires_at:'2099-01-01T00:00:00Z',
   payload:tool==='mail_send'?{to:id+'@example.invalid',subject:'Synthetic reviewed subject',body:'Synthetic final email content. No email is sent.'}:{plan:'Synthetic plan only'}});
  const initial=[item('one'),item('two'),item('plan','plan_confirmation')];
  const replace=async(items:AgentApproval[])=>page.evaluate(items=>{(window as unknown as {replaceApprovals:(items:AgentApproval[])=>void}).replaceApprovals(items);},items);
  await replace(initial);const cards=page.locator('.agent-approval'),confirm=page.getByRole('button',{name:'确认此内容',exact:true}),batch=page.getByRole('button',{name:/^确认以上全部邮件/});
  await expect(cards).toHaveCount(3);await expect(batch).toBeVisible();await confirm.first().click();await expect(page.getByRole('alert')).toContainText('尚未确认');await expect(confirm).toHaveCount(3);await expect(page.getByRole('status')).toHaveCount(0);assert.equal(posts.length,1);
  mode='network';await confirm.first().click();await expect.poll(()=>posts.length).toBe(2);await expect(page.getByRole('alert')).toContainText('尚未确认');await expect(confirm.first()).toBeEnabled();await expect(page.getByRole('status')).toHaveCount(0);
  mode='hold';release=noPending;await confirm.first().click();await expect.poll(()=>posts.length).toBe(3);await expect(page.getByRole('status')).toHaveText('正在保存决定…');
  await expect(batch).toBeDisabled();assert(await page.locator('.agent-run-actions button').evaluateAll(buttons=>buttons.every(button=>(button as HTMLButtonElement).disabled)));
  // Programmatic repeated handlers cannot escape the synchronous request gate.
  await confirm.first().evaluate(button=>{button.dispatchEvent(new MouseEvent('click',{bubbles:true}));button.dispatchEvent(new MouseEvent('click',{bubbles:true}));});assert.equal(posts.length,3);
  assert(release);release();await expect(cards.first()).toContainText('已批准，等待执行结果');await expect(confirm).toHaveCount(2);await expect(page.getByRole('status')).toContainText('批准决定已保存');
  await replace(initial);await expect(cards.first()).toContainText('已批准，等待执行结果');await expect(confirm).toHaveCount(2);assert.deepEqual(posts[2].body,{decision:'approve',parameterHash:initial[0].parameter_hash});
  release=noPending;await cards.first().getByRole('button',{name:'撤销',exact:true}).click();await expect.poll(()=>posts.length).toBe(4);assert(release);release();await expect(cards).toHaveCount(2);await expect(page.getByRole('status')).toHaveText('撤销决定已保存。');
  await replace(initial);await expect(cards).toHaveCount(2);
  const changed=[item('one','mail_send','b'.repeat(64)),initial[1],initial[2]];await replace(changed);await expect(cards).toHaveCount(3);await expect(confirm).toHaveCount(3);
  release=noPending;await cards.first().getByRole('button',{name:'拒绝',exact:true}).click();await expect.poll(()=>posts.length).toBe(5);assert(release);release();await expect(cards).toHaveCount(2);assert.deepEqual(posts[4].body,{decision:'deny',parameterHash:changed[0].parameter_hash});
  const next=[item('one','mail_send','c'.repeat(64)),item('two','mail_send','c'.repeat(64)),initial[2]];await replace(next);await expect(cards).toHaveCount(3);
  mode='conflict';await batch.click();await expect.poll(()=>posts.length).toBe(6);await expect(page.getByRole('alert')).toContainText('逐封核对');await expect(confirm).toHaveCount(3);await expect(batch).toBeEnabled();
  mode='hold';release=noPending;await batch.click();await expect.poll(()=>posts.length).toBe(7);await expect(batch).toBeDisabled();await expect(confirm.first()).toBeDisabled();
  const changedDuringBatch=[next[0],item('two','mail_send','d'.repeat(64)),initial[2],item('three')];await replace(changedDuringBatch);await expect(cards).toHaveCount(4);await expect(confirm.last()).toBeDisabled();assert(release);release();
  await expect(page.getByRole('status')).toContainText('本次提交的 2 封邮件的批准决定已保存');await expect(cards.first()).toContainText('已批准，等待执行结果');await expect(confirm).toHaveCount(3);
  assert.deepEqual(posts[6],{url:'/api/assistant/approvals/batch',body:{items:next.slice(0,2).map(item=>({id:item.id,parameterHash:item.parameter_hash}))}});
  await replace(next);await expect(confirm).toHaveCount(1);await expect(batch).toHaveCount(0);await expect(cards.nth(1)).toContainText('已批准，等待执行结果');
  await replace(next.map(item=>({...item,status:'consumed'})));await expect(cards).toHaveCount(0);
  await replace(changedDuringBatch);await expect(cards).toHaveCount(4);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  const screenshot=`tmp/approval-submission-ui/${width}.png`;await page.screenshot({path:screenshot,fullPage:true});screenshots.push(screenshot);assert.equal(posts.length,7);await context.close();
 }
 assert.deepEqual(errors,[]);const result={approvalSubmissionComponent:'passed',viewports:3,heldSingleAndBatchDisableAllActions:true,repeatedClicksDoNotResubmit:true,successReceiptSurvivesStaleProps:true,immediateRevokeAndDeny:true,newParameterHashRequiresNewConfirmation:true,batchUsesExactSubmittedSnapshot:true,changedAndNewBatchItemsRemainPending:true,conflictAndNetworkFailureNeverClaimSaved:true,terminalServerStateNotResurrected:true,noHorizontalOverflow:true,screenshots,syntheticHttpOnly:true,realHumanApproval:false,actualModelCalls:0,externalActions:0};
 await writeFile('tmp/approval-submission-ui/result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{clearTimeout(watchdog);await browser.close();server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}
