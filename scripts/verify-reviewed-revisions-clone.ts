import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,readdir,rm,rmdir} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {createKnowledgeUploadJob,listKnowledgeUploadJobs} from '../src/lib/knowledge/upload';
import {registerVectorlessUpload} from '../src/lib/knowledge/vectorless-registration';
import {getExtractionReview,recordExtractionReview,completeExtractionReview} from '../src/lib/knowledge/extraction-review';
import {readEvidence} from '../src/lib/knowledge/vectorless';

nextEnv.loadEnvConfig(process.cwd());
const base=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;assert(base);
const url=new URL(base);assert(['localhost','127.0.0.1','::1'].includes(url.hostname));
const {database}=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8'));assert(/^ma11_replay_[a-f0-9]{12}$/.test(database));
url.pathname=`/${database}`;process.env.DATABASE_URL=url.toString();
const pool=new Pool({connectionString:url.toString()}),owner=randomUUID(),other=randomUUID();
const job=async(id:string)=>(await pool.query('select * from knowledge_upload_job where id=$1',[id])).rows[0];
const doc=async(id:string)=>(await pool.query('select * from knowledge_document where id=$1',[id])).rows[0];
async function worker(id:string){
 return new Promise<{completed:number;awaitingReview:number;failed:number}>((done,reject)=>{
  const child=spawn(process.execPath,['--require','./scripts/patch-node-user.cjs','--import','tsx','scripts/process-knowledge-upload-jobs.ts',`--job-id=${id}`,'--limit=1'],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,DATABASE_URL:url.toString()}});
  let out='',err='';child.stdout.on('data',part=>out+=part);child.stderr.on('data',part=>err+=part);
  child.once('error',reject);child.once('exit',code=>{if(code!==0)reject(new Error(err.slice(-1000)));else{try{done(JSON.parse(out));}catch(error){reject(error);}}});
 });
}
async function review(id:string){
 const initial=await getExtractionReview(owner,id);
 for(let offset=0;offset<initial.total;offset+=20){
  const page=await getExtractionReview(owner,id,offset);
  for(const item of page.blocks)await recordExtractionReview(owner,{jobId:id,artifactSha256:page.artifactSha256,blockId:item.block.id,expectedRevision:0,
   decision:item.block.id===initial.blocks[0].block.id?'evidence':'decoration',evidenceText:item.block.id===initial.blocks[0].block.id?'Synthetic reviewed revision marker':'',note:'Synthetic recovery test only; not content quality approval'});
 }
 const ready=await getExtractionReview(owner,id);
 const receipt=await completeExtractionReview(owner,id,ready.artifactSha256,ready.decisionSha256);
 return {ready,receipt};
}
const results=[];
try{
 for(const id of [owner,other])await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Reviewed revision test','!','admin','active')",[id,`${id}@example.invalid`]);
 const pointers=JSON.stringify((await pool.query('select * from knowledge_release_pointer_v3 order by scope_kind,owner_id')).rows);
 for(const visibility of ['private','shared'] as const){
  const original=await createKnowledgeUploadJob(owner,{collection:'industry',title:'Old reviewed revision target',originalFilename:'old.pdf',mimeType:'application/pdf',bytes:await readFile('knowledge/product/Bluetooth USB Adapter/BU530C_V1.0__Datasheet.pdf'),visibility});
  await worker(original.id);
  const old=await registerVectorlessUpload(owner,original.id,{language:'en',authorityLevel:2});assert.equal(old.treeStatus,'searchable');
  const node=(await pool.query("select id from knowledge_tree_node where version_id=$1 and content is not null and content<>'' limit 1",[old.versionId])).rows[0];assert(node);
  const assertOld=async()=>{assert.equal((await doc(old.documentId)).current_tree_version_id,old.versionId);assert(await readEvidence(owner,node.id));};
  const input={collection:'industry' as const,title:'Reviewed replacement',originalFilename:'revision.pptx',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',bytes:await readFile('tmp/ma24-public-eval-candidates/itu-satellite-2025.pptx'),visibility,revisionDocumentId:old.documentId,revisionBaseVersionId:old.versionId};
  await assert.rejects(()=>createKnowledgeUploadJob(other,input),/owned/);
  const revision=await createKnowledgeUploadJob(owner,input);await assertOld();
  const held=await worker(revision.id);assert.equal(held.awaitingReview,1);await assertOld();
  const repeated=await createKnowledgeUploadJob(owner,input);assert(repeated.reused);assert.equal(repeated.id,revision.id);
  await worker(revision.id);await assertOld();
  const unresolved=await getExtractionReview(owner,revision.id);
  await assert.rejects(()=>completeExtractionReview(owner,revision.id,unresolved.artifactSha256,unresolved.decisionSha256),/未解决/);
  await assert.rejects(()=>registerVectorlessUpload(owner,revision.id,{language:'en',authorityLevel:2}),/Unresolved/);await assertOld();
  const {ready,receipt}=await review(revision.id);await assertOld();
  const competing=await createKnowledgeUploadJob(owner,{...input,bytes:Buffer.concat([input.bytes,Buffer.from('\ncompeting revision source')])});
  assert.equal((await worker(competing.id)).awaitingReview,1);
  await review(competing.id);await assertOld();
  const saved=await job(revision.id),path=resolve(saved.extraction_artifact_key);assert(path.startsWith(resolve('knowledge/uploads',owner)+sep));
  const bytes=await readFile(path);await writeFile(path,Buffer.concat([bytes,Buffer.from('changed')]));
  try{await assert.rejects(()=>registerVectorlessUpload(owner,revision.id,{language:'en',authorityLevel:2}),/hash mismatch/);await assertOld();}finally{await writeFile(path,bytes);}
  if(visibility==='shared'){
   await worker(revision.id);await assertOld();
   await pool.query("update app_user set role='member' where id=$1",[owner]);
   await assert.rejects(()=>registerVectorlessUpload(owner,revision.id,{language:'en',authorityLevel:2}),/administrator/);await assertOld();
   await pool.query("update app_user set role='admin' where id=$1",[owner]);
  }else assert.equal((await worker(revision.id)).completed,1);
  const current=await registerVectorlessUpload(owner,revision.id,{language:'en',authorityLevel:2,expectedSourceSha256:revision.sourceSha256});
  assert.equal(current.treeStatus,'searchable');
  assert.equal(current.documentId,old.documentId);assert.notEqual(current.versionId,old.versionId);assert.equal(await readEvidence(owner,node.id),null);
  const newNode=(await pool.query('select id from knowledge_tree_node where version_id=$1 and content=$2',[current.versionId,'Synthetic reviewed revision marker'])).rows[0];assert(newNode);
  const evidence=await readEvidence(owner,newNode.id);assert.equal((evidence?.source_location as {extractionReview:{receiptId:string}}).extractionReview.receiptId,receipt.receiptId);
  const replay=await completeExtractionReview(owner,revision.id,ready.artifactSha256,ready.decisionSha256);assert(replay.reused);assert.equal(replay.receiptId,receipt.receiptId);
  await assert.rejects(()=>registerVectorlessUpload(owner,competing.id,{language:'en',authorityLevel:2}),/version changed/);
  assert.equal((await doc(old.documentId)).current_tree_version_id,current.versionId);
  assert.equal((await pool.query('select count(*)::int as n from knowledge_tree_version where document_id=$1',[old.documentId])).rows[0].n,2);
  assert.equal((await listKnowledgeUploadJobs(owner)).find(row=>row.id===original.id)?.treeStatus,'historical');
  results.push({visibility,oldReadableWhilePendingAndHeld:true,duplicateReused:true,unresolvedRejected:true,tamperKeepsOld:true,sharedStillRequiresAdmin:visibility==='shared',reviewedCompetingRevisionRejected:true,stableDocumentId:true,oldEvidenceRejectedAfterSwitch:true,receiptPreserved:true,historyRetained:true});
 }
 assert.equal(JSON.stringify((await pool.query('select * from knowledge_release_pointer_v3 order by scope_kind,owner_id')).rows),pointers);
 const evidence={cloneOnly:true,syntheticJudgments:true,qualityAccepted:false,externalCalls:0,modelCalls:0,v3PointersUnchanged:true,results};
 await writeFile('tmp/reviewed-revision-result.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{
 await pool.query('delete from knowledge_upload_review_completion where owner_id=$1',[owner]);
 await pool.query('delete from knowledge_upload_extraction_review where owner_id=$1',[owner]);
 await pool.query('delete from knowledge_upload_job where user_id=$1',[owner]);
 await pool.query('update knowledge_document set current_tree_version_id=null where owner_id=$1',[owner]);
 await pool.query('delete from knowledge_document where owner_id=$1',[owner]);
 await pool.query('delete from app_user where id=any($1::uuid[])',[[owner,other]]);await pool.end();await getPool().end();
 const root=resolve('knowledge/uploads',owner);assert(root.startsWith(resolve('knowledge/uploads')+sep));
 for(const name of await readdir(root).catch(()=>[])){const path=resolve(root,name);assert(path.startsWith(root+sep));await rm(path,{recursive:true,force:true});}await rmdir(root).catch(()=>undefined);
}
