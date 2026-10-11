import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFile,readdir,rm,rmdir,writeFile} from 'node:fs/promises';
import {basename,resolve,sep} from 'node:path';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {createKnowledgeUploadJob,type KnowledgeUploadInput} from '../src/lib/knowledge/upload';
import {browseTree,readEvidence} from '../src/lib/knowledge/vectorless';

nextEnv.loadEnvConfig(process.cwd());
const base=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
assert(base&&['localhost','127.0.0.1','::1'].includes(new URL(base).hostname));
const {database}=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8')) as {database:string};assert(/^ma11_replay_[a-f0-9]{12}$/.test(database));
const url=new URL(base);url.pathname=`/${database}`;process.env.DATABASE_URL=url.toString();
const pool=new Pool({connectionString:url.toString()}),owners=[randomUUID(),randomUUID()],owner=owners[0];
async function processJob(id:string,expectedFailed=0){
 const child=spawn(process.execPath,['--require','./scripts/patch-node-user.cjs','--import','tsx','scripts/process-knowledge-upload-jobs.ts',`--job-id=${id}`,'--limit=1'],
  {windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,DATABASE_URL:url.toString()}});
 let stdout='',stderr='';child.stdout.on('data',data=>{stdout+=data;});child.stderr.on('data',data=>{stderr+=data;});
 const timer=setTimeout(()=>child.kill(),180_000);
 try{await new Promise<void>((done,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?done():reject(new Error(stderr.slice(-1000))));});}
 finally{clearTimeout(timer);}
 const result=JSON.parse(stdout);assert.equal(result.failed,expectedFailed);assert.equal(result.completed,1-expectedFailed);
}
const samples=[
 {path:'knowledge/product/Bluetooth USB Adapter/BU530C_V1.0__Datasheet.pdf',mime:'application/pdf'},
 {path:'knowledge/industry/网络产品品牌与行业研究报告.pptx',mime:'application/vnd.openxmlformats-officedocument.presentationml.presentation'},
 {path:'knowledge/product/Cudy products list.xlsx',mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},
];
const results=[];
try{
 for(const id of owners)await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Dedup fixture','!','admin','active')",[id,`${id}@example.invalid`]);
 for(const sample of samples){
  const input:KnowledgeUploadInput={collection:'industry',title:'Original upload title',originalFilename:basename(sample.path),mimeType:sample.mime,bytes:await readFile(sample.path),visibility:'private'};
  const batch=await Promise.all(Array.from({length:8},()=>createKnowledgeUploadJob(owner,input)));
  assert.equal(new Set(batch.map(job=>job.id)).size,1);assert.equal(batch.filter(job=>!job.reused).length,1);
  const id=batch[0].id;
  assert.equal((await pool.query('select count(*)::int as n from knowledge_upload_job where user_id=$1 and source_sha256=$2',[owner,batch[0].sourceSha256])).rows[0].n,1);
  const files=await readdir(resolve('knowledge/uploads',owner));assert.equal(files.filter(file=>file.startsWith(id)).length,1);
  const renamed=await createKnowledgeUploadJob(owner,{...input,title:'Different title',originalFilename:`renamed.${input.originalFilename.split('.').at(-1)}`});
  assert(renamed.reused);assert.equal(renamed.id,id);
  assert.equal((await pool.query('select title from knowledge_upload_job where id=$1',[id])).rows[0].title,input.title);
  await processJob(id);
  const ready=await createKnowledgeUploadJob(owner,input);assert(ready.reused);assert.equal(ready.id,id);assert.equal(ready.status,'registered');
  const saved=(await pool.query('select published_document_id,published_asset_id,extractor_version from knowledge_upload_job where id=$1',[id])).rows[0];
  const tree=await browseTree(owner,saved.published_document_id),leaves=await browseTree(owner,saved.published_document_id,tree[0].id);
  assert((await readEvidence(owner,leaves[0].id))?.content);
  assert.equal((await pool.query('select count(*)::int as n from knowledge_tree_version where document_id=$1',[saved.published_document_id])).rows[0].n,1);
  // Same bytes never merge across accounts, collection, visibility, entity or provenance.
  const scoped=await Promise.all([
   createKnowledgeUploadJob(owners[1],input),createKnowledgeUploadJob(owner,{...input,collection:'company'}),
   createKnowledgeUploadJob(owner,{...input,visibility:'shared'}),createKnowledgeUploadJob(owner,{...input,entityKey:'OTHER'}),
   createKnowledgeUploadJob(owner,{...input,sourceUrl:'https://example.invalid/source'}),
  ]);assert(scoped.every(job=>!job.reused&&job.id!==id));assert.equal(new Set(scoped.map(job=>job.id)).size,5);
  await pool.query("update knowledge_upload_job set extractor_version='previous-extractor' where id=$1",[id]);
  const upgraded=await createKnowledgeUploadJob(owner,input);assert(!upgraded.reused);assert.notEqual(upgraded.id,id);
  await pool.query('update knowledge_upload_job set extractor_version=$2 where id=$1',[id,saved.extractor_version]);
  // Remove the new pending duplicate fixture so withdrawal specifically exercises the registered job.
  await pool.query("update knowledge_upload_job set status='failed' where id=$1",[upgraded.id]);
  await pool.query("update knowledge_asset set registration_status='withdrawn' where id=$1",[saved.published_asset_id]);
  const afterWithdrawal=await createKnowledgeUploadJob(owner,input);assert(!afterWithdrawal.reused);assert.notEqual(afterWithdrawal.id,id);
  assert.equal(await readEvidence(owner,leaves[0].id),null);
  assert.equal((await pool.query('select registration_status from knowledge_asset where id=$1',[saved.published_asset_id])).rows[0].registration_status,'withdrawn');
  results.push({format:input.originalFilename.split('.').at(-1),concurrentUploads:8,createdJobs:1,originalFiles:1,treeVersions:1,metadataPreserved:true,scopesSeparated:5,extractorVersionsSeparated:true,withdrawnNotReactivated:true});
 }
 const bytes=await readFile(samples[0].path);
 const corruptInput:KnowledgeUploadInput={collection:'industry',title:'Corrupted original',originalFilename:'corrupt.pdf',mimeType:'application/pdf',bytes,visibility:'private',entityKey:'corrupt-original'};
 const corrupt=await createKnowledgeUploadJob(owner,corruptInput);
 const file=resolve('knowledge/uploads',owner,`${corrupt.id}.pdf`);assert(file.startsWith(resolve('knowledge/uploads',owner)+sep));await writeFile(file,'%PDF-damaged');
 await assert.rejects(()=>createKnowledgeUploadJob(owner,corruptInput),/original changed/);
 const changedVersion=await createKnowledgeUploadJob(owner,{...corruptInput,entityKey:'extractor-drift'});
 await pool.query(`update knowledge_upload_job set metrics=jsonb_set(metrics,'{requestedExtractorVersion}','"different-version"') where id=$1`,[changedVersion.id]);
 await processJob(changedVersion.id,1);
 const rejected=(await pool.query('select status,published_document_id from knowledge_upload_job where id=$1',[changedVersion.id])).rows[0];
 assert.equal(rejected.status,'failed');assert.equal(rejected.published_document_id,null);
 await writeFile('tmp/upload-dedup-result.json',JSON.stringify({cloneOnly:true,modelCalls:0,externalCalls:0,results,changedOriginalRejected:true,queuedExtractorDriftRejected:true},null,2));
 console.log(JSON.stringify({passed:true,formats:results.length,concurrentUploads:24}));
}finally{
 await pool.query('delete from knowledge_upload_job where user_id=any($1::uuid[])',[owners]);
 await pool.query('update knowledge_document set current_tree_version_id=null where owner_id=any($1::uuid[])',[owners]);
 await pool.query('delete from knowledge_tree_node where version_id in(select v.id from knowledge_tree_version v join knowledge_document d on d.id=v.document_id where d.owner_id=any($1::uuid[]))',[owners]);
 await pool.query('delete from knowledge_tree_version where document_id in(select id from knowledge_document where owner_id=any($1::uuid[]))',[owners]);
 await pool.query('delete from knowledge_document where owner_id=any($1::uuid[])',[owners]);
 await pool.query('delete from app_user where id=any($1::uuid[])',[owners]);await pool.end();await getPool().end();
 for(const id of owners){const root=resolve('knowledge/uploads',id);assert(root.startsWith(resolve('knowledge/uploads')+sep)&&basename(root)===id);
  for(const name of await readdir(root).catch(()=>[])){const file=resolve(root,name);assert(file.startsWith(root+sep));await rm(file,{force:true});}await rmdir(root).catch(()=>undefined);}
}
