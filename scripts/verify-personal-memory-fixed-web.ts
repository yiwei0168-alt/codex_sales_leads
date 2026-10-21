import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:https';
import {request} from 'node:http';
import {writeFile} from 'node:fs/promises';
import {Client} from 'pg';
import {chromium,expect} from '@playwright/test';

assert.equal(process.env.MA24_DISPOSABLE_PERSONAL_MEMORY_UI,'1');
const database=process.env.MA24_PERSONAL_MEMORY_DATABASE_CONTAINER!;assert.match(database,/^[a-f0-9]{64}$/);
const docker=(args:string[])=>execFileSync('docker',args,{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
assert.match(docker(['inspect','--format','{{.Name}}',database]),/^\/ma24-pilot-fresh-[a-f0-9]{12}$/);
const upstream=new URL(process.env.MA24_PERSONAL_MEMORY_WEB_BASE!);assert.equal(upstream.hostname,'127.0.0.1');assert.equal(upstream.protocol,'http:');
const adminUrl=new URL(process.env.DATABASE_MIGRATION_URL!);assert.equal(adminUrl.hostname,'127.0.0.1');assert.equal(adminUrl.pathname,'/network_copilot_local');
const cookie=process.env.MA24_PERSONAL_MEMORY_OWNER_COOKIE!,peer=process.env.MA24_PERSONAL_MEMORY_PEER_COOKIE!;assert(cookie&&peer&&cookie!==peer);
const admin=new Client({connectionString:adminUrl.toString()});await admin.connect();
const proxy=createServer({key:docker(['exec',database,'cat','/tmp/ma24-server.key']),cert:docker(['exec',database,'cat','/tmp/ma24-server.crt'])},(incoming,outgoing)=>{
 const forward=request({hostname:upstream.hostname,port:upstream.port,path:incoming.url,method:incoming.method,headers:{...incoming.headers,'x-forwarded-proto':'https'}},response=>{outgoing.writeHead(response.statusCode??502,response.headers);response.pipe(outgoing);});
 forward.on('error',()=>{outgoing.writeHead(502);outgoing.end();});incoming.pipe(forward);
});
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
const stages:string[]=[],progress=async(stage:string)=>{stages.push(stage);await writeFile(`tmp/ma24-personal-memory-progress-${database.slice(0,12)}.json`,JSON.stringify({stage,stages})+'\n');};
const watchdog=setTimeout(()=>{console.error('Personal memory fixture watchdog expired');process.exit(1);},180000);watchdog.unref();
try{
 const owner=(await admin.query('select id,email from app_user where email=$1',[process.env.MA24_PERSONAL_MEMORY_OWNER_EMAIL])).rows[0];assert(owner);assert.match(owner.email,/^pilot-container-[a-f0-9]{12}-0@example\.invalid$/);
 const endpoint=upstream.origin+'/api/knowledge/memories';
 const api=async(method:string,body?:unknown,actor=cookie,path='')=>{
  const response=await fetch(endpoint+path,{method,headers:{cookie:actor,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const text=await response.text();return {status:response.status,body:JSON.parse(text)};
 };
 const list=async()=>{const r=await api('GET');assert.equal(r.status,200);return r.body.items as Array<Record<string,unknown>>;};
 const row=async(id:string)=>(await admin.query('select *,updated_at::text version from user_outreach_memory where user_id=$1 and id=$2',[owner.id,id])).rows[0];
 const auditCount=async()=>(await admin.query('select count(*)::int n from user_memory_audit where user_id=$1',[owner.id])).rows[0].n as number;
 assert.deepEqual(await list(),[]);assert.equal((await api('GET',undefined,peer)).body.items.length,0);assert.equal((await api('GET',undefined,'')).status,401);
 await new Promise<void>(done=>proxy.listen(0,'127.0.0.1',done));const address=proxy.address();assert(address&&typeof address!=='string');const base=`https://127.0.0.1:${address.port}`;
 browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1366,height:900}});
 const separator=cookie.indexOf('=');await context.addCookies([{name:cookie.slice(0,separator),value:cookie.slice(separator+1),url:base,httpOnly:true,secure:true,sameSite:'Lax'}]);
 let failRead=false,failHistory=false;const mutations:Array<{method:string;body:Record<string,unknown>}>=[],errors:string[]=[],auditScreenshots:string[]=[];
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
  if(route.request().method()==='GET'&&url.pathname==='/api/knowledge/memories'&&failRead){failRead=false;return route.fulfill({status:503,json:{error:'Synthetic readback failure'}});}
  if(route.request().method()==='GET'&&url.pathname==='/api/knowledge/memories/history'&&failHistory){failHistory=false;return route.fulfill({status:503,json:{error:'Synthetic audit read failure'}});}
  return route.continue();
 });
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
 page.on('request',r=>{if(new URL(r.url()).pathname==='/api/knowledge/memories'&&['POST','PATCH'].includes(r.method()))mutations.push({method:r.method(),body:r.postDataJSON()});});
 assert.equal((await page.goto(base+'/knowledge'))?.status(),200);await page.getByRole('button',{name:'个人记忆',exact:true}).click();await page.getByRole('button',{name:'原有记忆',exact:true}).click();
 const section=page.locator('section.panel').filter({has:page.getByRole('heading',{name:'个人长期记忆',exact:true})});
 const ready=async()=>{await expect(section.getByText('正在读取…',{exact:true})).toHaveCount(0);};
 const refresh=async()=>{await section.getByRole('button',{name:'刷新记忆',exact:true}).click();await ready();};
 const form=section.locator('form'),confirm=form.getByLabel('确认内容及适用范围并保存到个人记忆',{exact:true}),save=form.getByRole('button',{name:'保存',exact:true});
 const marker='Synthetic private memory '+randomUUID(),original=marker+' original body',edited=marker+' edited body';
 const fill=async(title:string,content:string)=>{await form.getByLabel('标题',{exact:true}).fill(title);await form.locator('textarea').fill(content);};
 const submit=async(status=200)=>{await confirm.check();const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/knowledge/memories'&&r.request().method()==='POST');await save.click();assert.equal((await response).status(),status);};
 await progress('initial-ready');await ready();await section.getByRole('button',{name:'新增个人记忆',exact:true}).click();await fill(marker,original);await confirm.check();await form.getByLabel('标题',{exact:true}).fill(marker+' canceled');await expect(confirm).not.toBeChecked();await expect(save).toBeDisabled();
 await form.getByRole('button',{name:'取消',exact:true}).click();assert.equal(mutations.length,0);assert.deepEqual(await list(),[]);
 await section.getByRole('button',{name:'新增个人记忆',exact:true}).click();await fill(marker,original);await form.getByLabel('国家代码',{exact:false}).fill('gb, MX, gb');await form.getByLabel('渠道角色',{exact:false}).fill('Distributor, SI');await submit();await expect(form).toHaveCount(0);await ready();
 const id=String(mutations.at(-1)!.body.id);assert.match(id,/^[a-f0-9-]{36}$/);let stored=await row(id);assert.equal(stored.content,original);assert.equal(stored.embedding,null);assert.equal(stored.usage_scope,'internal-learning');assert.deepEqual(stored.market_codes,['GB','MX']);assert.deepEqual(stored.channel_roles,['Distributor','SI']);
 assert.equal((await api('PATCH',{id,operation:'delete',confirmed:true,expectedUpdatedAt:stored.version},peer)).status,404);assert.equal((await api('POST',{...mutations.at(-1)!.body,userId:owner.id})).status,400);
 const card=section.locator('article.opportunity-card').filter({has:page.getByRole('heading',{name:marker,exact:true})});
 await progress('opening-edit');await card.getByRole('button',{name:'编辑内容与范围',exact:true}).click();await fill(marker,edited);await expect(section.getByRole('button',{name:'新增个人记忆',exact:true})).toBeDisabled();await expect(section.getByRole('button',{name:'刷新记忆',exact:true})).toBeDisabled();
 const concurrent={id,mode:'edit',expectedUpdatedAt:stored.version,kind:'email-style',title:marker,content:marker+' concurrent',marketCodes:['GB','MX'],channelRoles:['Distributor','SI'],externalUseApproved:false,confirmed:true};
 assert.equal((await api('POST',concurrent)).status,200);const beforeConflict=await auditCount();await submit(409);await expect(form.locator('textarea')).toHaveValue(edited);assert.equal(await auditCount(),beforeConflict);assert.equal((await row(id)).content,concurrent.content);
 await form.getByRole('button',{name:'取消',exact:true}).click();await refresh();await card.getByRole('button',{name:'编辑内容与范围',exact:true}).click();await fill(marker,edited);failRead=true;await submit();await expect(form).toHaveCount(0);await expect(section.getByRole('alert')).toContainText('读取失败');await expect(section.getByRole('status')).toContainText('已保存');await expect(section.locator('article.opportunity-card')).toHaveCount(0);assert.equal((await row(id)).content,edited);await refresh();
 await progress('create-edit-draft-readback-passed');
 const sameLengthContent=edited.replace('edited body','EDITED body');assert.notEqual(sameLengthContent,edited);assert.equal(sameLengthContent.length,edited.length);
 assert.equal((await api('POST',{...concurrent,expectedUpdatedAt:(await row(id)).version,content:sameLengthContent})).status,200);await refresh();
 // A real API update races a previously displayed lifecycle confirmation.
 await card.getByRole('button',{name:'停用',exact:true}).click();const beforeCancel=mutations.length;await section.getByRole('button',{name:'取消',exact:true}).click();assert.equal(mutations.length,beforeCancel);
 await card.getByRole('button',{name:'停用',exact:true}).click();stored=await row(id);assert.equal((await api('POST',{...concurrent,expectedUpdatedAt:stored.version,content:edited,title:marker})).status,200);
 const staleAudit=await auditCount(),patchResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/knowledge/memories'&&r.request().method()==='PATCH');await section.getByRole('button',{name:'确认操作',exact:true}).click();assert.equal((await patchResponse).status(),409);await expect(section.getByRole('alert')).toContainText('已变化');await expect(card).toHaveCount(0);assert.equal(await auditCount(),staleAudit);assert.equal((await row(id)).status,'active');assert.equal(mutations.at(-1)!.body.expectedUpdatedAt,stored.version);
 await refresh();
 const lifecycle=async(name:string,expectedStatus:string)=>{
  const prior=await row(id);await card.getByRole('button',{name,exact:true}).click();const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/knowledge/memories'&&r.request().method()==='PATCH');await section.getByRole('button',{name:'确认操作',exact:true}).click();assert.equal((await response).status(),200);await ready();assert.equal(mutations.at(-1)!.body.expectedUpdatedAt,prior.version);assert.equal((await row(id))?.status??'deleted',expectedStatus);
 };
 await lifecycle('停用','archived');await expect(card).toContainText('停用');await lifecycle('启用','active');await lifecycle('删除记忆','deleted');await expect(card).toHaveCount(0);
 const history=await api('GET',undefined,cookie,'/history');assert.equal(history.status,200);const entries=history.body.items.filter((entry:{memoryId:string})=>entry.memoryId===id);assert(entries.some((e:{operation:string})=>e.operation==='INSERT'));assert(entries.some((e:{operation:string})=>e.operation==='UPDATE'));assert(entries.some((e:{operation:string})=>e.operation==='DELETE'));for(const body of [original,edited,concurrent.content,sameLengthContent])assert(!JSON.stringify(entries).includes(body));assert.equal((await api('GET',undefined,peer,'/history')).body.items.length,0);
 await section.getByText('记忆变更审计',{exact:true}).click();await ready();await expect(section.getByText('删除 · 记忆 '+id.slice(0,8),{exact:false})).toBeVisible();failHistory=true;await section.getByRole('button',{name:'刷新历史',exact:true}).click();await expect(section.getByRole('alert')).toContainText('历史记录读取失败');await expect(section.getByText('删除 · 记忆 '+id.slice(0,8),{exact:false})).toHaveCount(0);await section.getByRole('button',{name:'刷新历史',exact:true}).click();await ready();await expect(section.getByText('删除 · 记忆 '+id.slice(0,8),{exact:false})).toBeVisible();
 type AuditEntry={id:string;operation:string;changedFields:string[];beforeState:Record<string,unknown>|null;afterState:Record<string,unknown>|null};
 const inserted=entries.find((entry:AuditEntry)=>entry.operation==='INSERT') as AuditEntry,deleted=entries.find((entry:AuditEntry)=>entry.operation==='DELETE') as AuditEntry;
 const sameLength=entries.find((entry:AuditEntry)=>entry.operation==='UPDATE'&&entry.changedFields.includes('content')&&Number.isInteger(entry.beforeState?.contentCharacters)&&entry.beforeState?.contentCharacters===entry.afterState?.contentCharacters) as AuditEntry;assert(sameLength);
 const audit=(entryId:string)=>section.locator(`[data-memory-audit-id="${entryId}"]`),cells=(entryId:string,label:string)=>audit(entryId).getByRole('row').filter({has:page.getByRole('rowheader',{name:label,exact:true})}).getByRole('cell').allTextContents();
 assert.deepEqual(await cells(inserted.id,'状态'),['新增前无记录','启用']);assert.deepEqual(await cells(deleted.id,'状态'),['启用','删除后无记录']);assert.deepEqual(await cells(sameLength.id,'正文字符数'),[`${sameLength.beforeState!.contentCharacters} 字符`,`${sameLength.afterState!.contentCharacters} 字符`]);await expect(audit(sameLength.id)).toContainText('正文已修改');
 const raw=audit(sameLength.id).locator('details.raw-json-details');assert.equal(await raw.getAttribute('open'),null);await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:base});await raw.getByText('状态与范围快照',{exact:true}).click();await raw.getByRole('button',{name:'复制 JSON',exact:true}).click();await expect(raw.getByRole('status')).toHaveText('已复制原始 JSON');assert.deepEqual(JSON.parse(await page.evaluate(()=>navigator.clipboard.readText())),{before:sameLength.beforeState,after:sameLength.afterState});await raw.getByText('状态与范围快照',{exact:true}).click();
 for(const width of [1366,390]){await page.setViewportSize({width,height:900});await audit(sameLength.id).scrollIntoViewIfNeeded();assert(await audit(sameLength.id).getByRole('table').evaluate(element=>element.scrollWidth<=element.clientWidth+1));const shot=`tmp/ma24-memory-audit-body-${width}-${randomUUID()}.png`;await page.screenshot({path:shot,fullPage:true});auditScreenshots.push(shot);}await page.setViewportSize({width:1366,height:900});
 await progress('lifecycle-conflict-audit-passed');
 await section.getByRole('button',{name:'新增个人记忆',exact:true}).click();await form.getByRole('combobox').selectOption('user-approved-marketing-claim');await fill(marker+' claim',marker+' generated unverified claim');await form.getByLabel('允许在对外邮件使用此信息',{exact:false}).check();await submit();await ready();const claimId=String(mutations.at(-1)!.body.id);assert.equal((await row(claimId)).usage_scope,'external-use-approved');assert.equal((await row(claimId)).context.objectiveFact,false);assert.equal((await row(claimId)).context.scoringEvidence,false);
 const claim=await row(claimId);assert.equal((await api('POST',{id:claimId,mode:'edit',expectedUpdatedAt:claim.version,kind:'user-approved-marketing-claim',title:claim.title,content:claim.content,marketCodes:claim.market_codes,channelRoles:claim.channel_roles,externalUseApproved:false,confirmed:true})).status,200);
 const scopedHistory=await api('GET',undefined,cookie,'/history'),scopeEntry=scopedHistory.body.items.find((entry:AuditEntry&{memoryId:string})=>entry.memoryId===claimId&&entry.changedFields.includes('usage_scope')) as AuditEntry;assert(scopeEntry);assert(!JSON.stringify(scopedHistory.body.items).includes(claim.content));await section.getByRole('button',{name:'刷新历史',exact:true}).click();await expect(audit(scopeEntry.id)).toBeVisible();assert.deepEqual(await cells(scopeEntry.id,'使用范围'),['已授权对外使用','内部学习']);
 for(const width of [1366,390]){await page.setViewportSize({width,height:900});await audit(scopeEntry.id).scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));const shot=`tmp/ma24-memory-audit-scope-${width}-${randomUUID()}.png`;await page.screenshot({path:shot,fullPage:true});auditScreenshots.push(shot);}await page.setViewportSize({width:1366,height:900});
 await progress('external-scope-passed');
 // Exercise actual API pagination with generated records, never real business data.
 for(let i=0;i<12;i++){assert.equal((await api('POST',{...concurrent,id:randomUUID(),mode:'create',expectedUpdatedAt:undefined,title:marker+' page '+i,content:marker+' generated page '+i})).status,200);}
 await refresh();assert.equal(await section.locator('article.opportunity-card').count(),12);await expect(section.getByRole('button',{name:'下一页',exact:true}).last()).toBeEnabled();await section.getByRole('button',{name:'下一页',exact:true}).last().click();await ready();assert.equal(await section.locator('article.opportunity-card').count(),1);await section.getByRole('button',{name:'上一页',exact:true}).last().click();await ready();assert.equal(await section.locator('article.opportunity-card').count(),12);
 await section.getByText('记忆变更审计',{exact:true}).click();await page.setViewportSize({width:390,height:844});await section.getByRole('heading',{name:'个人长期记忆',exact:true}).scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert(await section.evaluate(element=>element.scrollWidth<=element.clientWidth+1));const screenshot=`tmp/ma24-personal-memory-mobile-${randomUUID()}.png`;await page.screenshot({path:screenshot,fullPage:true});assert.deepEqual(errors,[]);
 const result={personalMemoryFixedWeb:'passed',actualChromeHttpsCompiledWeb:true,generatedAccountsOnly:true,createEditCancelAndScope:true,confirmationResetsOnChange:true,concurrentEditPreservesDraft:true,staleLifecycle409WithoutWriteOrAudit:true,observedVersionSent:true,archiveActivateDelete:true,postCommitReadFailureClearsActionsAndRetryRecovers:true,bodyFreeOwnerScopedAuditRetainedAfterDelete:true,auditFailureClearsOldRecords:true,readableAuditInsertDeleteAndExternalScope:true,sameLengthActualBodyEditExplained:true,rawAuditSnapshotCollapsedAndCopiedExactly:true,auditScreenshots,pagination:true,noHorizontalOverflow:true,screenshot,actualModelCalls:0,realBusinessQualityAccepted:false,productionQualified:false};
 await writeFile('tmp/ma24-personal-memory-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));await progress('passed');
}finally{
 clearTimeout(watchdog);const timeout=setTimeout(()=>process.exit(1),15000);timeout.unref();try{await browser?.close();}finally{proxy.closeAllConnections();if(proxy.listening)await new Promise<void>(done=>proxy.close(()=>done()));await admin.end();clearTimeout(timeout);}
}
