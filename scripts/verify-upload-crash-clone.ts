import assert from 'node:assert/strict';
import {spawn, type ChildProcess} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {readFile, readdir, mkdir, rm, rmdir, writeFile} from 'node:fs/promises';
import {basename, resolve, sep} from 'node:path';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {createKnowledgeUploadJob} from '../src/lib/knowledge/upload';
import {registerVectorlessUpload} from '../src/lib/knowledge/vectorless-registration';
import {browseTree, readEvidence, indexExtractedDocument} from '../src/lib/knowledge/vectorless';

nextEnv.loadEnvConfig(process.cwd());
const base=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
assert(base&&['localhost','127.0.0.1','::1'].includes(new URL(base).hostname));
const state=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8')) as {database:string};
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));
const url=new URL(base);url.pathname=`/${state.database}`;process.env.DATABASE_URL=url.toString();
const pool=new Pool({connectionString:url.toString()}),owner=randomUUID();
const accountRoot=resolve('knowledge/uploads',owner),markerRoot=resolve('tmp/upload-crash');
const children=new Set<ChildProcess>();
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const snapshot=async()=>hash((await pool.query(`select id,current_tree_version_id,content_sha256,status from knowledge_document where owner_id is distinct from $1 order by id`,[owner])).rows);
const pointers=async()=>hash((await pool.query('select * from knowledge_release_pointer_v3 order by scope_kind,owner_id')).rows);
const publicDevelopmentSamples=process.argv.includes('--public-development-samples');
const samples=publicDevelopmentSamples?[
 {path:'tmp/ma24-public-eval-candidates/itu-handbook-2020.pdf',unit:'page',mime:'application/pdf'},
 {path:'tmp/ma24-public-eval-candidates/itu-satellite-2025.pptx',unit:'slide',mime:'application/vnd.openxmlformats-officedocument.presentationml.presentation'},
 {path:'tmp/ma24-public-eval-candidates/itu-ict-2025.xlsx',unit:'sheet',mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},
]:[
 {path:'knowledge/product/Bluetooth USB Adapter/BU530C_V1.0__Datasheet.pdf',unit:'page',mime:'application/pdf'},
 {path:'knowledge/industry/网络产品品牌与行业研究报告.pptx',unit:'slide',mime:'application/vnd.openxmlformats-officedocument.presentationml.presentation'},
 {path:'knowledge/product/Cudy products list.xlsx',unit:'sheet',mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},
];
function worker(job:string,phase?:string,marker?:string){
 const child=spawn(process.execPath,['--require','./scripts/patch-node-user.cjs',...(phase?['--require','./scripts/fixtures/upload-crash-preload.cjs']:[]),
 '--import','tsx','scripts/process-knowledge-upload-jobs.ts',`--job-id=${job}`,'--limit=1'],{cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe'],
 env:{...process.env,DATABASE_URL:url.toString(),UPLOAD_CRASH_PHASE:phase,UPLOAD_CRASH_MARKER:marker}});
 children.add(child);let stdout='',stderr='';
 child.stdout.on('data',part=>{stdout+=part;});child.stderr.on('data',part=>{stderr+=part;});
 const timer=setTimeout(()=>child.kill(),180_000);
 const exited=new Promise<{code:number|null;stdout:string;stderr:string}>((done,reject)=>{
  child.once('error',error=>{clearTimeout(timer);children.delete(child);reject(error);});
  child.once('exit',code=>{clearTimeout(timer);children.delete(child);done({code,stdout,stderr});});
 });return {child,exited};
}
async function normal(job:string,completed:number,failed=0){
 const result=await worker(job).exited;assert.equal(result.code,0,result.stderr.slice(-1000));
 assert.deepEqual(JSON.parse(result.stdout),{inputJobs:completed+failed,completed,failed,embeddingCalls:0,modelCalls:0,externalCalls:0});
}
async function crash(job:string,phase:string){
 const marker=resolve(markerRoot,`${randomUUID()}.json`),run=worker(job,phase,marker);
 try{
  let reached=false;
  for(let attempt=0;attempt<900;attempt++){
   const data=await readFile(marker,'utf8').catch(()=>null);
   if(data){assert.equal(JSON.parse(data).pid,run.child.pid);reached=true;break;}
   if(run.child.exitCode!==null)break;
   await new Promise(done=>setTimeout(done,100));
  }
  assert(reached,`Checkpoint not reached: ${phase}`);assert(run.child.kill());assert.notEqual((await run.exited).code,0);
 }finally{if(children.has(run.child)){run.child.kill();await run.exited;}await rm(marker,{force:true});}
}
const results:Record<string,unknown>[]=[];
try{
 await mkdir(markerRoot,{recursive:true});
 await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Upload recovery fixture','!','member','active')",[owner,`${owner}@example.invalid`]);
 const before=await snapshot(),releaseBefore=await pointers();
 for(const sample of samples){
  const bytes=await readFile(sample.path);
  for(const phase of ['extracting','extracted','registered','tree-transaction']){
   const job=await createKnowledgeUploadJob(owner,{collection:'industry',title:`Crash ${sample.unit} ${phase}`,originalFilename:basename(sample.path),mimeType:sample.mime,bytes,visibility:'private'});
   await crash(job.id,phase);
   const get=async()=>(await pool.query('select * from knowledge_upload_job where id=$1',[job.id])).rows[0];
   const interrupted=await get();
   assert.equal(interrupted.status,phase==='extracting'?'running':phase==='extracted'?'extracted':'registered');assert(interrupted.lease_token);assert(interrupted.lease_until);
   if(interrupted.published_document_id)assert.equal((await pool.query('select current_tree_version_id from knowledge_document where id=$1',[interrupted.published_document_id])).rows[0].current_tree_version_id,null);
   await normal(job.id,0);
   // Accelerate lease expiry only in the isolated clone; do not weaken production timeout.
   await pool.query("update knowledge_upload_job set lease_until=now()-interval '1 second' where id=$1",[job.id]);
   if(phase!=='extracting')await assert.rejects(()=>registerVectorlessUpload(owner,job.id,{language:'und',authorityLevel:2,leaseToken:interrupted.lease_token}),/lease/);
   await normal(job.id,1);const recovered=await get();
   assert.equal(recovered.status,'registered');assert.equal(recovered.lease_token,null);
   if(phase!=='extracting')assert.equal(recovered.extraction_artifact_key,interrupted.extraction_artifact_key);
   const tree=await browseTree(owner,recovered.published_document_id),unit=tree.find(node=>node.unit_type===sample.unit);assert(unit);
   const leaves=await browseTree(owner,recovered.published_document_id,unit.id);
   const evidence=await readEvidence(owner,leaves[0].id);assert(evidence?.content);assert.equal(evidence.source_location.unitType,sample.unit);
   assert.equal(await readEvidence(randomUUID(),evidence.id),null);
   const versions=await pool.query('select id from knowledge_tree_version where document_id=$1',[recovered.published_document_id]);assert.equal(versions.rowCount,1);
   await assert.rejects(()=>indexExtractedDocument(owner,job.id,interrupted.lease_token),/lease/);
   await normal(job.id,0);
   const replay=await registerVectorlessUpload(owner,job.id,{language:'und',authorityLevel:2});assert.equal(replay.treeStatus,'searchable');assert(replay.treeStatus==='searchable');assert.equal(replay.versionId,versions.rows[0].id);assert(replay.reused);
   await pool.query("update knowledge_asset set registration_status='withdrawn' where id=$1",[recovered.published_asset_id]);
   assert.equal(await readEvidence(owner,evidence.id),null);await normal(job.id,0);
   results.push({format:sample.unit,phase,actualProcessKilled:true,leaseProtected:true,recovered:true,sourceCoordinates:true,singleVersion:true,withdrawnDenied:true});
   console.log(JSON.stringify({format:sample.unit,phase,passed:true}));
  }
 }
 const shared=await createKnowledgeUploadJob(owner,{collection:'industry',title:'Shared approval required',originalFilename:'shared.pdf',mimeType:'application/pdf',bytes:await readFile(samples[0].path),visibility:'shared'});
 await normal(shared.id,1);await normal(shared.id,0);
 assert.equal((await pool.query('select status from knowledge_upload_job where id=$1',[shared.id])).rows[0].status,'extracted');
 await assert.rejects(()=>registerVectorlessUpload(owner,shared.id,{language:'und',authorityLevel:2}),/administrator/);
 const broken=await createKnowledgeUploadJob(owner,{collection:'industry',title:'Invalid PDF',originalFilename:'broken.pdf',mimeType:'application/pdf',bytes:Buffer.from('%PDF-invalid fixture'),visibility:'private'});
 await normal(broken.id,0,1);await normal(broken.id,0);
 assert.equal((await pool.query('select status from knowledge_upload_job where id=$1',[broken.id])).rows[0].status,'failed');
 const damaged=await createKnowledgeUploadJob(owner,{collection:'industry',title:'Changed extraction artifact',originalFilename:'damaged.pdf',mimeType:'application/pdf',bytes:await readFile(samples[0].path),visibility:'private'});
 await crash(damaged.id,'registered');
 const saved=(await pool.query('select extraction_artifact_key,published_document_id from knowledge_upload_job where id=$1',[damaged.id])).rows[0];
 const damagedPath=resolve(saved.extraction_artifact_key);assert(damagedPath.startsWith(accountRoot+sep));await writeFile(damagedPath,'{}');
 await pool.query("update knowledge_upload_job set lease_until=now()-interval '1 second' where id=$1",[damaged.id]);
 await normal(damaged.id,0,1);await normal(damaged.id,0);
 assert.equal((await pool.query('select error_code from knowledge_upload_job where id=$1',[damaged.id])).rows[0].error_code,'tree-index-failed');
 assert.equal((await pool.query('select current_tree_version_id from knowledge_document where id=$1',[saved.published_document_id])).rows[0].current_tree_version_id,null);
 assert.equal(await snapshot(),before);assert.equal(await pointers(),releaseBefore);
 await writeFile(publicDevelopmentSamples?'tmp/upload-public-development-crash-result.json':'tmp/upload-crash-result.json',JSON.stringify({cloneOnly:true,publicDevelopmentSamples,modelCalls:0,externalCalls:0,results,sharedApprovalPreserved:true,parserFailureTerminal:true,damagedArtifactTerminal:true,staleIndexWriterDenied:true,otherDocumentsUnchanged:true,v3PointersUnchanged:true},null,2));
}finally{
 for(const child of children)child.kill();
 await pool.query('delete from knowledge_upload_job where user_id=$1',[owner]);
 await pool.query('update knowledge_document set current_tree_version_id=null where owner_id=$1',[owner]);
 await pool.query('delete from knowledge_tree_node where version_id in(select v.id from knowledge_tree_version v join knowledge_document d on d.id=v.document_id where d.owner_id=$1)',[owner]);
 await pool.query('delete from knowledge_tree_version where document_id in(select id from knowledge_document where owner_id=$1)',[owner]);
 await pool.query('delete from knowledge_document where owner_id=$1',[owner]);
 await pool.query('delete from app_user where id=$1',[owner]);await pool.end();await getPool().end();
 assert(accountRoot.startsWith(resolve('knowledge/uploads')+sep)&&basename(accountRoot)===owner);
 for(const name of await readdir(accountRoot).catch(()=>[])){const file=resolve(accountRoot,name);assert(file.startsWith(accountRoot+sep));await rm(file,{force:true});}
 await rmdir(accountRoot).catch(()=>undefined);
}
