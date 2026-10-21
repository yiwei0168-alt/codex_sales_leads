import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Client} from 'pg';
import {expect,type Page} from '@playwright/test';
import {enqueueRun} from '../../src/lib/assistant/main/repository';

/** Generated paused tasks only; no Worker, provider or mail executor. */
export async function verifyInstructionSubmissionFixedWeb(input:{admin:Client;owner:string;cookie:string;peer:string;base:string;upstream:string;page:Page}){
 const {admin,owner,page}=input;assert.equal((await admin.query('select current_database() name')).rows[0].name,'network_copilot_local');assert.match((await admin.query('select email from app_user where id=$1',[owner])).rows[0].email,/^pilot-container-[a-f0-9]{12}-0@example\.invalid$/);
 const create=async()=>{const task=await enqueueRun(owner,{content:'Synthetic instruction receipt '+randomUUID(),attachments:[],requestKey:randomUUID()},{model:'synthetic-unusable',providers:['synthetic-unusable'],version:'synthetic'});await admin.query("update agent_run set status='paused' where id=$1 and user_id=$2",[task.id,owner]);return task;};
 const task=await create(),path=`/api/assistant/runs/${task.id}/control`,url=input.base+path;
 const api=async(run:string,method:string,body?:unknown,actor=input.cookie,key?:string)=>{
  const response=await fetch(`${input.upstream}/api/assistant/runs/${run}/control${key?'?requestKey='+key:''}`,{method,headers:{cookie:actor,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});const text=await response.text();return {status:response.status,json:JSON.parse(text),cache:response.headers.get('cache-control')};
 };
 const snapshot=async(run=task.id)=>(await admin.query('select to_jsonb(r) value from agent_run r where id=$1 and user_id=$2',[run,owner])).rows[0].value;
 const events=async(run=task.id)=>(await admin.query("select count(*)::int n from agent_run_event where run_id=$1 and kind='control' and payload->>'action'='instruct'",[run])).rows[0].n;
 let mode:'normal'|'drop-after-commit'|'drop-before-send'='drop-after-commit';const posts:Array<{content:string;requestKey:string;action:string}>=[];
 await page.route(url,async route=>{
  if(route.request().method()!=='POST')return route.continue();const body=route.request().postDataJSON();posts.push(body);assert.match(body.requestKey,/^[a-f0-9-]{36}$/);
  if(mode==='drop-before-send')return route.abort('connectionfailed');
  const response=await route.fetch();assert.equal(response.status(),200);if(mode==='drop-after-commit')return route.abort('connectionfailed');return route.fulfill({response});
 });
 assert.equal((await page.goto(`${input.base}/c/${task.conversation_id}`))?.status(),200);
 const card=page.locator('#agent-run-'+task.id),draft=card.getByLabel('追加任务要求'),append=card.getByRole('button',{name:'追加',exact:true}),reconcile=card.getByRole('button',{name:'核对保存结果',exact:true});
 await expect(card.getByRole('button',{name:'继续',exact:true})).toBeEnabled();
 const first='Generated acknowledgement loss '+randomUUID();await draft.fill(' '+first+' ');await append.click();await expect(reconcile).toBeEnabled();await expect(draft).toHaveValue(' '+first+' ');assert.equal((await snapshot()).instructions.length,1);assert.equal(await events(),1);const firstKey=posts[0].requestKey,beforeRetry=await snapshot();
 const stored=await page.evaluate(()=>Object.entries(sessionStorage).filter(([key])=>key.startsWith('agent-instruction-submission-v1:')));assert.equal(stored.length,1);assert(!JSON.stringify(stored).includes(first));
 await page.reload();await expect(reconcile).toBeEnabled();await expect(append).toBeDisabled();await expect(card.getByRole('button',{name:'继续',exact:true})).toBeEnabled();mode='normal';await draft.fill(first);await append.click();await expect(draft).toHaveValue('');assert.equal(posts[1].requestKey,firstKey);assert.deepEqual(await snapshot(),beforeRetry);assert.equal(await events(),1);await expect(reconcile).toHaveCount(0);
 await expect(card.getByRole('button',{name:'继续',exact:true})).toBeEnabled();await draft.fill(first);await append.click();await expect(draft).toHaveValue('');assert.notEqual(posts[2].requestKey,firstKey);assert.equal((await snapshot()).instructions.length,2);assert.equal(await events(),2);
 // An owned active-task absence is not a definitive failure; preserve identity.
 await expect(card.getByRole('button',{name:'继续',exact:true})).toBeEnabled();mode='drop-before-send';const missing='Generated absent receipt '+randomUUID();await draft.fill(missing);await append.click();await expect(reconcile).toBeEnabled();const missingKey=posts.at(-1)!.requestKey;await reconcile.click();await expect(card.getByRole('status').filter({hasText:'仍待核对'})).toBeVisible();await expect(reconcile).toBeEnabled();assert.equal((await snapshot()).instructions.length,2);mode='normal';await append.click();await expect(draft).toHaveValue('');assert.equal(posts.at(-1)!.requestKey,missingKey);assert.equal((await snapshot()).instructions.length,3);
 // Different unknown submissions retain separate identities until explicit readback.
 const unknowns:Array<{requestKey:string;content:string}>=[];
 for(let i=0;i<2;i++){
  await expect(card.getByRole('button',{name:'继续',exact:true})).toBeEnabled();mode='drop-after-commit';const content='Generated pending '+i+' '+randomUUID();await draft.fill(content);await append.click();await expect(reconcile).toBeEnabled();unknowns.push({requestKey:posts.at(-1)!.requestKey,content});
 }
 assert.notEqual(unknowns[0].requestKey,unknowns[1].requestKey);assert.equal((await snapshot()).instructions.length,5);assert.equal(await events(),5);
 mode='drop-before-send';await draft.fill('Generated never committed '+randomUUID());await append.click();await expect(reconcile).toBeEnabled();assert.equal((await snapshot()).instructions.length,5);
 await admin.query("update agent_run set status='completed' where id=$1 and user_id=$2",[task.id,owner]);await page.reload();await expect(reconcile).toBeEnabled();await expect(draft).toHaveCount(0);const terminal=await snapshot(),postCount=posts.length;await reconcile.click();await expect(card.getByRole('status').filter({hasText:'2 次追加要求已保存。1 次未保存'})).toBeVisible();await expect(reconcile).toHaveCount(0);assert.equal(posts.length,postCount);assert.deepEqual(await snapshot(),terminal);assert.equal(await events(),5);
 const shots:string[]=[];for(const width of [1366,390]){await page.setViewportSize({width,height:900});await card.locator('.agent-run-actions strong').first().scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));const screenshot=`tmp/ma24-instruction-receipt-${width}-${task.id}.png`;await page.screenshot({path:screenshot,fullPage:true});shots.push(screenshot);}
 assert.deepEqual((await api(task.id,'POST',{action:'instruct',content:unknowns[0].content,requestKey:unknowns[0].requestKey.toUpperCase()})).status,200);assert.deepEqual(await snapshot(),terminal);
 for(const body of [{action:'instruct',content:'changed',requestKey:unknowns[0].requestKey},{action:'instruct',content:'new',requestKey:randomUUID()},{action:'instruct',content:'legacy'}])assert.equal((await api(task.id,'POST',body)).status,409);
 assert.equal((await api(task.id,'POST',{action:'resume',requestKey:firstKey})).status,400);assert.equal((await api(task.id,'POST',{action:'instruct',content:first,requestKey:'bad'})).status,400);assert.equal((await api(task.id,'POST',{action:'instruct',content:first,requestKey:firstKey,userId:owner})).status,400);
 for(const actor of [input.peer,'']){assert.equal((await api(task.id,'GET',undefined,actor,firstKey)).status,actor?404:401);assert.equal((await api(task.id,'POST',{action:'instruct',content:first,requestKey:firstKey},actor)).status,actor?404:401);}
 const receipt=await api(task.id,'GET',undefined,input.cookie,firstKey);assert.deepEqual(receipt.json,{recorded:true,content:first});assert(receipt.cache?.includes('private, no-store'));assert.deepEqual(await snapshot(),terminal);
 // Native row-lock serialization, same/different content, task scope and rollback.
 const other=await create(),key=randomUUID();const duplicates=await Promise.all([key,key.toUpperCase()].map(requestKey=>api(other.id,'POST',{action:'instruct',content:'same generated content',requestKey})));assert.deepEqual(duplicates.map(r=>r.status),[200,200]);assert.equal((await snapshot(other.id)).instructions.length,1);assert.equal(await events(other.id),1);
 const race=randomUUID(),conflicts=await Promise.all(['A','B'].map(content=>api(other.id,'POST',{action:'instruct',content,requestKey:race})));assert.deepEqual(conflicts.map(r=>r.status).sort(),[200,409]);assert.equal((await snapshot(other.id)).instructions.length,2);assert.equal(await events(other.id),2);
 assert.equal((await api(other.id,'POST',{action:'instruct',content:first,requestKey:firstKey})).status,200);assert.equal((await snapshot(other.id)).instructions.length,3);
 const failureKey=randomUUID(),name='ma24_instruction_'+randomUUID().replaceAll('-','');assert.match(name,/^ma24_instruction_[a-f0-9]{32}$/);
 await admin.query(`create function ${name}() returns trigger language plpgsql as $body$ begin if new.run_id='${other.id}'::uuid and new.kind='control' and new.payload->>'instructionId'='${failureKey}' then raise exception 'Synthetic instruction event failure';end if;return new;end $body$;create trigger ${name} before insert on agent_run_event for each row execute function ${name}()`);
 const prior=await snapshot(other.id),priorEvents=await events(other.id);
 try{assert.equal((await api(other.id,'POST',{action:'instruct',content:'rollback generated',requestKey:failureKey})).status,409);assert.deepEqual(await snapshot(other.id),prior);assert.equal(await events(other.id),priorEvents);assert.deepEqual((await api(other.id,'GET',undefined,input.cookie,failureKey)).json,{recorded:false,terminal:false});}
 finally{await admin.query(`drop trigger ${name} on agent_run_event;drop function ${name}()`);}
 assert.equal((await api(other.id,'POST',{action:'instruct',content:'rollback generated',requestKey:failureKey})).status,200);assert.equal((await snapshot(other.id)).instructions.length,4);assert.equal(await events(other.id),4);assert.equal((await admin.query('select count(*)::int n from agent_tool_call where run_id=any($1::uuid[])',[[task.id,other.id]])).rows[0].n,0);await page.unroute(url);
 return {instructionSubmissionFixedWeb:'passed',lostAckReloadRetrySameIdentity:true,acknowledgedIdenticalContentNewIdentity:true,activeAbsenceRetainsIdentity:true,multipleUnknownsTracked:true,terminalReadOnlyReconciliation:true,terminalReplayNoMutation:true,differentContentRejected:true,concurrentSameIdentityOneInstructionAndEvent:true,concurrentChangedContentOneWinner:true,ownerTaskScoped:true,rollbackKeepsInstructionAndAuditAtomic:true,storageHasNoInstructionPlaintext:true,screenshots:shots,actualModelCalls:0,toolCalls:0,externalActions:0,realBusinessQualityAccepted:false};
}
