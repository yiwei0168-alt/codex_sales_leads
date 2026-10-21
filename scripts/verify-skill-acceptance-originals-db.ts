import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool,tenantTransaction,withBoundTenantTransaction} from '../src/lib/rag/db';
import {digest} from '../src/lib/assistant/main/contracts';
import {importSkill} from '../src/lib/assistant/main/skills';
import {freezeSkillAcceptancePlan,revokeSkillAcceptanceFreeze} from '../src/lib/assistant/main/skill-acceptance-freeze';
import type {SkillCollectorTransaction} from '../src/lib/assistant/main/skill-model-journal';
import {previewSkillAcceptanceOriginals,captureSkillAcceptanceOriginals} from '../src/lib/assistant/main/skill-acceptance-originals';
import {disableLocalAnalysisTracing} from '../src/lib/assistant/main/local-analysis-boundary';
import {readLockedSkillAcceptanceEvidence} from '../src/lib/assistant/main/skill-acceptance-store';
import {lockSkillAcceptanceRunJournals} from '../src/lib/assistant/main/skill-acceptance-run-locks';
import {revalidateLockedSkillAttachmentBytes} from '../src/lib/assistant/main/skill-attachment-bytes';
import {revalidateLockedSkillKnowledgeReceiptBytes} from '../src/lib/assistant/main/skill-knowledge-receipt-bytes';
import {requireCanonicalSkillAcceptanceOriginals} from '../src/lib/assistant/main/skill-canonical-original-coverage';

nextEnv.loadEnvConfig(process.cwd());disableLocalAnalysisTracing();
assert.equal(process.env.MA24_DISPOSABLE_ORIGINAL_CAPTURE,'1');
const adminUrl=new URL(process.env.DATABASE_MIGRATION_URL!),appUrl=new URL(process.env.DATABASE_URL!);
assert.equal(adminUrl.hostname,'127.0.0.1');assert.equal(adminUrl.host+adminUrl.pathname,appUrl.host+appUrl.pathname);
const pool=new Pool({connectionString:adminUrl.toString()}),owner=randomUUID(),peer=randomUUID(),run=randomUUID(),conversation=randomUUID(),collection=randomUUID(),bundleId=randomUUID();
const assets=[randomUUID(),randomUUID()].sort(),documents=[randomUUID(),randomUUID()],files=assets.map(id=>`knowledge/ma24-explicit-original-${id}.txt`);
const bytes=assets.map((_,index)=>Buffer.from(`Synthetic explicit original ${index}\n`)),hashes=bytes.map(value=>createHash('sha256').update(value).digest('hex'));
const transaction:SkillCollectorTransaction=async(actor,work)=>{const client=await pool.connect();try{await client.query('begin');await client.query('set local role network_copilot_skill_collector');
 await client.query("select set_config('app.current_user_id',$1,true)",[actor]);const value=await work(client);await client.query('commit');return value;
 }catch(error){await client.query('rollback');throw error;}finally{client.release();}};
