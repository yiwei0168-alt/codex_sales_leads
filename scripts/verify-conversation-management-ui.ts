import assert from "node:assert/strict";
import {createServer} from "node:http";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {build} from "esbuild";
import {chromium,expect} from "@playwright/test";

const built=await build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import{ConversationHistory}from'./src/components/conversation-history';function App(){const[n,setN]=React.useState(0);return <><output aria-label="new conversation count">{n}</output><ConversationHistory activeId="conversation-1" refreshKey={0} onSelect={()=>{}} onNew={()=>setN(v=>v+1)}/></>};createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const css=(await Promise.all(['src/app/globals.css','src/app/conversation-theme.css'].map(path=>readFile(path,'utf8')))).join('\n');
const server=createServer((req,res)=>{
 if(req.url==='/component.js'){res.setHeader('content-type','application/javascript');res.end(built.outputFiles[0].text);}
 else if(req.url==='/styles.css'){res.setHeader('content-type','text/css');res.end(css);}
 else {res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body class="conversation-theme"><main style="max-width:300px;padding:16px"><div id="root"></div></main><script src="/component.js"></script></body></html>');}
});
await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`;
const browser=await chromium.launch({channel:'chrome',headless:true});const screenshots:string[]=[],results:unknown[]=[];
const watchdog=setTimeout(()=>{console.error('Conversation management watchdog expired');process.exit(1);},120000);watchdog.unref();
try{
 await mkdir('tmp/conversation-management',{recursive:true});
 for(const width of [1366,390,320]){
  const context=await browser.newContext({viewport:{width,height:760}});await context.addInitScript(()=>{Storage.prototype.removeItem=()=>{throw new Error('Synthetic storage unavailable');};});
  const page=await context.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  let title='Original conversation',patches=0,deletes=0,deleted=false,readFails=false,listFails=false;
  let mode:'save'|'drop'|'reject'|'hold'='save',release:(()=>void)|undefined;
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
   if(url.pathname==='/api/assistant/conversations')return route.fulfill(listFails?{status:503,json:{}}:{json:{conversations:deleted?[]:[{id:'conversation-1',title,status:'active',updatedAt:'2026-10-21T16:30:00Z',messageCount:2}]}});
   if(url.pathname!=='/api/assistant/conversations/conversation-1')return route.continue();
   if(route.request().method()==='GET')return route.fulfill(readFails?{status:503,json:{}}:{json:{conversation:{id:'conversation-1',title}}});
   if(route.request().method()==='DELETE'){deletes++;deleted=true;listFails=true;return route.fulfill({json:{deleted:true}});}
   assert.equal(route.request().method(),'PATCH');patches++;
   if(mode==='reject')return route.fulfill({status:400,json:{error:'Synthetic invalid title'}});
   title=(route.request().postDataJSON() as {title:string}).title;
   if(mode==='drop')return route.abort('connectionreset');
   if(mode==='hold')await new Promise<void>(done=>{release=done;});
   return route.fulfill({json:{updated:true}}).catch(()=>{});
  });
  await page.goto(base);
  const open=async()=>{const trigger=page.getByRole('button',{name:`${title} 更多操作`,exact:true});await trigger.click();await page.getByRole('menuitem',{name:'重命名',exact:true}).click();const dialog=page.getByRole('dialog',{name:'重命名对话'});await expect(dialog.getByLabel('对话名称')).toBeFocused();return {dialog,trigger};};
  const opened=await open(),trigger=opened.trigger;let dialog=opened.dialog;await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();assert.equal(patches,0);
  ({dialog}=await open());await dialog.getByLabel('对话名称').fill('  ');await expect(dialog.getByRole('button',{name:'保存名称',exact:true})).toBeDisabled();await dialog.getByRole('button',{name:'取消'}).click();assert.equal(patches,0);
  ({dialog}=await open());mode='hold';await dialog.getByLabel('对话名称').fill('Confirmed rename');await dialog.getByRole('button',{name:'保存名称',exact:true}).click();await expect.poll(()=>Boolean(release)).toBe(true);
  await dialog.locator('form').evaluate(form=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});await page.keyboard.press('Escape');await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:'取消'})).toBeDisabled();assert.equal(patches,1);release!();release=undefined;await expect(dialog).toHaveCount(0);await expect(page.locator('.conversation-history').getByRole('status')).toContainText('名称已保存');
  ({dialog}=await open());mode='reject';await dialog.getByLabel('对话名称').fill('Retained draft');await dialog.getByRole('button',{name:'保存名称',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('未被接受');await expect(dialog.getByLabel('对话名称')).toHaveValue('Retained draft');await expect(dialog.getByRole('button',{name:'保存名称',exact:true})).toBeEnabled();assert.equal(patches,2);
  mode='drop';await dialog.getByRole('button',{name:'保存名称',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('可能已经保存');await expect(dialog.getByLabel('对话名称')).toHaveValue('Retained draft');await expect(dialog.getByRole('button',{name:'保存名称',exact:true})).toBeDisabled();assert.equal(patches,3);
  const pending=`tmp/conversation-management/pending-${width}.png`;await dialog.screenshot({path:pending});screenshots.push(pending);
  readFails=true;await dialog.getByRole('button',{name:'核对保存结果',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('无法读取');assert.equal(patches,3);readFails=false;await dialog.getByLabel('对话名称').fill('Newer unsaved draft');await dialog.getByRole('button',{name:'核对保存结果',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('后来修改的输入尚未保存');await expect(dialog.getByLabel('对话名称')).toHaveValue('Newer unsaved draft');assert.equal(patches,3);await dialog.getByRole('button',{name:'取消'}).click();({dialog}=await open());mode='drop';await dialog.getByLabel('对话名称').fill('Second recovery');await dialog.getByRole('button',{name:'保存名称',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('可能已经保存');await dialog.getByRole('button',{name:'核对保存结果',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.locator('.conversation-history').getByRole('status')).toContainText('已核对当前名称与提交一致');assert.equal(patches,4);
  ({dialog}=await open());await dialog.getByLabel('对话名称').fill('Overwrite only explicitly');await dialog.getByRole('button',{name:'保存名称',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('可能已经保存');title='Changed elsewhere';await dialog.getByRole('button',{name:'核对保存结果',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Changed elsewhere');await expect(dialog.getByLabel('对话名称')).toHaveValue('Overwrite only explicitly');assert.equal(patches,5);
  const mismatch=`tmp/conversation-management/mismatch-${width}.png`;await dialog.screenshot({path:mismatch});screenshots.push(mismatch);mode='save';await dialog.getByRole('button',{name:'仍要保存此名称',exact:true}).click();await expect(dialog).toHaveCount(0);assert.equal(patches,6);
  await page.getByRole('button',{name:`${title} 更多操作`,exact:true}).click();await page.getByRole('menuitem',{name:'删除对话',exact:true}).click();const deletion=page.getByRole('dialog',{name:'删除对话'});await deletion.getByRole('button',{name:'删除对话',exact:true}).click();await expect(deletion).toHaveCount(0);await expect(page.locator('.conversation-history').getByRole('status').filter({hasText:'已从历史移除'})).toBeVisible();await expect(page.getByLabel('new conversation count')).toHaveText('1');await expect(page.locator('.conversation-history-item')).toHaveCount(0);await expect(page.getByText('对话历史暂不可用',{exact:true})).toBeVisible();assert.equal(deletes,1);
  listFails=false;await page.getByRole('button',{name:'刷新历史',exact:true}).click();await expect(page.getByText('对话历史暂不可用',{exact:true})).toHaveCount(0);assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  results.push({width,patches,deletes,cancelFocus:true,busyLock:true,rejectedDraftRetained:true,droppedAcknowledgementReadOnlyReconciled:true,failedReadRetained:true,newerDraftRetainedOnReconciliation:true,mismatchRequiresExplicitOverwrite:true,confirmedDeleteWithStorageFailureAndListFailure:true});await context.close();
 }
 const result={conversationManagementComponent:'passed',results,screenshots,syntheticHttpOnly:true,actualModelCalls:0};await writeFile('tmp/conversation-management/result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{clearTimeout(watchdog);await browser.close();server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}
