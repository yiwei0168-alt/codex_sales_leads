import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';

const compiled=await build({stdin:{contents:`import React,{useState,useCallback}from'react';import{createRoot}from'react-dom/client';import{AgentRunCard,useAgentRuns}from'./src/components/agent-runs';
window.updates=[];function App(){const[id,setId]=useState();const updated=useCallback(()=>window.updates.push(id),[id]);const state=useAgentRuns(id,updated);window.openConversation=setId;window.rawControl=state.control;window.rawUndo=state.undo;
return <main><output data-testid="scope">{id??'none'}</output>{state.runs.map(run=><AgentRunCard key={run.id} run={run} events={state.eventsByRun[run.id]} now={state.now} onControl={state.control} onUndo={state.undo} statusCurrent={state.statusCurrent}/>)}{state.error&&<p role="alert">{state.error}</p>}{state.notice&&<p data-testid="notice">{state.notice}</p>}</main>}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'component.js',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const js=compiled.outputFiles.find(file=>file.path.endsWith('.js'))!.text,css=await readFile('src/app/globals.css','utf8');
const server=createServer((req,res)=>{
 if(req.url==='/component.js'){res.setHeader('content-type','application/javascript');return void res.end(js);}
 if(req.url==='/styles.css'){res.setHeader('content-type','text/css');return void res.end(css);}
 res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><div id="root"></div><script src="/component.js"></script></html>');
});
await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`;
const browser=await chromium.launch({channel:'chrome',headless:true}),screenshots:string[]=[],errors:string[]=[];
const watchdog=setTimeout(()=>{console.error('Run status component watchdog expired');process.exit(1);},180000);watchdog.unref();
try{
 await mkdir('tmp/run-status-ui',{recursive:true});
 for(const width of [1366,390,320]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();page.setDefaultTimeout(18000);page.on('pageerror',error=>errors.push(error.message));
  let statusMode:'ok'|'fail'|'hold'='ok',eventMode:'ok'|'fail'|'hold'='ok',postMode:'ok'|'fail'|'hold'='ok';
  const status:Record<string,string>={A:'paused',B:'paused'},reads:{scope:string;after?:string}[]=[],eventReads:string[]=[],posts:Array<{path:string;body:Record<string,unknown>}>=[];
  const holds:Array<{kind:string;release:()=>void;finished:boolean}>=[];
  let queueWaitMs=0,pendingBatch=false;
  const run=(id:string)=>({id:'run-'+id,conversation_id:id,status:status[id],result:null,queue_wait_ms:queueWaitMs,batch:pendingBatch?{status:'pending',submittedAt:new Date().toISOString(),pollCount:1}:null,memories:[{id:'memory-'+id,key:'Generated preference '+id,version:1}],approvals:['one','two'].map(label=>({id:label+'-'+id,run_id:'run-'+id,tool_id:'mail_send',tool_version:'1',parameter_hash:'a'.repeat(64),status:'pending',expires_at:'2099-01-01',payload:{to:label+'@example.invalid',subject:'Generated only '+id,body:'Synthetic body. No sending.'}}))});
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!==base)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();
   let kind:string='',body:unknown;
   if(route.request().method()==='POST'||route.request().method()==='PATCH'){
    posts.push({path:url.pathname,body:route.request().postDataJSON()});if(postMode==='fail')return route.fulfill({status:409,json:{error:'Synthetic conflict'}});
    body={accepted:true};if(postMode==='hold')kind='post';
   }else if(url.pathname==='/api/assistant/runs'){
    const id=url.searchParams.get('conversationId')!;reads.push({scope:id});if(statusMode==='fail')return route.fulfill({status:503,json:{error:'Synthetic status failure'}});
    body={runs:[run(id)]};if(statusMode==='hold')kind='status';
   }else if(url.pathname.endsWith('/events')){
    eventReads.push(url.searchParams.get('after')??'0');if(eventMode==='fail')return route.fulfill({status:503,json:{error:'Synthetic event failure'}});
    body=url.searchParams.get('after')==='0'?'id: 9007199254740993\nevent: tool_result\ndata: {"tool":"synthetic-read","status":"success","callId":"generated"}\n\n':': no more events\n\n';if(eventMode==='hold')kind='event';
   }else throw new Error('Unexpected fixture endpoint '+url.pathname);
   let held:typeof holds[number]|undefined;
   if(kind)await new Promise<void>(done=>{held={kind,release:done,finished:false};holds.push(held);});
   try{if(typeof body==='string')await route.fulfill({body,contentType:'text/event-stream'});else await route.fulfill({json:body});}catch{/* An intentionally aborted/closed held request has no response. */}finally{if(held)held.finished=true;}
  });
  await page.goto(base);await expect(page.getByTestId('scope')).toHaveText('none');await expect(page.locator('.agent-run')).toHaveCount(0);
  const open=async(id:string|undefined)=>page.evaluate(id=>(window as unknown as {openConversation:(id:string|undefined)=>void}).openConversation(id),id);
  await open('A');const card=page.locator('#agent-run-run-A'),draft=card.getByLabel('追加任务要求'),resume=card.getByRole('button',{name:'继续',exact:true});
  await expect(resume).toBeEnabled();
  const queueHint=card.getByRole('status').filter({hasText:'等待后台调度已超过'});
  status.A='queued';queueWaitMs=60_000;await expect(queueHint).toBeVisible();await expect(queueHint).toContainText('无需重复提交');
  const queuePath=`tmp/run-status-ui/queue-${width}.png`;await page.screenshot({path:queuePath,fullPage:true});screenshots.push(queuePath);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.equal(posts.length,0);
  pendingBatch=true;await expect(card.locator('.agent-batch-state')).toBeVisible();await expect(queueHint).toHaveCount(0);
  pendingBatch=false;status.A='running';await expect(card.locator('.agent-run-actions strong').first()).toHaveText('执行中');await expect(queueHint).toHaveCount(0);
  status.A='queued';await expect(queueHint).toBeVisible();statusMode='fail';await expect(card.getByRole('status').filter({hasText:'尚未核实'})).toBeVisible();await expect(queueHint).toHaveCount(0);
  status.A='paused';queueWaitMs=0;statusMode='ok';await expect(resume).toBeEnabled();await draft.fill('Synthetic unsaved requirement');
  statusMode='fail';await expect(card.getByRole('status').filter({hasText:'尚未核实'})).toBeVisible();await expect(draft).toHaveValue('Synthetic unsaved requirement');
  assert(await card.locator('.agent-run-actions button').evaluateAll(buttons=>buttons.length>0&&buttons.every(button=>(button as HTMLButtonElement).disabled)));
  await expect(card.getByRole('button',{name:/^确认以上全部邮件/})).toBeDisabled();await expect(card.locator('p').filter({hasText:'Generated preference A'}).getByRole('button',{name:'撤销',exact:true})).toBeDisabled();
  await page.evaluate(async()=>{const fixture=window as unknown as {rawControl:(id:string,action:string,content?:string)=>Promise<boolean>;rawUndo:(id:string,version:number)=>Promise<void>};await fixture.rawControl('run-A','instruct','Forbidden stale draft');await fixture.rawUndo('memory-A',1);});assert.equal(posts.length,0);
  const path=`tmp/run-status-ui/${width}.png`;await page.screenshot({path,fullPage:true});screenshots.push(path);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  statusMode='ok';await expect(resume).toBeEnabled();await expect(draft).toHaveValue('Synthetic unsaved requirement');
  if(width===1366){
   // Status polling continues while the independent saved-event page hangs.
   eventMode='hold';await expect.poll(()=>holds.filter(h=>h.kind==='event').length).toBeGreaterThan(0);const before=reads.length;status.A='queued';
   await expect(card.locator('.agent-run-actions strong').first()).toHaveText('排队中');assert(reads.length>before);await expect(card.getByRole('button',{name:'暂停',exact:true})).toBeEnabled();
   await expect(page.getByRole('alert')).toContainText('任务事件暂不可用',{timeout:15000});eventMode='ok';for(const held of holds.filter(h=>h.kind==='event'))held.release();await expect(page.getByRole('alert')).toHaveCount(0);assert(eventReads.includes('9007199254740993'));
   // A hung status read becomes unavailable after the real bounded deadline.
   statusMode='hold';await expect.poll(()=>holds.filter(h=>h.kind==='status').length).toBeGreaterThan(0);await expect(card.getByRole('status').filter({hasText:'尚未核实'})).toBeVisible({timeout:15000});await expect(draft).toHaveValue('Synthetic unsaved requirement');
   status.A='paused';statusMode='ok';for(const held of holds.filter(h=>h.kind==='status'))held.release();await expect(resume).toBeEnabled();
   postMode='fail';await card.getByRole('button',{name:'追加',exact:true}).click();await expect(page.getByRole('alert')).toContainText('结果未确认');await expect(draft).toHaveValue('Synthetic unsaved requirement');await expect(page.getByTestId('notice')).toHaveCount(0);
   // A status response started before a successful write cannot re-enable actions.
   statusMode='hold';const priorHolds=holds.filter(h=>h.kind==='status').length;await expect.poll(()=>holds.filter(h=>h.kind==='status').length).toBeGreaterThan(priorHolds);const held=holds.filter(h=>h.kind==='status').at(-1)!;
   postMode='ok';await card.getByRole('button',{name:'追加',exact:true}).click();await expect(page.getByTestId('notice')).toHaveText('追加要求已保存。');await expect(draft).toHaveValue('');statusMode='fail';held.release();await expect.poll(()=>held.finished).toBe(true);await page.evaluate(()=>new Promise<void>(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done()))));await expect(resume).toBeDisabled();
   const after=posts.length;await page.evaluate(async()=>{await(window as unknown as {rawControl:(id:string,action:string)=>Promise<boolean>}).rawControl('run-A','resume');});assert.equal(posts.length,after);
   await expect(page.getByRole('alert')).toContainText('任务状态暂不可用');await expect(page.getByTestId('notice')).toHaveText('追加要求已保存。');statusMode='ok';await expect(resume).toBeEnabled();
   // A late action from A must not refresh B, leak its notice or restore A's cards.
   await draft.fill('Synthetic A late request');postMode='hold';await card.getByRole('button',{name:'追加',exact:true}).click();await expect.poll(()=>holds.filter(h=>h.kind==='post').length).toBe(1);await open('B');const other=page.locator('#agent-run-run-B');await expect(other.getByRole('button',{name:'继续',exact:true})).toBeEnabled();postMode='ok';await other.getByLabel('追加任务要求').fill('Synthetic B confirmed request');await other.getByRole('button',{name:'追加',exact:true}).click();await expect(page.getByTestId('notice')).toHaveText('追加要求已保存。');const updateCount=await page.evaluate(()=>(window as unknown as {updates:string[]}).updates.length);
   const late=holds.find(h=>h.kind==='post')!;late.release();await expect.poll(()=>late.finished).toBe(true);await page.evaluate(()=>new Promise<void>(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done()))));await expect(page.getByTestId('notice')).toHaveText('追加要求已保存。');await expect(card).toHaveCount(0);assert.equal(await page.evaluate(()=>(window as unknown as {updates:string[]}).updates.length),updateCount);
   await open(undefined);await expect(page.locator('.agent-run')).toHaveCount(0);await expect(page.getByRole('alert')).toHaveCount(0);
  }
  for(const held of holds)held.release();await context.close();
 }
 assert.deepEqual(errors,[]);const result={runStatusComponent:'passed',viewports:3,longQueueHint:true,hintHiddenForStaleRunningAndSupplierBatch:true,readFailureLocksControlsApprovalsAndUndo:true,draftPreserved:true,recovery:true,eventFailureDoesNotBlockStatus:true,realStatusAndEventTimeouts:true,largeEventCursorPreserved:true,writeFailureKeepsDraft:true,successfulWriteNoticeSurvivesReadFailure:true,oldReadCannotReenableControls:true,latePriorConversationActionCannotRefreshCurrent:true,emptyConversationAndScopedErrors:true,noHorizontalOverflow:true,screenshots,syntheticHttpOnly:true,actualModelCalls:0,externalActions:0};await writeFile('tmp/run-status-ui/result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{clearTimeout(watchdog);await browser.close();server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}