const results:string[]=[];
const http=process.env.MA24_ORIGINALS_HTTP_BASE,ownerCookie=process.env.MA24_ORIGINALS_OWNER_COOKIE,peerCookie=process.env.MA24_ORIGINALS_PEER_COOKIE;
const webContainer=process.env.MA24_ORIGINALS_WEB_CONTAINER;
if(http){assert(ownerCookie&&peerCookie);assert.equal(new URL(http).hostname,'127.0.0.1');assert.match(webContainer??'',/^[a-f0-9]{64}$/);}
let browserResult:unknown;
try{
 for(const id of [owner,peer])await pool.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic originals','member','active')",[id,`${id}@example.invalid`]);
 const skill=await importSkill({userId:owner,role:'member'},{name:'Synthetic original preservation',source:'synthetic-test',files:{'SKILL.md':'Synthetic unqualified instructions.'},dependencies:[]});
 const version=(await pool.query('select * from agent_skill_version where skill_id=$1',[skill.id])).rows[0],hash=digest('synthetic');
 const cases=Array.from({length:5},(_,index)=>({id:`source-${index}`,category:'replay',provenance:'historical-task',inputHash:hash,sourceHash:hash}));
 const frozen=await freezeSkillAcceptancePlan({userId:owner},{protocol:'skill-acceptance-plan-v1',pin:{ownerId:owner,skillId:skill.id,version:1,contentHash:version.content_hash,
  sourceHash:digest({source:version.source,validation:version.validation,dependencies:version.dependencies})},identity:{runtimeHash:hash,promptHash:hash,toolSchemaHash:hash,modelConfigHash:hash,scopeHash:hash},expiresAt:new Date(Date.now()+3600000).toISOString(),cases},transaction);
 await pool.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Synthetic originals')",[conversation,owner]);
 await pool.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind)
  values($1,$2,$3,$1::uuid::text,$1::uuid::text,$4,'{}','completed','main-agent')`,[run,owner,conversation,JSON.stringify({attachments:[{assetId:assets[0]}]})]);
 await pool.query("insert into knowledge_collection(id,slug,name,base_type) values($1,$1::uuid::text,'Synthetic originals','industry')",[collection]);
 await mkdir('knowledge',{recursive:true});
 for(let i=0;i<assets.length;i++){
  await writeFile(files[i],bytes[i],{flag:'wx'});
  await pool.query(`insert into knowledge_document(id,collection_id,external_id,title,source_type,content_sha256,owner_id,visibility)
   values($1,$2,$1::uuid::text,'Synthetic original','text',$3,$4,$5)`,[documents[i],collection,hashes[i],i?peer:owner,i?'shared':'private']);
  await pool.query(`insert into knowledge_asset(id,document_id,storage_key,source_sha256,mime_type,byte_size,document_type,source_nature)
   values($1,$2,$3,$4,'text/plain',$5,'TXT','synthetic')`,[assets[i],documents[i],files[i],hashes[i],bytes[i].length]);
 }
 await pool.query(`insert into agent_tool_call(user_id,run_id,call_key,tool_id,tool_version,input,input_hash,effect,status,output)
  values($1,$2,'synthetic-originals','knowledge_originals','1','{}',$3,'read','completed',$4)`,[owner,run,digest({}),JSON.stringify({status:'success',data:{documents:[{id:assets[1]}]}})]);
 const refs=Object.fromEntries(cases.map(item=>[item.id,{runId:run}]));
 const artifact={sourceKind:'synthetic-fixture',plan:frozen.plan,observations:[],rawReceipts:{collector:{freezeId:frozen.freezeId},baselineSources:refs,candidateSources:refs}};
 await pool.query(`insert into agent_skill_acceptance_bundle(id,owner_id,skill_id,version,source_kind,plan,observations,raw_receipts,artifact_hash)
  values($1,$2,$3,1,$4,$5,'[]',$6,$7)`,[bundleId,owner,skill.id,artifact.sourceKind,JSON.stringify(artifact.plan),JSON.stringify(artifact.rawReceipts),digest(artifact)]);
 const context={userId:owner},preview=await previewSkillAcceptanceOriginals(context,bundleId);
 // Exercise the pending-production component with actual source-locked byte
 // adapters, without relabeling this synthetic bundle as production evidence.
 const checkCanonical=()=>tenantTransaction(owner,client=>withBoundTenantTransaction(client,owner,async()=>{
  const evidence=await readLockedSkillAcceptanceEvidence(client,context,bundleId);
  await lockSkillAcceptanceRunJournals(client,owner,evidence.artifact);
  const receipts=await client.query<{tool:string;output:unknown}>(`select tool_id as tool,output from agent_tool_call
   where user_id=$1 and run_id=$2 and effect='read' and status='completed' and output->>'status' in ('success','partial')`,[owner,run]);
  const attachments=await revalidateLockedSkillAttachmentBytes(client,owner,evidence.artifact);
  const knowledge=await revalidateLockedSkillKnowledgeReceiptBytes(client,owner,receipts.rows);
  assert.equal(attachments.attachmentBytesCount,1);assert.equal(knowledge.knowledgeReceiptAssetCount,1);
  return requireCanonicalSkillAcceptanceOriginals('production-runner-pending-verification',{...attachments,...knowledge});
 }));
 await assert.rejects(checkCanonical(),/explicit canonical capture/);
 results.push('pending-production coverage component rejects two readable but uncaptured actual originals');
 assert.equal(preview.assetCount,2);assert.equal(preview.pendingCount,2);
 const count=async()=>Number((await pool.query('select count(*) n from knowledge_asset_immutable_snapshot where asset_id=any($1::uuid[])',[assets])).rows[0].n);
 assert.equal(await count(),0);await assert.rejects(previewSkillAcceptanceOriginals({userId:peer},bundleId));
 const input={bundleId,artifactHash:preview.artifactHash,sourceManifestHash:preview.sourceManifestHash};
 await assert.rejects(captureSkillAcceptanceOriginals(context,{...input,assetIds:[randomUUID()]}));
 await assert.rejects(captureSkillAcceptanceOriginals(context,{...input,sourceManifestHash:'0'.repeat(64)}));assert.equal(await count(),0);
 results.push('preview derives attachment plus knowledge receipt original without writing; cross-account, caller IDs and stale preview reject');
 await pool.query('update knowledge_asset set byte_size=52428801 where id=$1',[assets[1]]);
 const large=await previewSkillAcceptanceOriginals(context,bundleId);assert.equal(large.unsupportedCount,1);
 await assert.rejects(captureSkillAcceptanceOriginals(context,{...input,sourceManifestHash:large.sourceManifestHash}),/size unsupported/);assert.equal(await count(),0);
 await pool.query('update knowledge_asset set byte_size=$2 where id=$1',[assets[1],bytes[1].length]);
 await writeFile(files[1],Buffer.from('Corrupt late source'));
 await assert.rejects(captureSkillAcceptanceOriginals(context,input));assert.equal(await count(),0,'Earlier capture must roll back when later bytes mismatch');
 await writeFile(files[1],bytes[1]);
 if(http){
  // Only these two random synthetic files enter the disposable container. The
  // host corpus is neither mounted nor copied into the isolated Web runtime.
  for(const path of files)execFileSync('docker',['cp',path,`${webContainer}:/app/${path}`],{windowsHide:true,stdio:'pipe'});
  const endpoint=`${http}/api/assistant/skills/acceptance-originals`;
  // The fixture uses dedicated users above; create real sessions using a
  // test-only password update, never caller-selected ownership on the endpoint.
  const {hashPassword}=await import('../src/lib/auth/password');const password=randomUUID()+randomUUID();
  await pool.query('update app_user set password_hash=$2 where id=any($1::uuid[])',[[owner,peer],await hashPassword(password)]);
  const login=async(actor:string)=>{
   const response=await fetch(`${http}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:`${actor}@example.invalid`,password})});
   assert.equal(response.status,200);const cookie=response.headers.get('set-cookie')?.split(';')[0];assert(cookie);return cookie;
  };
  const ownedCookie=await login(owner),otherCookie=await login(peer);
  const previewResponse=await fetch(`${endpoint}?bundleId=${bundleId}`,{headers:{cookie:ownedCookie}});assert.equal(previewResponse.status,200);assert.equal((await previewResponse.json()).pendingCount,2);
  assert.equal((await fetch(`${endpoint}?bundleId=${bundleId}`,{headers:{cookie:otherCookie}})).status,409);
  const denied=await fetch(endpoint,{method:'POST',headers:{cookie:ownedCookie,'content-type':'application/json',origin:'https://other.invalid'},body:JSON.stringify(input)});assert.equal(denied.status,403);assert.equal(await count(),0);
  const {verifyOriginalsBrowser}=await import('./lib/verify-ma24-originals-browser');
  browserResult=await verifyOriginalsBrowser({base:http,cookie:ownedCookie,keyPath:process.env.MA24_ORIGINALS_TLS_KEY!,certPath:process.env.MA24_ORIGINALS_TLS_CERT!,skillName:'Synthetic original preservation',
   withSourceWithdrawn:async verify=>{
    await pool.query("update knowledge_document set visibility='private' where id=$1",[documents[1]]);
    try{await verify();}finally{await pool.query("update knowledge_document set visibility='shared' where id=$1",[documents[1]]);}
   }});
  assert.equal(await count(),2);results.push('actual HTTP ownership/origin checks and HTTPS browser explicit preview/save pass');
  for(const path of files)execFileSync('docker',['exec',webContainer!,'node','-e','require("node:fs").unlinkSync(process.argv[1])',`/app/${path}`],{windowsHide:true,stdio:'pipe'});
 }
 const saved=await captureSkillAcceptanceOriginals(context,input);assert.equal(saved.capturedCount,2);assert.equal(saved.pendingCount,0);assert.equal(await count(),2);
 results.push('oversize rejects before capture; late file hash mismatch rolls back all copies; explicit capture succeeds');
 for(const path of files)await unlink(path);
 assert.equal((await captureSkillAcceptanceOriginals(context,input)).capturedCount,2);assert.equal(await count(),2);
 assert.equal((await checkCanonical()).canonicalOriginalCoverageRevalidated,true);
 results.push('actual attachment and knowledge byte adapters pass canonical coverage after explicit capture and filesystem removal');
 results.push('repeated action reuses verified canonical bytes after original files disappear');
 await pool.query("update knowledge_document set visibility='private' where id=$1",[documents[1]]);
 await assert.rejects(previewSkillAcceptanceOriginals(context,bundleId));await assert.rejects(captureSkillAcceptanceOriginals(context,input));
 await pool.query("update knowledge_document set visibility='shared' where id=$1",[documents[1]]);
 await pool.query("update app_user set status='disabled' where id=$1",[owner]);await assert.rejects(previewSkillAcceptanceOriginals(context,bundleId),/account unavailable/);
 await pool.query("update app_user set status='active' where id=$1",[owner]);
 await revokeSkillAcceptanceFreeze(context,{freezeId:frozen.freezeId,reason:'Synthetic capture revocation'});await assert.rejects(captureSkillAcceptanceOriginals(context,input),/active recorded freeze/);
 assert.equal((await pool.query('select enabled from agent_skill where id=$1',[skill.id])).rows[0].enabled,false);
 results.push('shared withdrawal, disabled account and freeze revocation reject existing snapshots; Skill remains disabled');
 const receipt={passed:true,results,actualFilesAndDatabase:true,actualCompiledHttpVerified:!!http,browserResult,syntheticSourcesOnly:true,humanJudgmentCreated:false,modelCalls:0,automaticActivation:false,productionQualified:false};
 await writeFile('tmp/ma24-acceptance-originals-database-result.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}finally{
 for(const path of files)await unlink(path).catch(error=>{if(error.code!=='ENOENT')throw error;});await pool.end();await getPool().end();
}
