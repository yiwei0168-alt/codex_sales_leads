import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,readdir,mkdir,rm,rmdir,writeFile} from 'node:fs/promises';
import {basename,resolve,sep,extname} from 'node:path';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {createKnowledgeUploadJob,listKnowledgeUploadJobs,type KnowledgeUploadInput} from '../src/lib/knowledge/upload';
import {registerVectorlessUpload} from '../src/lib/knowledge/vectorless-registration';
import {browseTree,readEvidence} from '../src/lib/knowledge/vectorless';
import {listKnowledgeLibrary,readKnowledgeLibraryItem} from '../src/lib/knowledge/library-service';

nextEnv.loadEnvConfig(process.cwd());
const base=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
assert(base&&['localhost','127.0.0.1','::1'].includes(new URL(base).hostname));
const {database}=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8')) as {database:string};assert(/^ma11_replay_[a-f0-9]{12}$/.test(database));
const url=new URL(base);url.pathname=`/${database}`;process.env.DATABASE_URL=url.toString();
const pool=new Pool({connectionString:url.toString()}),owner=randomUUID(),other=randomUUID(),owners=[owner,other];
const fixtureRoot=resolve('tmp/binary-revisions',owner),markerRoot=resolve('tmp/upload-crash');
const getJob=async(id:string)=>(await pool.query('select * from knowledge_upload_job where id=$1',[id])).rows[0];
const getDoc=async(id:string)=>(await pool.query('select * from knowledge_document where id=$1',[id])).rows[0];
const sha=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function command(exe:string,args:string[]){
 const child=spawn(exe,args,{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,DATABASE_URL:url.toString()}});let out='',err='';
 child.stdout.on('data',data=>{out+=data;});child.stderr.on('data',data=>{err+=data;});const timer=setTimeout(()=>child.kill(),180_000);
 try{await new Promise<void>((done,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?done():reject(new Error(err.slice(-1000))));});return out;}finally{clearTimeout(timer);}
}
async function worker(id:string,failed=0){const result=JSON.parse(await command(process.execPath,['--require','./scripts/patch-node-user.cjs','--import','tsx','scripts/process-knowledge-upload-jobs.ts',`--job-id=${id}`,'--limit=1']));assert.equal(result.completed,1-failed);assert.equal(result.failed,failed);}
async function crashBeforeCommit(id:string){
 const marker=resolve(markerRoot,`${randomUUID()}.json`);
 const child=spawn(process.execPath,['--require','./scripts/patch-node-user.cjs','--require','./scripts/fixtures/upload-crash-preload.cjs','--import','tsx','scripts/process-knowledge-upload-jobs.ts',`--job-id=${id}`,'--limit=1'],
  {windowsHide:true,stdio:'ignore',env:{...process.env,DATABASE_URL:url.toString(),UPLOAD_CRASH_PHASE:'tree-transaction',UPLOAD_CRASH_MARKER:marker}});
 const exited=new Promise<void>((done,reject)=>{child.once('exit',()=>done());child.once('error',reject);});
 try{let reached=false;for(let i=0;i<900;i++){const content=await readFile(marker,'utf8').catch(()=>null);if(content){assert.equal(JSON.parse(content).pid,child.pid);reached=true;break;}if(child.exitCode!==null)break;await new Promise(done=>setTimeout(done,100));}
  assert(reached,'Revision transaction checkpoint not reached');assert(child.kill());await exited;
 }finally{if(child.exitCode===null){child.kill();await exited;}await rm(marker,{force:true});}
}
const samples=[
 {path:'knowledge/product/Bluetooth USB Adapter/BU530C_V1.0__Datasheet.pdf',mime:'application/pdf'},
 {path:'knowledge/industry/网络产品品牌与行业研究报告.pptx',mime:'application/vnd.openxmlformats-officedocument.presentationml.presentation'},
 {path:'knowledge/product/Cudy products list.xlsx',mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},
];
const results=[];
try{
 await pool.query(await readFile('db/migrations/125_binary_upload_revisions.sql','utf8'));await mkdir(fixtureRoot,{recursive:true});await mkdir(markerRoot,{recursive:true});
 for(const id of owners)await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Revision fixture','!','member','active')",[id,`${id}@example.invalid`]);
 const pointerBefore=sha((await pool.query('select * from knowledge_release_pointer_v3 order by scope_kind,owner_id')).rows);
 const unrelatedBefore=sha((await pool.query('select id,current_tree_version_id,metadata from knowledge_document where owner_id is distinct from $1 order by id',[owner])).rows);
 for(const sample of samples){
  const input:KnowledgeUploadInput={collection:'industry',title:'Original revision fixture',originalFilename:basename(sample.path),mimeType:sample.mime,bytes:await readFile(sample.path),visibility:'private'};
  const original=await createKnowledgeUploadJob(owner,input);await worker(original.id);
  const old=await getJob(original.id),doc=await getDoc(old.published_document_id);
  const units=await browseTree(owner,doc.id),leaves=await browseTree(owner,doc.id,units[0].id),oldEvidence=leaves[0].id;
  assert(await readEvidence(owner,oldEvidence));
  const marker=`MA24 revised ${extname(sample.path)} original evidence`;
  const revisedFile=resolve(fixtureRoot,`revision${extname(sample.path)}`);
  await command(process.env.PYTHON_BINARY||'python',['scripts/fixtures/revise-binary.py',sample.path,revisedFile,marker]);
  const revisionInput={...input,title:'Updated revision fixture',bytes:await readFile(revisedFile),revisionDocumentId:doc.id,revisionBaseVersionId:doc.current_tree_version_id};
  await assert.rejects(()=>createKnowledgeUploadJob(other,revisionInput),/owned/);
  const same=await createKnowledgeUploadJob(owner,{...input,revisionDocumentId:doc.id,revisionBaseVersionId:doc.current_tree_version_id});assert(same.reused);assert.equal(same.id,original.id);
  const failed=await createKnowledgeUploadJob(owner,{...revisionInput,originalFilename:'invalid.pdf',mimeType:'application/pdf',bytes:Buffer.from('%PDF-invalid')});await worker(failed.id,1);
  assert.equal((await getDoc(doc.id)).current_tree_version_id,doc.current_tree_version_id);assert(await readEvidence(owner,oldEvidence));
  const revision=await createKnowledgeUploadJob(owner,revisionInput);
  const conflictFile=resolve(fixtureRoot,`conflict${extname(sample.path)}`);
  await command(process.env.PYTHON_BINARY||'python',['scripts/fixtures/revise-binary.py',sample.path,conflictFile,marker+' competing change']);
  const competing=await createKnowledgeUploadJob(owner,{...revisionInput,bytes:await readFile(conflictFile)});
  assert.equal((await getDoc(doc.id)).current_tree_version_id,doc.current_tree_version_id);assert(await readEvidence(owner,oldEvidence));
  await crashBeforeCommit(revision.id);
  assert.equal((await getJob(revision.id)).status,'extracted');assert.equal((await getDoc(doc.id)).current_tree_version_id,doc.current_tree_version_id);assert(await readEvidence(owner,oldEvidence));
  assert.equal((await pool.query('select count(*)::int as n from knowledge_asset where document_id=$1',[doc.id])).rows[0].n,1);
  await pool.query("update knowledge_upload_job set lease_until=now()-interval '1 second' where id=$1",[revision.id]);await worker(revision.id);
  const current=await getDoc(doc.id),saved=await getJob(revision.id);assert.equal(saved.published_document_id,doc.id);assert.notEqual(current.current_tree_version_id,doc.current_tree_version_id);
  assert.equal(await readEvidence(owner,oldEvidence),null);
  const currentText=await readKnowledgeLibraryItem(owner,doc.id,'private');assert(String(currentText?.content).includes(marker));
  await pool.query("update knowledge_asset set updated_at=now()+interval '1 day' where id=$1",[old.published_asset_id]);
  const list=await listKnowledgeLibrary(owner,'private','Updated revision fixture',0,50);
  assert.equal(list.items.find(item=>item.id===doc.id)?.assetId,saved.published_asset_id);
  await worker(competing.id,1);assert.equal((await getJob(competing.id)).error_code,'revision-conflict');assert.equal((await getDoc(doc.id)).current_tree_version_id,current.current_tree_version_id);
  await assert.rejects(async()=>createKnowledgeUploadJob(owner,{...revisionInput,bytes:await readFile(conflictFile)}),/version changed/);
  const repeated=await registerVectorlessUpload(owner,revision.id,{language:'und',authorityLevel:2});assert(repeated.reused);
  const jobs=await listKnowledgeUploadJobs(owner,0,50);assert.equal(jobs.find(job=>job.id===original.id)?.treeStatus,'historical');assert.equal(jobs.find(job=>job.id===revision.id)?.treeStatus,'searchable');
  assert.equal((await pool.query('select count(*)::int as n from knowledge_tree_version where document_id=$1',[doc.id])).rows[0].n,2);
  assert.equal((await pool.query('select registration_status from knowledge_asset where id=$1',[old.published_asset_id])).rows[0].registration_status,'registered');
  results.push({format:extname(sample.path),newContentVerified:true,stableDocumentId:true,oldReadableDuringProcessing:true,parserFailureKeepsOld:true,transactionCrashKeepsOld:true,staleBaseRejected:true,oneWinner:true,oldEvidenceNotCurrent:true,downloadUsesCurrentAsset:true,historyRetained:true});
 }
 await pool.query("update app_user set role='admin' where id=$1",[owner]);
 const sharedInput:KnowledgeUploadInput={collection:'industry',title:'Shared revision',originalFilename:'shared.pdf',mimeType:'application/pdf',bytes:await readFile(samples[0].path),visibility:'shared'};
 const shared=await createKnowledgeUploadJob(owner,sharedInput);await worker(shared.id);
 const published=await registerVectorlessUpload(owner,shared.id,{language:'en',authorityLevel:3,expectedSourceSha256:shared.sourceSha256});assert(published.treeStatus==='searchable');
 const sharedRevision=await createKnowledgeUploadJob(owner,{...sharedInput,bytes:await readFile(resolve(fixtureRoot,'revision.pdf')),revisionDocumentId:published.documentId,revisionBaseVersionId:published.versionId});await worker(sharedRevision.id);
 assert.equal((await getDoc(published.documentId)).current_tree_version_id,published.versionId);assert.equal((await getJob(sharedRevision.id)).status,'extracted');
 await pool.query("update app_user set role='member' where id=$1",[owner]);
 await assert.rejects(()=>registerVectorlessUpload(owner,sharedRevision.id,{language:'en',authorityLevel:3,expectedSourceSha256:sharedRevision.sourceSha256}),/administrator/);
 await pool.query("update app_user set role='admin' where id=$1",[owner]);
 await assert.rejects(()=>registerVectorlessUpload(owner,sharedRevision.id,{language:'en',authorityLevel:3,expectedSourceSha256:'0'.repeat(64)}),/source hash/);
 const approved=await registerVectorlessUpload(owner,sharedRevision.id,{language:'en',authorityLevel:3,expectedSourceSha256:sharedRevision.sourceSha256});assert.equal(approved.documentId,published.documentId);assert(approved.treeStatus==='searchable');assert.notEqual(approved.versionId,published.versionId);
 const revoked=await createKnowledgeUploadJob(owner,{...sharedInput,bytes:await readFile(resolve(fixtureRoot,'conflict.pdf')),revisionDocumentId:approved.documentId,revisionBaseVersionId:approved.versionId});await worker(revoked.id);
 await pool.query("update knowledge_asset set registration_status='withdrawn' where id=$1",[approved.assetId]);
 await assert.rejects(()=>registerVectorlessUpload(owner,revoked.id,{language:'en',authorityLevel:3,expectedSourceSha256:revoked.sourceSha256}),/Active owned/);
 assert.equal((await getDoc(approved.documentId)).current_tree_version_id,approved.versionId);
 assert.equal((await listKnowledgeUploadJobs(owner,0,50)).find(job=>job.id===sharedRevision.id)?.treeStatus,'unavailable');
 assert.equal(sha((await pool.query('select * from knowledge_release_pointer_v3 order by scope_kind,owner_id')).rows),pointerBefore);
 assert.equal(sha((await pool.query('select id,current_tree_version_id,metadata from knowledge_document where owner_id is distinct from $1 order by id',[owner])).rows),unrelatedBefore);
 await writeFile('tmp/binary-revision-result.json',JSON.stringify({cloneOnly:true,modelCalls:0,externalCalls:0,results,sharedExplicitAdminPublication:true,approvalHashMismatchRejected:true,revocationBeforePublicationRejected:true,jobHistoryStatus:true,v3PointersUnchanged:true,unrelatedDocumentsUnchanged:true},null,2));console.log(JSON.stringify({passed:true,formats:results.length}));
}finally{
 await pool.query('delete from knowledge_upload_job where user_id=any($1::uuid[])',[owners]);await pool.query('update knowledge_document set current_tree_version_id=null where owner_id=any($1::uuid[])',[owners]);
 await pool.query('delete from knowledge_document where owner_id=any($1::uuid[])',[owners]);await pool.query('delete from app_user where id=any($1::uuid[])',[owners]);await pool.end();await getPool().end();
 for(const root of [...owners.map(id=>resolve('knowledge/uploads',id)),fixtureRoot]){
  assert(root.startsWith(resolve('knowledge/uploads')+sep)||root.startsWith(resolve('tmp/binary-revisions')+sep));
  for(const name of await readdir(root).catch(()=>[])){const file=resolve(root,name);assert(file.startsWith(root+sep));await rm(file,{force:true});}await rmdir(root).catch(()=>undefined);
 }
}
