import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:https';
import {request} from 'node:http';
import {writeFile} from 'node:fs/promises';
import {Client} from 'pg';
import {chromium,expect} from '@playwright/test';

assert.equal(process.env.MA24_DISPOSABLE_CONVERSATION_UI,'1');
const database=process.env.MA24_CONVERSATION_DATABASE_CONTAINER!;assert.match(database,/^[a-f0-9]{64}$/);
const docker=(args:string[])=>execFileSync('docker',args,{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
assert.match(docker(['inspect','--format','{{.Name}}',database]),/^\/ma24-pilot-fresh-[a-f0-9]{12}$/);
const upstream=new URL(process.env.MA24_CONVERSATION_WEB_BASE!);assert.equal(upstream.hostname,'127.0.0.1');assert.equal(upstream.protocol,'http:');
const adminUrl=new URL(process.env.DATABASE_MIGRATION_URL!);assert.equal(adminUrl.hostname,'127.0.0.1');assert.equal(adminUrl.pathname,'/network_copilot_local');
const cookie=process.env.MA24_CONVERSATION_OWNER_COOKIE!,peer=process.env.MA24_CONVERSATION_PEER_COOKIE!;assert(cookie&&peer&&cookie!==peer);
const admin=new Client({connectionString:adminUrl.toString()});await admin.connect();
const proxy=createServer({key:docker(['exec',database,'cat','/tmp/ma24-server.key']),cert:docker(['exec',database,'cat','/tmp/ma24-server.crt'])},(incoming,outgoing)=>{
 const forward=request({hostname:upstream.hostname,port:upstream.port,path:incoming.url,method:incoming.method,headers:{...incoming.headers,'x-forwarded-proto':'https'}},response=>{outgoing.writeHead(response.statusCode??502,response.headers);response.pipe(outgoing);});
 forward.on('error',()=>{outgoing.writeHead(502);outgoing.end();});incoming.pipe(forward);
});
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
const results:unknown[]=[],screenshots:string[]=[];
const watchdog=setTimeout(()=>{console.error('Conversation fixture watchdog expired');process.exit(1);},180000);watchdog.unref();
try{
 const owner=(await admin.query('select id,email from app_user where email=$1',[process.env.MA24_CONVERSATION_OWNER_EMAIL])).rows[0];assert(owner);assert.match(owner.email,/^pilot-container-[a-f0-9]{12}-0@example\.invalid$/);
 const api=async(path:string,method='GET',body?:unknown,actor=cookie)=>{const r=await fetch(upstream.origin+path,{method,headers:{cookie:actor,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});return {status:r.status,body:await r.json()};};
 await new Promise<void>(done=>proxy.listen(0,'127.0.0.1',done));const address=proxy.address();assert(address&&typeof address!=='string');const base=`https://127.0.0.1:${address.port}`;
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const width of [1366,390]){
  const initial=`MA24 generated conversation ${width}`,created=await api('/api/assistant/conversations','POST',{title:initial});assert.equal(created.status,201);const id=created.body.id as string;assert.match(id,/^[a-f0-9-]{36}$/);
  const path=`/api/assistant/conversations/${id}`,row=async()=>(await admin.query('select title,status from assistant_conversation where id=$1 and user_id=$2',[id,owner.id])).rows[0];
  assert.equal((await api(path,'GET',undefined,peer)).status,404);assert.equal((await api(path,'PATCH',{title:'Peer attempt'},peer)).status,404);assert.equal((await api(path,'PATCH',{title:'Anonymous attempt'},'')).status,401);assert.equal((await row()).title,initial);
  const runId=randomUUID();await admin.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,status,input,model_config) values($1,$2,$3,$4,$5,'paused','{}','{}')`,[runId,owner.id,id,randomUUID(),randomUUID()]);
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:900}});const separator=cookie.indexOf('=');await context.addCookies([{name:cookie.slice(0,separator),value:cookie.slice(separator+1),url:base,httpOnly:true,secure:true,sameSite:'Lax'}]);
  const page=await context.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));let dropAck=false,failRead=false,patches=0;
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
   if(url.pathname===path&&route.request().method()==='PATCH'){
    patches++;if(dropAck){const response=await route.fetch();assert.equal(response.status(),200);await response.dispose();return route.abort('connectionreset');}
   }
   if(url.pathname===path&&route.request().method()==='GET'&&failRead)return route.fulfill({status:503,json:{error:'Synthetic current-title read failure'}});
   return route.continue();
  });
  try{
   await page.goto(`${base}/c/${id}`);await expect(page.locator('.conversation-history-item.active')).toBeAttached({timeout:20000});
   if(width<700)await page.getByRole('button',{name:'打开导航菜单',exact:true}).click();
   const history=page.getByRole('region',{name:'对话历史'});
   const openRename=async(title:string)=>{await history.getByRole('button',{name:`${title} 更多操作`,exact:true}).click();await page.getByRole('menuitem',{name:'重命名',exact:true}).click();return page.getByRole('dialog',{name:'重命名对话'});};
   let dialog=await openRename(initial);await expect(dialog.getByLabel('对话名称')).toBeFocused();await dialog.getByRole('button',{name:'取消'}).click();assert.equal(patches,0);
   dialog=await openRename(initial);const renamed=`Generated saved ${width}`;await dialog.getByLabel('对话名称').fill(renamed);await dialog.getByRole('button',{name:'保存名称',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(history.getByRole('button',{name:`${renamed} 更多操作`,exact:true})).toBeVisible();assert.equal((await row()).title,renamed);assert.equal(patches,1);
   dialog=await openRename(renamed);const recovered=`Generated recovered ${width}`;await dialog.getByLabel('对话名称').fill(recovered);dropAck=true;await dialog.getByRole('button',{name:'保存名称',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('可能已经保存');assert.equal((await row()).title,recovered);assert.equal(patches,2);await expect(dialog.getByRole('button',{name:'保存名称',exact:true})).toBeDisabled();await expect(dialog.getByLabel('对话名称')).toHaveValue(recovered);
   const pending=`tmp/ma24-conversation-unknown-${width}-${randomUUID()}.png`;await page.screenshot({path:pending,fullPage:true});screenshots.push(pending);
   failRead=true;await dialog.getByRole('button',{name:'核对保存结果',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('无法读取');failRead=false;await dialog.getByRole('button',{name:'核对保存结果',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(history.getByRole('status')).toContainText('已核对当前名称与提交一致');assert.equal(patches,2);assert.equal((await row()).title,recovered);
   dialog=await openRename(recovered);const desired=`Generated explicit overwrite ${width}`;await dialog.getByLabel('对话名称').fill(desired);await dialog.getByRole('button',{name:'保存名称',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('可能已经保存');await admin.query('update assistant_conversation set title=$1 where id=$2 and user_id=$3',['Generated concurrent title',id,owner.id]);await dialog.getByRole('button',{name:'核对保存结果',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Generated concurrent title');assert.equal(patches,3);assert.equal((await row()).title,'Generated concurrent title');dropAck=false;await dialog.getByRole('button',{name:'仍要保存此名称',exact:true}).click();await expect(dialog).toHaveCount(0);assert.equal(patches,4);assert.equal((await row()).title,desired);
   await history.getByRole('button',{name:`${desired} 更多操作`,exact:true}).click();await page.getByRole('menuitem',{name:'删除对话',exact:true}).click();const deletion=page.getByRole('dialog',{name:'删除对话'});await deletion.getByRole('button',{name:'删除对话',exact:true}).click();await expect(deletion.getByRole('alert')).toContainText('未结束的任务或操作');assert.equal((await row()).status,'active');await admin.query("update agent_run set status='completed' where id=$1",[runId]);
   await page.evaluate(()=>{Storage.prototype.removeItem=()=>{throw Error('Synthetic storage failure after confirmed deletion');};});await deletion.getByRole('button',{name:'删除对话',exact:true}).click();await expect(deletion).toHaveCount(0);await expect(page).toHaveURL(base+'/');assert.equal((await row()).status,'deleted');assert.equal((await admin.query('select status from agent_run where id=$1',[runId])).rows[0].status,'completed');assert.deepEqual(errors,[]);
   results.push({width,patches,ownerPeerAnonymousIsolation:true,cancelWithoutWrite:true,confirmedRename:true,committedDroppedAckReadOnlyReconciliation:true,failedReadPreservesDraft:true,concurrentTitleExplicitOverwrite:true,pausedRunBlocksDelete:true,confirmedActiveDeleteSurvivesStorageFailure:true,taskHistoryRetained:true});
  }finally{await context.close();}
 }
 const result={conversationManagementFixedWeb:'passed',actualChromeHttpsCompiledWeb:true,generatedAccountsOnly:true,results,screenshots,actualModelCalls:0,realBusinessQualityAccepted:false,productionQualified:false};await writeFile('tmp/ma24-conversation-management-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{clearTimeout(watchdog);const timeout=setTimeout(()=>process.exit(1),15000);timeout.unref();try{await browser?.close();}finally{proxy.closeAllConnections();if(proxy.listening)await new Promise<void>(done=>proxy.close(()=>done()));await admin.end();clearTimeout(timeout);}}
