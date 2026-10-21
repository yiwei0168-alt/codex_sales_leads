import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:https';
import {request} from 'node:http';
import {writeFile} from 'node:fs/promises';
import {Client} from 'pg';
import {chromium,expect} from '@playwright/test';
import {getPool} from '../src/lib/rag/db';
import {enqueueRun} from '../src/lib/assistant/main/repository';
import {requestApproval} from '../src/lib/assistant/main/approvals';
import {productTools} from '../src/lib/assistant/main/tools';

assert.equal(process.env.MA24_DISPOSABLE_RUN_STATUS_UI,'1');
const adminUrl=new URL(process.env.DATABASE_MIGRATION_URL!),appUrl=new URL(process.env.DATABASE_URL!);assert.equal(adminUrl.hostname,'127.0.0.1');assert.equal(adminUrl.host+adminUrl.pathname,appUrl.host+appUrl.pathname);assert.equal(adminUrl.pathname,'/network_copilot_local');
const container=process.env.MA24_RUN_STATUS_DATABASE_CONTAINER!;assert.match(container,/^[a-f0-9]{64}$/);
const docker=(args:string[])=>execFileSync('docker',args,{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();assert.match(docker(['inspect','--format','{{.Name}}',container]),/^\/ma24-pilot-fresh-[a-f0-9]{12}$/);
const upstream=new URL(process.env.MA24_RUN_STATUS_WEB_BASE!);assert.equal(upstream.hostname,'127.0.0.1');assert.equal(upstream.protocol,'http:');
const cookie=process.env.MA24_RUN_STATUS_OWNER_COOKIE!,peer=process.env.MA24_RUN_STATUS_PEER_COOKIE!;assert(cookie&&peer&&cookie!==peer);
const admin=new Client({connectionString:adminUrl.toString()});await admin.connect();
const proxy=createServer({key:docker(['exec',container,'cat','/tmp/ma24-server.key']),cert:docker(['exec',container,'cat','/tmp/ma24-server.crt'])},(incoming,outgoing)=>{
 const forward=request({hostname:upstream.hostname,port:upstream.port,path:incoming.url,method:incoming.method,headers:{...incoming.headers,'x-forwarded-proto':'https'}},response=>{outgoing.writeHead(response.statusCode??502,response.headers);response.pipe(outgoing);});forward.on('error',()=>{outgoing.writeHead(502);outgoing.end();});incoming.pipe(forward);
});
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;const releases:Array<()=>void>=[],steps:string[]=[];
const progress=async(stage:string)=>{steps.push(stage);await writeFile(`tmp/ma24-run-status-progress-${container.slice(0,12)}.json`,JSON.stringify({stage,steps})+'\n');};
const watchdog=setTimeout(()=>{console.error('Run status fixed Web watchdog expired');process.exit(1);},180000);watchdog.unref();
try{
 const owner=(await admin.query('select id,email from app_user where email=$1',[process.env.MA24_RUN_STATUS_OWNER_EMAIL])).rows[0];assert(owner);assert.match(owner.email,/^pilot-container-[a-f0-9]{12}-0@example\.invalid$/);
 const content='Synthetic status recovery '+randomUUID(),task=await enqueueRun(owner.id,{content,attachments:[],requestKey:randomUUID()},{model:'synthetic-unusable',providers:['synthetic-unusable'],version:'synthetic'});
 await admin.query("update agent_run set status='paused' where id=$1 and user_id=$2",[task.id,owner.id]);
 const tool=productTools.find(tool=>tool.id==='mail_send');assert(tool);
 for(const label of ['one','two'])await requestApproval({userId:owner.id,runId:task.id,leaseToken:randomUUID(),role:'member'},tool,{connectionId:randomUUID(),to:`synthetic-${label}@example.invalid`,subject:'Generated status test only',body:'Never sent.'});
 const endpoint=upstream.origin+'/api/assistant/runs?conversationId='+task.conversation_id;
 const peerRead=await fetch(endpoint,{headers:{cookie:peer},signal:AbortSignal.timeout(20000)});assert.equal(peerRead.status,200);assert.deepEqual((await peerRead.json()).runs,[]);
 const anonymous=await fetch(endpoint,{signal:AbortSignal.timeout(20000)});assert.equal(anonymous.status,401);await anonymous.arrayBuffer();
 const row=async()=>(await admin.query('select status,instructions from agent_run where id=$1 and user_id=$2',[task.id,owner.id])).rows[0];
 await new Promise<void>(done=>proxy.listen(0,'127.0.0.1',done));const address=proxy.address();assert(address&&typeof address!=='string');const base=`https://127.0.0.1:${address.port}`;
 browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1366,height:900}});const separator=cookie.indexOf('=');await context.addCookies([{name:cookie.slice(0,separator),value:cookie.slice(separator+1),url:base,httpOnly:true,secure:true,sameSite:'Lax'}]);
 let statusMode:'ok'|'fail'|'hold'='ok',holdEvents=false,holdInstruction=false,failAfterInstruction=false;
 const held:Array<{kind:string;release:()=>void;finished:boolean}>=[],posts:Array<{path:string;body:Record<string,unknown>}>=[],errors:string[]=[],screenshots:string[]=[];
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin!==base)return route.abort();
  const statusRead=url.pathname==='/api/assistant/runs'&&req.method()==='GET',eventRead=url.pathname===`/api/assistant/runs/${task.id}/events`&&req.method()==='GET',control=url.pathname===`/api/assistant/runs/${task.id}/control`&&req.method()==='POST';
  if(control){const body=req.postDataJSON();posts.push({path:url.pathname,body});if(body.action==='instruct'&&failAfterInstruction)statusMode='fail';}
  if(statusRead&&statusMode==='fail')return route.fulfill({status:503,json:{error:'Synthetic status readback failure'}});
  const kind=statusRead&&statusMode==='hold'?'status':eventRead&&holdEvents?'event':control&&holdInstruction&&req.postDataJSON().action==='instruct'?'control':'';
  if(!kind)return route.continue();
  const response=await route.fetch();assert.equal(response.status(),200);let entry:typeof held[number]|undefined;
  await new Promise<void>(done=>{entry={kind,release:done,finished:false};held.push(entry);releases.push(done);});
  try{await route.fulfill({response});}catch{/* A held read may have reached its explicit browser deadline. */}finally{if(entry)entry.finished=true;}
 });
 const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));assert.equal((await page.goto(`${base}/c/${task.conversation_id}`))?.status(),200);await expect(page.getByText(content,{exact:true})).toBeVisible();
 const card=page.locator('#agent-run-'+task.id),draft=card.getByLabel('追加任务要求'),resume=card.getByRole('button',{name:'继续',exact:true}),append=card.getByRole('button',{name:'追加',exact:true});
 await expect(resume).toBeEnabled();await draft.fill('Generated draft must survive read failure');statusMode='fail';await expect(card.getByRole('status').filter({hasText:'尚未核实'})).toBeVisible();await expect(draft).toHaveValue('Generated draft must survive read failure');assert(await card.locator('.agent-run-actions button').evaluateAll(buttons=>buttons.length>0&&buttons.every(button=>(button as HTMLButtonElement).disabled)));await expect(card.getByRole('button',{name:/^确认以上全部邮件/})).toBeDisabled();assert.equal(posts.length,0);await progress('status-failure-draft-lock-passed');
 statusMode='ok';await expect(resume).toBeEnabled();holdEvents=true;await expect.poll(()=>held.filter(entry=>entry.kind==='event').length,{timeout:10000}).toBeGreaterThan(0);
 await resume.click();await expect(card.getByRole('button',{name:'暂停',exact:true})).toBeEnabled({timeout:7000});assert.equal((await row()).status,'queued');assert(held.some(entry=>entry.kind==='event'&&!entry.finished));
 await card.getByRole('button',{name:'暂停',exact:true}).click();await expect(resume).toBeEnabled();assert.equal((await row()).status,'paused');holdEvents=false;for(const entry of held.filter(entry=>entry.kind==='event'))entry.release();await progress('event-stall-does-not-block-real-controls');
 // Commit the real instruction, hold its HTTP acknowledgement, and keep text
 // typed after submission while the next status read is deliberately failed.
 const submitted='Generated instruction saved exactly once',newer='Newer unsaved draft stays editable';await draft.fill(submitted);holdInstruction=true;failAfterInstruction=true;await append.click();await expect.poll(()=>held.filter(entry=>entry.kind==='control').length).toBe(1);await draft.fill(newer);
 assert.equal((await row()).instructions.at(-1).content,submitted);const controlHold=held.find(entry=>entry.kind==='control')!;controlHold.release();await expect(page.getByText('追加要求已保存。',{exact:true})).toBeVisible();await expect(draft).toHaveValue(newer);await expect(resume).toBeDisabled();await expect(page.getByText('任务状态暂不可用，正在重试',{exact:true})).toBeVisible();assert.equal((await row()).instructions.length,1);await progress('confirmed-write-failed-readback-retains-newer-draft');
 await page.setViewportSize({width:390,height:844});await card.locator('.agent-run-actions strong').first().scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));const screenshot=`tmp/ma24-run-status-mobile-${randomUUID()}.png`;await page.screenshot({path:screenshot,fullPage:true});screenshots.push(screenshot);
 await page.setViewportSize({width:1366,height:900});holdInstruction=false;failAfterInstruction=false;statusMode='ok';await expect(resume).toBeEnabled();await expect(draft).toHaveValue(newer);
 // A real GET captured before this write must not re-enable its old controls.
 statusMode='hold';const before=held.filter(entry=>entry.kind==='status').length;await expect.poll(()=>held.filter(entry=>entry.kind==='status').length).toBeGreaterThan(before);const old=held.filter(entry=>entry.kind==='status').at(-1)!;
 await draft.fill('Generated second instruction');failAfterInstruction=true;await append.click();await expect(draft).toHaveValue('');await expect(page.getByText('追加要求已保存。',{exact:true})).toBeVisible();old.release();await expect.poll(()=>old.finished).toBe(true);await page.evaluate(()=>new Promise<void>(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done()))));await expect(resume).toBeDisabled();assert.equal((await row()).instructions.length,2);
 statusMode='ok';failAfterInstruction=false;await expect(resume).toBeEnabled();assert.deepEqual(posts.map(post=>{const {requestKey,...body}=post.body;if(body.action==='instruct')assert.match(String(requestKey),/^[a-f0-9-]{36}$/);else assert.equal(requestKey,undefined);return body;}),[{action:'resume'},{action:'pause'},{action:'instruct',content:submitted},{action:'instruct',content:'Generated second instruction'}]);
 assert.equal((await admin.query('select count(*)::int n from agent_tool_call where run_id=$1',[task.id])).rows[0].n,0);assert.equal((await admin.query("select count(*)::int n from agent_approval where run_id=$1 and status='pending'",[task.id])).rows[0].n,2);assert.equal((await row()).status,'paused');assert.deepEqual(errors,[]);
 const {verifyInstructionSubmissionFixedWeb}=await import('./lib/verify-instruction-submission-fixed-web');
 const instructionSubmission=await verifyInstructionSubmissionFixedWeb({admin,owner:owner.id,cookie,peer,base,upstream:upstream.origin,page});
 const result={instructionSubmission,runStatusFixedWeb:'passed',actualChromeHttpsCompiledWebApiDatabase:true,statusFailureLocksActionsAndKeepsDraft:true,eventStallDoesNotBlockActualResumePause:true,realInstructionSavedOncePerConfirmation:true,successfulWriteFailedReadbackPreservesNewerDraft:true,preWriteGetCannotReenableOldControls:true,recovery:true,peerAndAnonymousIsolation:true,pendingMailApprovalsUnchanged:true,taskEndsPaused:true,toolCalls:0,actualModelCalls:0,externalActions:0,screenshots,realBusinessQualityAccepted:false,productionQualified:false};await writeFile('tmp/ma24-run-status-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));await progress('passed');
}catch(error){console.error('Run status fixed Web failed after',steps.at(-1),error);throw error;}
finally{clearTimeout(watchdog);for(const release of releases)release();const timeout=setTimeout(()=>process.exit(1),15000);timeout.unref();try{await browser?.close();}finally{proxy.closeAllConnections();if(proxy.listening)await new Promise<void>(done=>proxy.close(()=>done()));await Promise.allSettled([admin.end(),getPool().end()]);clearTimeout(timeout);}}
