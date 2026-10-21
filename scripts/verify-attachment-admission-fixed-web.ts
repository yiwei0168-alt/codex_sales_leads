import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {createServer} from 'node:https';
import {request} from 'node:http';
import {writeFile} from 'node:fs/promises';
import {Client} from 'pg';
import {verifyMa24AttachmentSelectorClone} from './lib/verify-ma24-attachment-selector-clone';

assert.equal(process.env.MA24_DISPOSABLE_ADMISSION_UI,'1');
const database=process.env.MA24_ADMISSION_DATABASE_CONTAINER!;assert.match(database,/^[a-f0-9]{64}$/);
const docker=(args:string[])=>execFileSync('docker',args,{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
assert.match(docker(['inspect','--format','{{.Name}}',database]),/^\/ma24-pilot-fresh-[a-f0-9]{12}$/);
const upstream=new URL(process.env.MA24_ADMISSION_WEB_BASE!);assert.equal(upstream.hostname,'127.0.0.1');assert.equal(upstream.protocol,'http:');
const adminUrl=new URL(process.env.DATABASE_MIGRATION_URL!);assert.equal(adminUrl.hostname,'127.0.0.1');assert.equal(adminUrl.pathname,'/network_copilot_local');
const cookie=process.env.MA24_ADMISSION_OWNER_COOKIE!,peer=process.env.MA24_ADMISSION_PEER_COOKIE!;assert(cookie&&peer&&cookie!==peer);
const admin=new Client({connectionString:adminUrl.toString()});await admin.connect();
const proxy=createServer({key:docker(['exec',database,'cat','/tmp/ma24-server.key']),cert:docker(['exec',database,'cat','/tmp/ma24-server.crt'])},(incoming,outgoing)=>{
 const forward=request({hostname:upstream.hostname,port:upstream.port,path:incoming.url,method:incoming.method,headers:{...incoming.headers,'x-forwarded-proto':'https'}},response=>{outgoing.writeHead(response.statusCode??502,response.headers);response.pipe(outgoing);});
 forward.on('error',()=>{outgoing.writeHead(502);outgoing.end();});incoming.pipe(forward);
});
const results:unknown[]=[];
const watchdog=setTimeout(()=>{console.error('Attachment admission fixture watchdog expired');process.exit(1);},180000);watchdog.unref();
try{
 const owner=(await admin.query('select id,email from app_user where email=$1',[process.env.MA24_ADMISSION_OWNER_EMAIL])).rows[0];assert(owner);assert.match(owner.email,/^pilot-container-[a-f0-9]{12}-0@example\.invalid$/);
 const collection=(await admin.query("select id from knowledge_collection where slug='company'")).rows[0].id;
 const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
 const document=randomUUID(),asset=randomUUID(),version=randomUUID(),old=randomUUID(),sourceSha=hash('Generated admission source');
 await admin.query("insert into knowledge_document(id,collection_id,external_id,title,source_type,content_sha256,owner_id,visibility) values($1,$2,$1::uuid::text,'Generated admission scope','manual',$3,$4,'private')",[document,collection,sourceSha,owner.id]);
 for(const id of [asset,old])await admin.query("insert into knowledge_asset(id,document_id,storage_key,source_sha256,mime_type,byte_size,document_type,source_nature) values($1,$2,$3,$4,'application/pdf',0,'datasheet','synthetic')",[id,document,`synthetic/${id}.pdf`,sourceSha]);
 const counters=async()=>(await admin.query(`select
  (select count(*)::int from assistant_conversation where user_id=$1) conversations,
  (select count(*)::int from assistant_message where user_id=$1) messages,
  (select count(*)::int from agent_run where user_id=$1) runs,
  (select count(*)::int from agent_run_event where user_id=$1) events`,[owner.id])).rows[0];
 const submit=async(ids:string[],actor=cookie,requestKey=randomUUID(),conversationId?:string)=>{
  const response=await fetch(upstream.origin+'/api/assistant/messages',{method:'POST',headers:{cookie:actor,'content-type':'application/json'},body:JSON.stringify({content:'Synthetic attachment admission verification',requestKey,attachments:ids.map(assetId=>({assetId})),...(conversationId?{conversationId}:{})}),signal:AbortSignal.timeout(15000)});
  return {status:response.status,body:await response.json()};
 };
 const refuse=async(label:string,ids:string[],actor=cookie,conversationId?:string)=>{const before=await counters(),r=await submit(ids,actor,randomUUID(),conversationId);assert.equal(r.status,409,JSON.stringify({case:label,status:r.status,expected:'refuse before any task/message/event commit'}));assert.deepEqual(await counters(),before,label);results.push({case:label,status:r.status,allConversationMessageRunEventCountsUnchanged:true});};
 await refuse('registered-unindexed-asset',[asset]);
 const beforeForced=await counters(),forced=await fetch(upstream.origin+'/api/assistant/messages',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({content:'Synthetic forbidden execution contract',requestKey:randomUUID(),attachments:[{assetId:asset}],serverOptions:{kind:'mail',paused:true}}),signal:AbortSignal.timeout(15000)});assert.equal(forced.status,400);assert.deepEqual(await counters(),beforeForced);results.push({case:'ordinary-caller-cannot-select-mail-contract',status:400,allConversationMessageRunEventCountsUnchanged:true});
 await admin.query("insert into knowledge_tree_version(id,document_id,asset_id,source_sha256,extractor_version,artifact_sha256,status,ready_at) values($1,$2,$3,$4,'synthetic-admission-v1',$5,'ready',now())",[version,document,asset,sourceSha,hash('Generated indexed metadata')]);
 await admin.query('update knowledge_document set current_tree_version_id=$2 where id=$1',[document,version]);
 await refuse('older-registered-asset-with-same-source-sha',[old]);await refuse('foreign-private-current-asset',[asset],peer);assert.equal((await submit([asset],'')).status,401);
 await admin.query("update knowledge_document set status='archived' where id=$1",[document]);await refuse('archived-document',[asset]);await admin.query("update knowledge_document set status='active' where id=$1",[document]);
 await admin.query("update knowledge_tree_version set status='failed' where id=$1",[version]);await refuse('failed-current-tree',[asset]);await admin.query("update knowledge_tree_version set status='ready',source_sha256=$2 where id=$1",[version,hash('Different source binding')]);await refuse('current-source-sha-mismatch',[asset]);await admin.query('update knowledge_tree_version set source_sha256=$2 where id=$1',[version,sourceSha]);
 await admin.query("update knowledge_asset set registration_status='withdrawn' where id=$1",[asset]);await refuse('withdrawn-asset',[asset]);await admin.query("update knowledge_asset set registration_status='registered' where id=$1",[asset]);
 await refuse('mixed-current-and-older-set',[asset,old]);
 const key=randomUUID(),admitted=await submit([asset,asset.toUpperCase()],cookie,key);assert.equal(admitted.status,202);const runId=admitted.body.run.id,conversationId=admitted.body.conversation.id;assert(runId&&conversationId);assert.equal(admitted.body.run.status,'queued');
 const persisted=(await admin.query('select input,status from agent_run where id=$1 and user_id=$2',[runId,owner.id])).rows[0];assert.deepEqual(persisted.input.attachments,[{assetId:asset},{assetId:asset.toUpperCase()}]);assert.equal(persisted.status,'queued');await refuse('invalid-set-on-existing-conversation',[old],cookie,conversationId);
 await admin.query("update knowledge_asset set registration_status='withdrawn' where id=$1",[asset]);const before=await counters(),replay=await submit([asset,asset.toUpperCase()],cookie,key);assert.equal(replay.status,202);assert.equal(replay.body.run.id,runId);assert.deepEqual(await counters(),before);await refuse('new-key-after-withdrawal',[asset]);await admin.query("update knowledge_asset set registration_status='registered' where id=$1",[asset]);
 await admin.query("update knowledge_document set visibility='shared' where id=$1",[document]);const shared=await submit([asset],peer);assert.equal(shared.status,202);assert(shared.body.run.id!==runId);await admin.query("update knowledge_document set visibility='private' where id=$1",[document]);
 await new Promise<void>(done=>proxy.listen(0,'127.0.0.1',done));const address=proxy.address();assert(address&&typeof address!=='string');const base=`https://127.0.0.1:${address.port}`;
 // Existing UI selection proof now uses actual ready current-tree metadata.
 const selector=await verifyMa24AttachmentSelectorClone({admin,base,cookie,userId:owner.id,allowSelfSignedLoopback:true});
 const result={attachmentAdmissionFixedWeb:'passed',actualChromeHttpsCompiledWeb:true,generatedAccountsAndMetadataOnly:true,results,duplicateCaseAliasesAdmittedAsOneLookupWithOriginalInputRetained:true,exactRequestReplayAfterWithdrawalReadOnly:true,sharedCurrentSourceAdmitted:true,selector,actualModelCalls:0,workersStarted:0,realDocumentQualityAccepted:false,productionQualified:false};await writeFile('tmp/ma24-attachment-admission-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{clearTimeout(watchdog);const timeout=setTimeout(()=>process.exit(1),15000);timeout.unref();proxy.closeAllConnections();if(proxy.listening)await new Promise<void>(done=>proxy.close(()=>done()));await admin.end();clearTimeout(timeout);}
