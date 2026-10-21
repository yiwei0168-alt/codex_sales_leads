import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:https';
import {request} from 'node:http';
import {writeFile} from 'node:fs/promises';
import {Client} from 'pg';
import {chromium,expect,type Locator} from '@playwright/test';
import {getPool} from '../src/lib/rag/db';
import {observeMemory,memoryAt} from '../src/lib/knowledge/temporal-memory';

assert.equal(process.env.MA24_DISPOSABLE_MEMORY_UI,'1');
const adminUrl=new URL(process.env.DATABASE_MIGRATION_URL!),appUrl=new URL(process.env.DATABASE_URL!);
assert.equal(adminUrl.hostname,'127.0.0.1');assert.equal(appUrl.host+appUrl.pathname,adminUrl.host+adminUrl.pathname);assert.equal(adminUrl.pathname,'/network_copilot_local');
const databaseContainer=process.env.MA24_MEMORY_DATABASE_CONTAINER!;assert.match(databaseContainer,/^[a-f0-9]{64}$/);
const docker=(args:string[])=>execFileSync('docker',args,{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
assert.match(docker(['inspect','--format','{{.Name}}',databaseContainer]),/^\/ma24-pilot-fresh-[a-f0-9]{12}$/);
const upstream=new URL(process.env.MA24_MEMORY_WEB_BASE!);assert.equal(upstream.protocol,'http:');assert.equal(upstream.hostname,'127.0.0.1');
const cookie=process.env.MA24_MEMORY_OWNER_COOKIE!,peerCookie=process.env.MA24_MEMORY_PEER_COOKIE!;assert(cookie&&peerCookie&&cookie!==peerCookie);
const admin=new Client({connectionString:adminUrl.toString()});await admin.connect();
const proxy=createServer({key:docker(['exec',databaseContainer,'cat','/tmp/ma24-server.key']),cert:docker(['exec',databaseContainer,'cat','/tmp/ma24-server.crt'])},(incoming,outgoing)=>{
 const forwarded=request({hostname:upstream.hostname,port:upstream.port,path:incoming.url,method:incoming.method,headers:{...incoming.headers,'x-forwarded-proto':'https'}},response=>{outgoing.writeHead(response.statusCode??502,response.headers);response.pipe(outgoing);});
 forwarded.on('error',()=>{outgoing.writeHead(502);outgoing.end();});incoming.pipe(forwarded);
});
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
const progressPath=`tmp/ma24-memory-ui-progress-${databaseContainer.slice(0,12)}.json`;
const steps:Array<{stage:string;detail?:string;at:string}>=[];
const progress=async(stage:string,detail?:string)=>{steps.push({stage,detail,at:new Date().toISOString()});await writeFile(progressPath,JSON.stringify({stage,steps})+'\n');};
const watchdog=setTimeout(()=>{void progress('watchdog-expired').finally(()=>{console.error('Synthetic memory UI watchdog expired');process.exit(1);});},180000);watchdog.unref();
try{
 await progress('seeding');
 const owner=(await admin.query('select id,email from app_user where email=$1',[process.env.MA24_MEMORY_OWNER_EMAIL])).rows[0];assert(owner);assert.match(owner.email,/^pilot-container-[a-f0-9]{12}-0@example\.invalid$/);
 assert.equal((await admin.query('select count(*)::int n from agent_memory_observation where owner_id=$1',[owner.id])).rows[0].n,0);
 const marker=`Synthetic memory ${randomUUID()}`,unknownContent=`${marker} unknown original`,knownContent=`${marker} known original`,earlierContent=`${marker} conflicting earlier`,laterContent=`${marker} conflicting later`;
 const source={type:'synthetic-ui-fixture',usage:'unverified-internal-only',successVerified:false};
 const unknown=await observeMemory(owner.id,{kind:'preference',content:unknownContent,sourceReceipt:source});
 const known=await observeMemory(owner.id,{kind:'experience',content:knownContent,validFrom:'2024-01-01T00:00:00Z',sourceReceipt:source});
 const conflictKey=randomUUID();
 const earlier=await observeMemory(owner.id,{kind:'business-fact',content:earlierContent,memoryKey:conflictKey,validFrom:'2024-01-01T00:00:00Z',sourceReceipt:source});
 await observeMemory(owner.id,{kind:'business-fact',content:laterContent,memoryKey:conflictKey,validFrom:'2024-01-01T00:00:00Z',sourceReceipt:source});
 for(let i=0;i<13;i++)await observeMemory(owner.id,{kind:'preference',content:`${marker} pagination ${i}`,sourceReceipt:source});
 const endpoint=`${upstream.origin}/api/knowledge/observations`;
 const api=async(view:string,actor=cookie)=>{await progress('api-start',view);const r=await fetch(`${endpoint}?view=${view}`,{headers:{cookie:actor},signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);const value=await r.json();await progress('api-complete',view);return value;};
 const post=async(body:unknown,actor=cookie)=>{
  await progress('post-start');const r=await fetch(endpoint,{method:'POST',headers:{cookie:actor,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  const text=await r.text();await progress('post-complete',String(r.status));return {status:r.status,json:async()=>JSON.parse(text)};
 };
 const row=async(id:string)=>(await admin.query('select * from agent_memory_observation where owner_id=$1 and id=$2',[owner.id,id])).rows[0];
 const clock=async()=>new Date((await admin.query('select clock_timestamp() value')).rows[0].value).toISOString();
 const anonymous=await fetch(endpoint,{signal:AbortSignal.timeout(30000)});assert.equal(anonymous.status,401);await anonymous.arrayBuffer();assert.equal((await api('timeline',peerCookie)).items.length,0);assert.equal((await post({action:'correct',id:unknown,content:'Synthetic forbidden correction'},peerCookie)).status,404);
 assert.equal((await api('timeline')).hasMore,true);assert.equal((await api('conflicts')).items.length,1);
 await new Promise<void>(done=>proxy.listen(0,'127.0.0.1',done));const address=proxy.address();assert(address&&typeof address!=='string');const base=`https://127.0.0.1:${address.port}`;
 browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1366,height:900},timezoneId:'Asia/Shanghai'});
 const separator=cookie.indexOf('=');assert(separator>0);await context.addCookies([{name:cookie.slice(0,separator),value:cookie.slice(separator+1),url:base,httpOnly:true,secure:true,sameSite:'Lax'}]);
 let failNextRead=false,posts=0;const errors:string[]=[],screenshots:string[]=[];
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
  if(url.pathname==='/api/knowledge/observations'&&route.request().method()==='GET'&&failNextRead){failNextRead=false;return route.fulfill({status:503,json:{error:'Synthetic post-commit readback failure'}});}
  return route.continue();
 });
 const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));page.on('request',r=>{if(new URL(r.url()).pathname==='/api/knowledge/observations'&&r.method()==='POST')posts++;});
 assert.equal((await page.goto(base+'/knowledge'))?.status(),200);await page.getByRole('button',{name:'个人记忆',exact:true}).click();
 const section=page.locator('section[aria-label="学习记忆"]');await expect(section).toBeVisible();
 const ready=async()=>{await expect(section.getByText('正在读取…',{exact:true})).toHaveCount(0);};
 const view=async(name:string)=>{await progress('view-start',name);await section.getByRole('button',{name,exact:true}).click();await ready();await progress('view-loaded',name);};
 const findCard=async(content:string):Promise<Locator>=>{
  for(let reset=0;await section.getByRole('button',{name:'上一页',exact:true}).isEnabled();reset++){assert(reset<4,'Synthetic fixture could not return to first page');await progress('page-reset',String(reset));await section.getByRole('button',{name:'上一页',exact:true}).click();await ready();}
  for(let n=0;n<5;n++){
   await progress('card-page-search',String(n));const card=section.locator('article.opportunity-card').filter({has:page.getByText(content,{exact:true})});if(await card.count())return card;
   const next=section.getByRole('button',{name:'下一页',exact:true});assert(await next.isEnabled(),'Synthetic observation missing from page');await next.click();await ready();
  }throw new Error('Synthetic pagination limit exceeded');
 };
 const save=async(status=200)=>{await progress('save-start');const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/knowledge/observations'&&r.request().method()==='POST');await section.getByRole('button',{name:'保存更正',exact:true}).click();const result=await response;assert.equal(result.status(),status);const value=await result.json();await progress('save-complete',String(status));return value;};
 await ready();await view('当前有效');await expect(section).toContainText(knownContent);await progress('active-view-reload-passed');
 await view('历史时间轴');let card=await findCard(unknownContent);assert(await section.getByRole('button',{name:'上一页',exact:true}).isEnabled());
 await card.getByRole('button',{name:'更正这条记忆',exact:true}).click();const contentField=section.getByLabel('更正后的完整内容');await expect(contentField).toBeFocused();
 await contentField.fill('Synthetic cancelled draft');await expect(section.getByRole('button',{name:'当前有效',exact:true})).toBeDisabled();await section.getByRole('button',{name:'取消',exact:true}).click();assert.equal(posts,0);
 await card.getByRole('button',{name:'更正这条记忆',exact:true}).click();const correctedContent=`${marker} unknown corrected`;await contentField.fill(correctedContent);failNextRead=true;
 const corrected=(await save()).id;await expect(section.getByRole('alert')).toContainText('读取失败');await expect(section.getByRole('status')).toContainText('更正已保存');await expect(section.locator('article.opportunity-card')).toHaveCount(0);
 assert.equal((await row(corrected)).corrects_id,unknown);assert.equal((await row(corrected)).valid_from,null);
 await section.getByRole('button',{name:'重试读取记忆',exact:true}).click();await ready();await expect(section.getByRole('alert')).toHaveCount(0);
 await progress('committed-correction-retry-passed');
 assert(!(await api('current')).items.some((r:{id:string})=>r.id===corrected));
 card=await findCard(correctedContent);await card.getByRole('button',{name:'更正这条记忆',exact:true}).click();const localDraft=`${marker} retained draft`;await contentField.fill(localDraft);
 const concurrentContent=`${marker} concurrent correction`,concurrentResponse=await post({action:'correct',id:corrected,content:concurrentContent});assert.equal(concurrentResponse.status,200);const concurrent=(await concurrentResponse.json()).id;
 await save(409);await expect(contentField).toHaveValue(localDraft);await expect(section.getByRole('alert')).toContainText('已被更正或撤销');await section.getByRole('button',{name:'取消',exact:true}).click();
 await progress('concurrent-draft-passed');
 await view('当前有效');await view('历史时间轴');card=await findCard(concurrentContent);await card.getByRole('button',{name:'更正这条记忆',exact:true}).click();
 const datedContent=`${marker} dated correction`;await contentField.fill(datedContent);await section.getByLabel('业务生效时间',{exact:true}).selectOption('replace');
 await section.getByLabel('开始时间（含）').fill('2024-01-01T08:00');await section.getByLabel('结束时间（不含）').fill('2023-01-01T08:00');const beforeInvalid=posts;await section.getByRole('button',{name:'保存更正',exact:true}).click();await expect(section.getByRole('alert')).toContainText('结束时间必须晚于');assert.equal(posts,beforeInvalid);
 await section.getByLabel('结束时间（不含）').fill('2027-02-01T08:00');const dated=(await save()).id;await ready();
 const datedRow=await row(dated);assert.equal(datedRow.corrects_id,concurrent);assert.equal(new Date(datedRow.valid_from).toISOString(),'2024-01-01T00:00:00.000Z');assert.equal(new Date(datedRow.valid_until).toISOString(),'2027-02-01T00:00:00.000Z');
 assert.equal(datedRow.source_receipt.businessTimeCorrection.explicit,true);assert.equal(datedRow.source_receipt.usage,'unverified-internal-only');
 await progress('business-time-passed');
 await view('当前有效');card=await findCard(knownContent);await card.getByRole('button',{name:'更正这条记忆',exact:true}).click();const knownNewContent=`${marker} known corrected`;await contentField.fill(knownNewContent);const beforeKnown=await clock(),knownNew=(await save()).id;await ready();const afterKnown=await clock();
 assert((await memoryAt(owner.id,afterKnown,beforeKnown)).some(r=>r.id===known));assert(!(await memoryAt(owner.id,afterKnown,beforeKnown)).some(r=>r.id===knownNew));
 assert((await memoryAt(owner.id,afterKnown,afterKnown)).some(r=>r.id===knownNew));assert(!(await memoryAt(owner.id,afterKnown,afterKnown)).some(r=>r.id===known));
 await progress('known-at-passed');
 await view('冲突待处理');await expect(section).toContainText(earlierContent);await expect(section).toContainText(laterContent);await section.getByRole('button',{name:'更正前一条',exact:true}).click();await contentField.fill(laterContent);const resolved=(await save()).id;await ready();assert.equal((await row(resolved)).corrects_id,earlier);assert.equal((await api('conflicts')).items.length,0);
 await view('历史时间轴');card=await findCard(datedContent);assert.equal((await post({action:'undo',id:dated},peerCookie)).status,404);assert.equal((await post({action:'undo',id:unknown})).status,409);
 await progress('ui-undo-start');const undoneResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/knowledge/observations'&&r.request().method()==='POST');await card.getByRole('button',{name:'撤销这条记忆',exact:true}).click();await progress('ui-undo-clicked');const undone=await undoneResponse;assert.equal(undone.status(),200);await progress('ui-undo-response-accepted');await ready();
 // The UI checks response.ok and refreshes; it does not consume a JSON body.
 // Observe its actual effect independently, then verify the route's idempotent
 // response body against that exact persisted invalidation.
 const invalidations=(await admin.query('select id,source_receipt from agent_memory_observation where owner_id=$1 and invalidates_id=$2',[owner.id,dated])).rows;assert.equal(invalidations.length,1);assert.equal(invalidations[0].source_receipt.type,'user-undo');const invalidation=invalidations[0].id;
 assert.equal((await row(invalidation)).invalidates_id,dated);await progress('ui-undo-written');const repeated=await post({action:'undo',id:dated});assert.equal(repeated.status,200);assert.equal((await repeated.json()).id,invalidation);await progress('repeated-undo-passed');
 assert(!(await api('current')).items.some((r:{id:string})=>r.id===dated));
 await view('学习通知');await expect(section.locator('article.opportunity-card')).toHaveCount(12);await expect(section.getByRole('button',{name:'更正这条记忆',exact:true})).toHaveCount(0);await expect(section.getByRole('button',{name:'下一页',exact:true})).toBeEnabled();
 await progress('notices-passed');
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));const screenshot=`tmp/ma24-memory-observations-ui-${randomUUID()}.png`;await page.screenshot({path:screenshot,fullPage:true});screenshots.push(screenshot);
 assert.deepEqual(errors,[]);const counts=(await admin.query(`select (select count(*)::int from agent_memory_observation where owner_id=$1) observations,
  (select count(*)::int from agent_memory_notice where owner_id=$1) notices,
  (select count(*)::int from agent_memory_graph_outbox o join agent_memory_observation m on m.id=o.observation_id where m.owner_id=$1) outbox`,[owner.id])).rows[0];
 assert.equal(counts.observations,counts.notices);assert.equal(counts.observations,counts.outbox);assert.equal((await api('timeline',peerCookie)).items.length,0);
 await context.close();const receipt={memoryObservationsFixedWeb:'passed',actualChromeAndHttpsAndCompiledWebAndDatabase:true,
  paginationAndAllFourViews:true,activeViewReloadVerified:true,cancelNoWrite:true,committedCorrectionReadbackFailureClearsOldActions:true,explicitRetryRecovers:true,
  concurrentCorrection409PreservesDraft:true,unknownValidityPreserved:true,explicitBusinessDatesAndDeviceTimezoneVerified:true,
  invalidDatesRejectedBeforeRequest:true,knownAtAndCurrentHistoryVerified:true,conflictCorrectionVerified:true,actualUiUndoAndIdempotentReplay:true,
  crossAccountReadCorrectionAndUndoRejected:true,noticesAndOutboxExactlyOnce:true,mobileNoHorizontalOverflow:true,noPageErrors:true,counts,screenshots,
  syntheticObservationsOnly:true,naturalExtractionVerified:false,graphWorkerExecuted:false,actualModelCalls:0,realQualityApproved:false,productionQualified:false};
 await writeFile('tmp/ma24-memory-observations-fixed-web-result.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));await progress('verified');
}catch(error){
 const detail=String(error instanceof Error?error.message:error).replaceAll(decodeURIComponent(adminUrl.password),'<temporary-password>').replaceAll(decodeURIComponent(appUrl.password),'<temporary-password>');
 await progress('failed',detail.slice(0,3000));console.error(detail);
 for(const context of browser?.contexts()??[])for(const page of context.pages())await page.screenshot({path:`tmp/ma24-memory-ui-failure-${databaseContainer.slice(0,12)}.png`,timeout:5000}).catch(()=>{});
 throw error;
}finally{
 clearTimeout(watchdog);const cleanupTimeout=setTimeout(()=>{console.error('Synthetic memory UI cleanup timed out');process.exit(1);},15000);cleanupTimeout.unref();
 try{await browser?.close();}finally{proxy.closeAllConnections();if(proxy.listening)await new Promise<void>(done=>proxy.close(()=>done()));await Promise.allSettled([admin.end(),getPool().end()]);clearTimeout(cleanupTimeout);}
}
