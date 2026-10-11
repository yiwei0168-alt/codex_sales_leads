import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,readdir,rm,rmdir} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {createKnowledgeUploadJob} from '../src/lib/knowledge/upload';
import {getExtractionReview,getExtractionReviewImage,recordExtractionReview,completeExtractionReview} from '../src/lib/knowledge/extraction-review';
import {readEvidence} from '../src/lib/knowledge/vectorless';
import {runBoundedLocalProcess} from './lib/run-bounded-local-process';
nextEnv.loadEnvConfig(process.cwd());
const base=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;assert(base);
const url=new URL(base);assert(['localhost','127.0.0.1','::1'].includes(url.hostname));
const {database}=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8'));assert(/^ma11_replay_[a-f0-9]{12}$/.test(database));
url.pathname=`/${database}`;process.env.DATABASE_URL=url.toString();
const pool=new Pool({connectionString:url.toString()}),owner=randomUUID(),other=randomUUID();
const xlsx=process.argv.includes('--xlsx');
const complete=process.argv.includes('--complete-reviews');
try{
 for(const id of [owner,other])await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'PDF preview fixture','!','member','active')",[id,`${id}@example.invalid`]);
 const pointers=JSON.stringify((await pool.query('select * from knowledge_release_pointer_v3 order by scope_kind,owner_id')).rows);
 // Real registered development original, deliberately not a new independent sample.
 const input={collection:'industry' as const,title:'Visual preview fixture',originalFilename:xlsx?'source.xlsx':'source.pdf',mimeType:xlsx?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/pdf',bytes:await readFile(xlsx?'tmp/xlsx-visual-local/source.xlsx':'knowledge/product/Bluetooth USB Adapter/BU530C_V1.0__Datasheet.pdf'),visibility:'private' as const};
 const job=await createKnowledgeUploadJob(owner,input);
 const run=(script:string)=>runBoundedLocalProcess(process.execPath,['--require','./scripts/patch-node-user.cjs','--import','tsx',script,`--job-id=${job.id}`,'--limit=1'],120000);
 await run('scripts/process-knowledge-upload-jobs.ts');
 const before=await getExtractionReview(owner,job.id);assert(before.total>0);assert.equal(before.visualState,'pending');
 await run('scripts/process-upload-visual-queue.ts');
 const after=await getExtractionReview(owner,job.id);assert.equal(after.visualState,'ready');assert.equal(after.resolved,0);
 for(const item of after.blocks){
  if(xlsx){
   assert.equal(item.candidate?.sheetName,'Chart');assert.equal(item.candidate?.sheetObjects?.length,2);
   assert(Array.isArray(item.candidate.sheetObjects[1].images?.[0].ocrLines));
   const bytes=await getExtractionReviewImage(owner,job.id,after.artifactSha256,item.block.id,2,1);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
   await assert.rejects(()=>getExtractionReviewImage(owner,job.id,after.artifactSha256,item.block.id,1,1));
   await assert.rejects(()=>getExtractionReviewImage(other,job.id,after.artifactSha256,item.block.id,2,1));continue;
  }
  assert.equal(item.candidate?.coordinateSpace,'pdf-page-render');
  assert(Array.isArray(item.candidate?.ocrLines));
  const image=await getExtractionReviewImage(owner,job.id,after.artifactSha256,item.block.id);assert(image);
 }
 await assert.rejects(()=>getExtractionReview(other,job.id));
 await assert.rejects(()=>getExtractionReviewImage(owner,job.id,'0'.repeat(64),after.blocks[0].block.id));
 assert.equal((await pool.query('select published_document_id from knowledge_upload_job where id=$1',[job.id])).rows[0].published_document_id,null);
 let indexedReviewBlocks=0;
 if(complete){
  for(let offset=0;offset<after.total;offset+=20){
   const page=await getExtractionReview(owner,job.id,offset);
   for(const item of page.blocks)await recordExtractionReview(owner,{jobId:job.id,artifactSha256:page.artifactSha256,blockId:item.block.id,expectedRevision:0,decision:'evidence',evidenceText:`Synthetic workflow marker ${item.block.id}`,note:'Isolated clone synthetic judgment; not content quality acceptance'});
  }
  const reviewed=await getExtractionReview(owner,job.id);assert.equal(reviewed.resolved,after.total);
  const receipt=await completeExtractionReview(owner,job.id,reviewed.artifactSha256,reviewed.decisionSha256);assert(receipt.readyForRegistration);
  await run('scripts/process-knowledge-upload-jobs.ts');
  const registered=(await pool.query('select status,published_document_id from knowledge_upload_job where id=$1',[job.id])).rows[0];assert.equal(registered.status,'registered');assert(registered.published_document_id);
  const nodes=(await pool.query("select n.id from knowledge_tree_node n join knowledge_document d on d.current_tree_version_id=n.version_id where d.id=$1 and n.content like 'Synthetic workflow marker %'",[registered.published_document_id])).rows;
  assert.equal(nodes.length,after.total);
  for(const node of nodes){
   const evidence=await readEvidence(owner,node.id);assert(evidence);
   const location=evidence.source_location as {unitType:string;unitIndex:number;bbox:unknown;sheetName?:string;visualReference?:unknown;extractionReview:{receiptId:string}};
   assert.equal(location.extractionReview.receiptId,receipt.receiptId);assert.equal(location.unitType,xlsx?'sheet':'page');assert(location.unitIndex>0);
   if(xlsx){assert.equal(location.sheetName,'Chart');assert(location.visualReference);}else assert(Array.isArray(location.bbox));
   assert.equal(await readEvidence(other,node.id),null);indexedReviewBlocks++;
  }
  const replay=await completeExtractionReview(owner,job.id,reviewed.artifactSha256,reviewed.decisionSha256);assert(replay.reused);assert.equal(replay.receiptId,receipt.receiptId);assert.equal(replay.status,'registered');
  await run('scripts/process-knowledge-upload-jobs.ts');
  assert.equal((await pool.query('select count(*)::int as n from knowledge_document where owner_id=$1',[owner])).rows[0].n,1);
  assert.equal((await pool.query('select count(*)::int as n from knowledge_upload_review_completion where job_id=$1',[job.id])).rows[0].n,1);
 }
 assert.equal(JSON.stringify((await pool.query('select * from knowledge_release_pointer_v3 order by scope_kind,owner_id')).rows),pointers);
 const result={cloneOnly:true,actualWorkerAndQueue:true,pages:after.total,previewReady:true,imageReadsVerified:true,nestedImageReadsVerified:xlsx,otherAccountDenied:true,staleHashDenied:true,automaticJudgments:0,syntheticJudgments:complete,contentQualityAccepted:false,indexedReviewBlocks,completionReplayVerified:complete,documentsPublished:complete?1:0,v3PointersUnchanged:true,externalCalls:0};
 await writeFile(complete?`tmp/${xlsx?'xlsx':'pdf'}-review-index-result.json`:xlsx?'tmp/xlsx-native-clone-result.json':'tmp/pdf-preview-clone-result.json',JSON.stringify({...result,format:xlsx?'xlsx':'pdf',syntheticFixture:xlsx},null,2));console.log(JSON.stringify({...result,format:xlsx?'xlsx':'pdf'}));
}finally{
 await pool.query('delete from knowledge_upload_review_completion where owner_id=$1',[owner]);
 await pool.query('delete from knowledge_upload_extraction_review where owner_id=$1',[owner]);
 await pool.query('delete from knowledge_upload_job where user_id=$1',[owner]);
 await pool.query('update knowledge_document set current_tree_version_id=null where owner_id=$1',[owner]);
 await pool.query('delete from knowledge_tree_node where version_id in(select v.id from knowledge_tree_version v join knowledge_document d on d.id=v.document_id where d.owner_id=$1)',[owner]);
 await pool.query('delete from knowledge_tree_version where document_id in(select id from knowledge_document where owner_id=$1)',[owner]);
 await pool.query('delete from knowledge_document_revision where user_id=$1',[owner]);
 await pool.query('delete from knowledge_document where owner_id=$1',[owner]);
 await pool.query('delete from app_user where id=any($1::uuid[])',[[owner,other]]);await pool.end();await getPool().end();
 const root=resolve('knowledge/uploads',owner);assert(root.startsWith(resolve('knowledge/uploads')+sep));
 for(const name of await readdir(root).catch(()=>[])){const path=resolve(root,name);assert(path.startsWith(root+sep));await rm(path,{recursive:true,force:true});}await rmdir(root).catch(()=>undefined);
}
