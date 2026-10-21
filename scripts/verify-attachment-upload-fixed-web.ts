import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:https';
import {request} from 'node:http';
import {writeFile} from 'node:fs/promises';
import {Client} from 'pg';
import {chromium,expect} from '@playwright/test';
import {FormData as FixtureFormData,fetch as fixtureFetch} from 'undici';

assert.equal(process.env.MA24_DISPOSABLE_ATTACHMENT_UI,'1');
const database=process.env.MA24_ATTACHMENT_DATABASE_CONTAINER!;assert.match(database,/^[a-f0-9]{64}$/);
const docker=(args:string[])=>execFileSync('docker',args,{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
assert.match(docker(['inspect','--format','{{.Name}}',database]),/^\/ma24-pilot-fresh-[a-f0-9]{12}$/);
const upstream=new URL(process.env.MA24_ATTACHMENT_WEB_BASE!);assert.equal(upstream.hostname,'127.0.0.1');assert.equal(upstream.protocol,'http:');
const adminUrl=new URL(process.env.DATABASE_MIGRATION_URL!);assert.equal(adminUrl.hostname,'127.0.0.1');assert.equal(adminUrl.pathname,'/network_copilot_local');
const cookie=process.env.MA24_ATTACHMENT_OWNER_COOKIE!,peer=process.env.MA24_ATTACHMENT_PEER_COOKIE!;assert(cookie&&peer&&cookie!==peer);
const admin=new Client({connectionString:adminUrl.toString()});await admin.connect();
const proxy=createServer({key:docker(['exec',database,'cat','/tmp/ma24-server.key']),cert:docker(['exec',database,'cat','/tmp/ma24-server.crt'])},(incoming,outgoing)=>{
 const forward=request({hostname:upstream.hostname,port:upstream.port,path:incoming.url,method:incoming.method,headers:{...incoming.headers,'x-forwarded-proto':'https'}},response=>{outgoing.writeHead(response.statusCode??502,response.headers);response.pipe(outgoing);});
 forward.on('error',()=>{outgoing.writeHead(502);outgoing.end();});incoming.pipe(forward);
});
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
const results:unknown[]=[],screenshots:string[]=[];
const watchdog=setTimeout(()=>{console.error('Attachment upload fixture watchdog expired');process.exit(1);},180000);watchdog.unref();
try{
 const owner=(await admin.query('select id,email from app_user where email=$1',[process.env.MA24_ATTACHMENT_OWNER_EMAIL])).rows[0];assert(owner);assert.match(owner.email,/^pilot-container-[a-f0-9]{12}-0@example\.invalid$/);
 const list=async(actor=cookie)=>{const r=await fetch(upstream.origin+'/api/knowledge/uploads',{headers:{cookie:actor},signal:AbortSignal.timeout(15000)});return {status:r.status,body:await r.json()};};
 const queued=async()=>(await admin.query('select count(*)::int n from agent_run where user_id=$1',[owner.id])).rows[0].n;
 const apiUpload=async(name:string,bytes:Buffer)=>{const form=new FixtureFormData();form.set('collection','company');form.set('title',name);form.set('visibility','private');form.set('file',new Blob([new Uint8Array(bytes)],{type:'application/pdf'}),name);const r=await fixtureFetch(upstream.origin+'/api/knowledge/uploads',{method:'POST',headers:{cookie},body:form,signal:AbortSignal.timeout(15000)});const receipt=await r.json() as {id?:string;error?:string};assert.equal(r.status,202,JSON.stringify({phase:'paging-upload',error:receipt.error??null}));assert(receipt.id);return receipt.id;};
 assert.equal((await list('')).status,401);assert.deepEqual((await list(peer)).body.jobs,[]);
 await new Promise<void>(done=>proxy.listen(0,'127.0.0.1',done));const address=proxy.address();assert(address&&typeof address!=='string');const base=`https://127.0.0.1:${address.port}`;
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const width of [1366,390]){
  const name=`MA24 generated attachment ${width}.pdf`,bytes=Buffer.from(`%PDF-1.4\nSynthetic upload receipt only ${width}\n%%EOF`),file={name,mimeType:'application/pdf',buffer:bytes};
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:900}});const separator=cookie.indexOf('=');await context.addCookies([{name:cookie.slice(0,separator),value:cookie.slice(separator+1),url:base,httpOnly:true,secure:true,sameSite:'Lax'}]);const page=await context.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  let hold=true,drop=false,failRead=false,posts=0,firstJob='',release:(()=>void)|undefined;
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
   if(url.pathname==='/api/knowledge/uploads'){
    if(route.request().method()==='GET'&&failRead)return route.fulfill({status:503,json:{error:'Synthetic status read failure'}});
    if(route.request().method()==='POST'){
     posts++;const response=await route.fetch();assert([200,202].includes(response.status()));const receipt=await response.json() as {id:string;reused:boolean};if(!firstJob)firstJob=receipt.id;
     if(hold)await new Promise<void>(done=>{release=done;});
     if(drop){await response.dispose();return route.abort('connectionreset');}
     return route.fulfill({response});
    }
   }
   return route.continue();
  });
  try{
   await page.goto(base);await page.locator('.ai-composer').getByRole('button',{name:/^资料/}).click();let dialog=page.getByRole('dialog',{name:'本次任务资料'}),progress=dialog.getByRole('region',{name:'我的上传处理进度'});await expect(progress.getByRole('button',{name:'刷新上传进度'})).toBeEnabled();
   await dialog.getByLabel('上传私有原件').setInputFiles(file);await expect.poll(()=>Boolean(release)).toBe(true);assert(firstJob);assert.equal((await admin.query('select status,visibility from knowledge_upload_job where id=$1 and user_id=$2',[firstJob,owner.id])).rows[0].status,'pending');
   await page.keyboard.press('Escape');await page.locator('.ai-composer').getByRole('button',{name:/^资料/}).click();dialog=page.getByRole('dialog',{name:'本次任务资料'});progress=dialog.getByRole('region',{name:'我的上传处理进度'});await expect(dialog.getByLabel('上传私有原件')).toBeDisabled();await dialog.getByRole('button',{name:'刷新已处理资料'}).click();await expect(dialog.getByRole('button',{name:'刷新已处理资料'})).toBeEnabled();await expect(dialog.getByLabel('上传私有原件')).toBeDisabled();assert.equal(posts,1);hold=false;release!();release=undefined;await expect(dialog.getByLabel('上传私有原件')).toBeEnabled();await expect(progress).toContainText(name);await expect(progress).toContainText('待提取');await expect(dialog.locator('.ai-attachment-list input')).toHaveCount(0);
   await dialog.getByLabel('上传私有原件').setInputFiles(file);await expect(dialog.getByText(/沿用原处理进度/)).toBeVisible();assert.equal(posts,2);assert.equal((await admin.query('select count(*)::int n from knowledge_upload_job where user_id=$1 and title=$2',[owner.id,name])).rows[0].n,1);
   failRead=true;await progress.getByRole('button',{name:'刷新上传进度'}).click();await expect(progress.getByRole('alert')).toContainText('读取失败');await expect(progress.locator('article')).toHaveCount(0);failRead=false;await progress.getByRole('button',{name:'刷新上传进度'}).click();await expect(progress).toContainText(name);
   await admin.query("update knowledge_upload_job set status='failed',error_code='synthetic-no-extraction-executed' where id=$1 and user_id=$2",[firstJob,owner.id]);await progress.getByRole('button',{name:'刷新上传进度'}).click();await expect(progress.locator('article').filter({hasText:name})).toContainText('处理失败');
   const unknown=`MA24 generated unknown ${width}.pdf`;drop=true;await dialog.getByLabel('上传私有原件').setInputFiles({name:unknown,mimeType:'application/pdf',buffer:Buffer.from(`%PDF-1.4\nSynthetic unknown receipt ${width}\n%%EOF`)});await expect(dialog.getByRole('alert').filter({hasText:'原件可能已保存'})).toBeVisible();await expect(progress).toContainText(unknown);assert.equal(posts,3);assert.equal((await admin.query('select count(*)::int n from knowledge_upload_job where user_id=$1 and title=$2',[owner.id,unknown])).rows[0].n,1);
   for(let index=0;index<6;index++)await apiUpload(`MA24 generated paging ${width}-${index}.pdf`,Buffer.from(`%PDF-1.4\nSynthetic page ${width}-${index}\n%%EOF`));await progress.getByRole('button',{name:'刷新上传进度'}).click();await expect(progress.locator('article')).toHaveCount(6);await expect(progress.getByRole('button',{name:'下一页上传'})).toBeEnabled();await progress.getByRole('button',{name:'下一页上传'}).click();await expect(progress.getByText('第 2 页',{exact:true})).toBeVisible();await expect(progress.locator('article').first()).toBeVisible();assert.equal(posts,3);await expect(dialog.locator('.ai-attachment-list input')).toHaveCount(0);
   const blocked=await fetch(upstream.origin+'/api/assistant/messages',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({content:'Synthetic pending-upload guard',requestKey:randomUUID(),attachments:[{assetId:firstJob}]}),signal:AbortSignal.timeout(15000)});assert.equal(blocked.status,409);assert.equal(await queued(),0);assert.deepEqual((await list(peer)).body.jobs,[]);
   const shot=`tmp/ma24-attachment-progress-${width}-${randomUUID()}.png`;await progress.scrollIntoViewIfNeeded();await page.screenshot({path:shot,fullPage:true});screenshots.push(shot);assert(await progress.evaluate(element=>element.scrollWidth<=element.clientWidth+1));assert.deepEqual(errors,[]);
   results.push({width,posts,actualPrivateUploadPending:true,backgroundReceiptCannotBeUnlockedByReopenOrRead:true,sameBytesOneJob:true,ownerPeerAnonymousIsolation:true,failedReadClearsOldProgress:true,syntheticFailureStatusDisplayed:true,committedDroppedUploadAckNoAutomaticRetry:true,sixItemStatusPagination:true,unprocessedJobCannotBeSelectedOrSubmitted:true,modelTasksQueued:0});
  }finally{release?.();await context.close();}
 }
 const result={attachmentUploadFixedWeb:'passed',actualChromeHttpsCompiledWeb:true,generatedAccountsOnly:true,results,screenshots,actualExtractionWorkers:0,actualModelCalls:0,realDocumentQualityAccepted:false,productionQualified:false};await writeFile('tmp/ma24-attachment-upload-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{clearTimeout(watchdog);const timeout=setTimeout(()=>process.exit(1),15000);timeout.unref();try{await browser?.close();}finally{proxy.closeAllConnections();if(proxy.listening)await new Promise<void>(done=>proxy.close(()=>done()));await admin.end();clearTimeout(timeout);}}
