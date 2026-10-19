import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {registerVectorlessUpload} from '../src/lib/knowledge/vectorless-registration';
import {indexExtractedDocument} from '../src/lib/knowledge/vectorless';
import {deriveReviewedExtraction} from '../src/lib/knowledge/reviewed-extraction';

nextEnv.loadEnvConfig(process.cwd());
const configured=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;assert(configured);
const url=new URL(configured);assert(['localhost','127.0.0.1','::1'].includes(url.hostname));
const state=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8'));
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));url.pathname=`/${state.database}`;process.env.DATABASE_URL=url.toString();
globalThis.fetch=async()=>{throw new Error('External HTTP disabled for synthetic publication race fixture');};
const mutation=process.env.MA24_PUBLICATION_MUTATION??'original';assert(['original','artifact','review'].includes(mutation));
const pool=new Pool({connectionString:url.toString()}),owners:string[]=[],directories:string[]=[],results:unknown[]=[],treeResults:unknown[]=[];
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
try{
 for(const visibility of ['private','shared'] as const)for(const revision of [false,true]){
  const owner=randomUUID();owners.push(owner);
  await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Synthetic publication race','!','admin','active')",[owner,`${owner}@example.invalid`]);
  const directory=resolve('knowledge',`ma24-publication-race-${owner}`);assert(directory.startsWith(resolve('knowledge')+sep));
  directories.push(directory);await mkdir(directory,{recursive:true});
  const makeJob=async(label:string,target?:{documentId:string;versionId:string})=>{
   const id=randomUUID(),bytes=Buffer.from(`Synthetic ${label} original; not a parsed business source.`),sourceHash=sha(bytes);
   const storageKey=`knowledge/ma24-publication-race-${owner}/${id}.txt`,artifactKey=`knowledge/ma24-publication-race-${owner}/${id}.json`;
   const originalArtifact=Buffer.from(JSON.stringify({documents:[{sourceSha256:sourceHash,extractorVersion:'synthetic-race-v1',blocks:[{id:'document-1',unitType:'document',unitIndex:1,blockType:'paragraph',quality:'success',text:`Synthetic ${label} evidence`},...(mutation==='review'?[{id:'visual',unitType:'document',unitIndex:1,quality:'pending-ocr'}]:[])]}]}));
   const receiptId=randomUUID(),originalKey=`knowledge/ma24-publication-race-${owner}/${id}.original.json`;
   const judgment={block_id:'visual',revision:1,decision:'decoration',evidence_text:'',source_sha256:sourceHash,extractor_version:'synthetic-race-v1'};
   const artifact=mutation==='review'?deriveReviewedExtraction(originalArtifact,{receiptId,sourceSha256:sourceHash,artifactSha256:sha(originalArtifact),extractorVersion:'synthetic-race-v1'},[judgment]):originalArtifact;
   await writeFile(storageKey,bytes);await writeFile(artifactKey,artifact);
   await pool.query(`insert into knowledge_upload_job(id,user_id,collection_slug,status,title,original_filename,storage_key,extraction_artifact_key,mime_type,byte_size,source_sha256,visibility,extractor_version,metrics,revision_target_document_id,revision_base_version_id)
    values($1,$2,'industry','extracted','Synthetic publication race','original.txt',$3,$4,'text/plain',$5,$6,$7,'synthetic-race-v1',$8,$9,$10)`,
    [id,owner,storageKey,artifactKey,bytes.length,sourceHash,visibility,JSON.stringify({artifactSha256:sha(artifact)}),target?.documentId??null,target?.versionId??null]);
   const restoreReview=async()=>{
    await pool.query(`insert into knowledge_upload_review_completion(id,owner_id,job_id,source_sha256,original_artifact_key,original_artifact_sha256,reviewed_artifact_key,reviewed_artifact_sha256,extractor_version)
     values($1,$2,$3,$4,$5,$6,$7,$8,'synthetic-race-v1')`,[receiptId,owner,id,sourceHash,originalKey,sha(originalArtifact),artifactKey,sha(artifact)]);
   };
   if(mutation==='review'){
    await writeFile(originalKey,originalArtifact);
    await pool.query(`insert into knowledge_upload_extraction_review(owner_id,job_id,source_sha256,artifact_sha256,extractor_version,block_id,revision,decision,evidence_text,note,source_location,reviewer_id)
     values($1,$2,$3,$4,'synthetic-race-v1','visual',1,'decoration','','Synthetic fixture decision only','{}',$1)`,[owner,id,sourceHash,sha(originalArtifact)]);
    await restoreReview();
   }
   return {id,bytes,storageKey,artifactKey,restoreReview};
  };
  let target:{documentId:string;versionId:string}|undefined;
  if(revision){
   const base=await makeJob('baseline'),saved=await registerVectorlessUpload(owner,base.id,{language:'en',authorityLevel:3});
   assert.equal(saved.treeStatus,'searchable');assert('versionId' in saved&&saved.versionId);target={documentId:saved.documentId,versionId:saved.versionId!};
  }
  const job=await makeJob('candidate',target);
  const snapshot=async()=>(await pool.query(`select
   (select count(*)::int from knowledge_document where owner_id=$1) documents,
   (select count(*)::int from knowledge_asset a join knowledge_document d on d.id=a.document_id where d.owner_id=$1) assets,
   (select count(*)::int from knowledge_tree_version v join knowledge_document d on d.id=v.document_id where d.owner_id=$1) trees,
   (select count(*)::int from knowledge_document_revision r join knowledge_document d on d.id=r.document_id where d.owner_id=$1) revisions,
   (select current_tree_version_id from knowledge_document where id=$2 and owner_id=$1) pointer`,[owner,target?.documentId??null])).rows[0];
  const changedPath=mutation==='original'?job.storageKey:job.artifactKey,changedBytes=await readFile(changedPath);
  const before=await snapshot(),holder=await pool.connect();
  let pending:Promise<{value?:unknown;error?:unknown}>|undefined;
  try{
   await holder.query('begin');const pid=Number((await holder.query('select pg_backend_pid() pid')).rows[0].pid);
   await holder.query('select id from knowledge_upload_job where id=$1 and user_id=$2 for update',[job.id,owner]);
   pending=registerVectorlessUpload(owner,job.id,{language:'en',authorityLevel:3}).then(value=>({value}),error=>({error}));
   let waiting=false;
   for(let attempt=0;attempt<200;attempt++){
    const row=(await pool.query(`select count(*)::int n from pg_stat_activity where $1=any(pg_blocking_pids(pid)) and query like '%knowledge_upload_job%'`,[pid])).rows[0];
    if(row.n>0){waiting=true;break;}await new Promise(done=>setTimeout(done,25));
   }
   assert(waiting,'Publication did not reach the locked job after initial original inspection');
   if(mutation==='review')await pool.query('delete from knowledge_upload_review_completion where job_id=$1 and owner_id=$2',[job.id,owner]);
   else await writeFile(changedPath,Buffer.alloc(changedBytes.length,120));
   await holder.query('rollback');
   const outcome=await pending;
   assert(outcome.error instanceof Error);assert.match(outcome.error.message,mutation==='review'?/Invalid extraction review receipt/:/Knowledge asset no longer matches approved hash/);
   assert.deepEqual(await snapshot(),before,'Rejected publication committed document/asset/tree/revision changes');
   const saved=(await pool.query('select status,published_document_id,published_asset_id from knowledge_upload_job where id=$1',[job.id])).rows[0];
   assert.deepEqual(saved,{status:'extracted',published_document_id:null,published_asset_id:null});
   await writeFile(changedPath,changedBytes);
   if(mutation==='review')await job.restoreReview();
   assert.equal((await registerVectorlessUpload(owner,job.id,{language:'en',authorityLevel:3})).treeStatus,'searchable');
   results.push({visibility,revision,changed:mutation,initialReadCompletedBeforeObservedRowWait:true,equalSizeMutationAfterWait:mutation!=='review',reviewReceiptDeletedAfterWait:mutation==='review',lateHashRejected:mutation!=='review',lateReviewRejected:mutation==='review',allPublicationRowsRolledBack:true,oldPointerPreserved:revision,retryAfterRestorePassed:true});
  }finally{
   await holder.query('rollback');holder.release();if(pending)await pending;await writeFile(changedPath,changedBytes);
  }
  for(const changed of ['original','artifact',...(mutation==='review'?['review' as const]:[])] as const){
   const registered=(await pool.query('select published_document_id document_id from knowledge_upload_job where id=$1',[job.id])).rows[0];
   const documentId=registered.document_id;
   const current=(await pool.query('select current_tree_version_id version_id from knowledge_document where id=$1 and owner_id=$2',[documentId,owner])).rows[0];
   // Only this disposable synthetic candidate: force an unindexed state so the
   // test must insert new tree rows, not merely reuse an already complete tree.
   assert(current?.version_id);await pool.query('update knowledge_document set current_tree_version_id=null where id=$1 and owner_id=$2',[documentId,owner]);
   await pool.query('delete from knowledge_tree_version where id=$1 and document_id=$2',[current.version_id,documentId]);
   const beforeTree=await snapshot(),path=changed==='original'?job.storageKey:job.artifactKey,bytes=await readFile(path);
   const treeHolder=await pool.connect();let indexing:Promise<{value?:unknown;error?:unknown}>|undefined;
   try{
    await treeHolder.query('begin');const pid=Number((await treeHolder.query('select pg_backend_pid() pid')).rows[0].pid);
    await treeHolder.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[documentId]);
    indexing=indexExtractedDocument(owner,job.id).then(value=>({value}),error=>({error}));
    let waiting=false;
    for(let attempt=0;attempt<200;attempt++){
     const row=(await pool.query(`select count(*)::int n from pg_stat_activity where $1=any(pg_blocking_pids(pid)) and query like '%pg_advisory_xact_lock%'`,[pid])).rows[0];
     if(row.n>0){waiting=true;break;}await new Promise(done=>setTimeout(done,25));
    }
    assert(waiting,'Tree indexing did not reach its advisory wait after source/artifact inspection');
    if(changed==='review')await pool.query('delete from knowledge_upload_review_completion where job_id=$1 and owner_id=$2',[job.id,owner]);
    else await writeFile(path,Buffer.alloc(bytes.length,120));
    await treeHolder.query('rollback');
    const outcome=await indexing;assert(outcome.error instanceof Error);assert.match(outcome.error.message,changed==='review'?/Invalid extraction review receipt/:/Knowledge asset no longer matches approved hash/);
    assert.deepEqual(await snapshot(),beforeTree,'Rejected indexing committed candidate tree rows');
    assert.equal((await pool.query('select current_tree_version_id from knowledge_document where id=$1',[documentId])).rows[0].current_tree_version_id,null);
    await writeFile(path,bytes);if(changed==='review')await job.restoreReview();
    assert.equal((await indexExtractedDocument(owner,job.id)).reused,false);
    treeResults.push({visibility,revision,changed,observedWaitAfterInitialInspection:true,newTreeRowsAndPointerRolledBack:true,retryAfterRestorePassed:true,fixtureStartedWithNullPointer:true});
   }finally{await treeHolder.query('rollback');treeHolder.release();if(indexing)await indexing;await writeFile(path,bytes);}
  }
 }
 const result={binaryPublicationRaceClone:'passed',cases:results,treeCases:treeResults,actualModelCalls:0,syntheticExtraction:true,qualityAccepted:false,productionQualificationGranted:false,automaticActivation:false};
 await writeFile('tmp/ma24-binary-publication-race-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{
 for(const owner of owners){
  await pool.query('delete from knowledge_upload_review_completion where owner_id=$1',[owner]);
  await pool.query('delete from knowledge_upload_extraction_review where owner_id=$1',[owner]);
  await pool.query('delete from knowledge_upload_job where user_id=$1',[owner]);
  await pool.query('delete from knowledge_document where owner_id=$1',[owner]);
  await pool.query('delete from app_user where id=$1',[owner]);
  assert.equal(Number((await pool.query('select count(*) n from app_user where id=$1',[owner])).rows[0].n),0);
 }
 await pool.end();await getPool().end();
 for(const directory of directories){assert(directory.startsWith(resolve('knowledge')+sep)&&/^ma24-publication-race-[a-f0-9-]+$/.test(directory.split(/[\\/]/).at(-1)!));await rm(directory,{recursive:true,force:true});}
}
