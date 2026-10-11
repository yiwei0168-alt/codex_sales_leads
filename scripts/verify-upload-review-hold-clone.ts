import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,readdir,rm,rmdir,writeFile,mkdir} from 'node:fs/promises';
import {resolve,sep,basename} from 'node:path';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool,tenantQuery} from '../src/lib/rag/db';
import {createKnowledgeUploadJob,listKnowledgeUploadJobs} from '../src/lib/knowledge/upload';
import {registerVectorlessUpload} from '../src/lib/knowledge/vectorless-registration';
import {getExtractionReview,getExtractionReviewOriginal,getExtractionReviewImage,recordExtractionReview,completeExtractionReview} from '../src/lib/knowledge/extraction-review';
import {readEvidence} from '../src/lib/knowledge/vectorless';

nextEnv.loadEnvConfig(process.cwd());
const base=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
assert(base&&['localhost','127.0.0.1','::1'].includes(new URL(base).hostname));
const state=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8'));
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));
const url=new URL(base);url.pathname=`/${state.database}`;process.env.DATABASE_URL=url.toString();
const pool=new Pool({connectionString:url.toString()}),owner=randomUUID(),other=randomUUID();
const root=resolve('knowledge/uploads',owner);
const reviewCrashes=process.argv.includes('--review-crashes');
assert(!reviewCrashes||process.argv.includes('--complete-reviews'));
async function crashCompletion(jobId:string,artifactSha256:string,decisionSha256:string,phase:string){
  await mkdir('tmp/upload-crash',{recursive:true});const marker=resolve('tmp/upload-crash',`${randomUUID()}.json`);
  const child=spawn(process.execPath,['--require','./scripts/patch-node-user.cjs','--require','./scripts/fixtures/upload-crash-preload.cjs','--import','tsx',
    'scripts/complete-upload-review.ts',`--job-id=${jobId}`,`--user-id=${owner}`,`--artifact-sha=${artifactSha256}`,`--decision-sha=${decisionSha256}`],
    {cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,DATABASE_URL:url.toString(),UPLOAD_CRASH_PHASE:phase,UPLOAD_CRASH_MARKER:marker}});
  let stderr='';child.stdout.on('data',()=>{});child.stderr.on('data',part=>{stderr=(stderr+String(part)).slice(-2000);});
  const exited=new Promise<number|null>((done,reject)=>{child.once('error',reject);child.once('exit',done);});
  try{
    let reached=false;
    for(let i=0;i<400;i++){const bytes=await readFile(marker,'utf8').catch(()=>null);if(bytes){assert.equal(JSON.parse(bytes).pid,child.pid);reached=true;break;}if(child.exitCode!==null)break;await new Promise(done=>setTimeout(done,50));}
    assert(reached,`Completion checkpoint not reached: ${phase}; ${stderr}`);assert(child.kill());assert.notEqual(await exited,0);
    const count=(await pool.query('select count(*)::int as n from knowledge_upload_review_completion where job_id=$1',[jobId])).rows[0].n;
    assert.equal(count,phase==='review-before-commit'?0:1);
  }finally{if(child.exitCode===null&&child.signalCode===null){child.kill();await exited;}await rm(marker,{force:true});}
}
async function worker(id:string){
  return await new Promise<Record<string,number>>((done,reject)=>{
    const child=spawn(process.execPath,['--require','./scripts/patch-node-user.cjs','--import','tsx','scripts/process-knowledge-upload-jobs.ts',`--job-id=${id}`,'--limit=1'],
      {cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,DATABASE_URL:url.toString()}});
    let stdout='',stderr='';const timer=setTimeout(()=>child.kill(),180000);
    child.stdout.on('data',part=>stdout+=part);child.stderr.on('data',part=>stderr+=part);
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',code=>{clearTimeout(timer);if(code!==0)return reject(new Error(stderr.slice(-1000)));try{done(JSON.parse(stdout));}catch(error){reject(error);}});
  });
}
try{
  const exists=await pool.query("select to_regclass('knowledge_upload_extraction_review') as relation");
  if(!exists.rows[0].relation)await pool.query(await readFile('db/migrations/127_upload_extraction_reviews.sql','utf8'));
  const completionTable=await pool.query("select to_regclass('knowledge_upload_review_completion') as relation");
  if(!completionTable.rows[0].relation)await pool.query(await readFile('db/migrations/128_upload_extraction_review_completion.sql','utf8'));
  for(const id of [owner,other])await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Review hold fixture','!','admin','active')",[id,`${id}@example.invalid`]);
  const pointers=JSON.stringify((await pool.query('select * from knowledge_release_pointer_v3 order by scope_kind,owner_id')).rows);
  const bytes=await readFile('tmp/ma24-public-eval-candidates/itu-satellite-2025.pptx');
  for(const visibility of ['private','shared'] as const){
    const input={collection:'industry' as const,title:'Visual review hold',originalFilename:'satellite.pptx',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',bytes,visibility};
    const job=await createKnowledgeUploadJob(owner,input);
    const result=await worker(job.id);assert.equal(result.awaitingReview,1);assert.equal(result.failed,0);assert.equal(result.completed,0);
    const stored=(await pool.query('select * from knowledge_upload_job where id=$1',[job.id])).rows[0];
    assert.equal(stored.status,'extracted');assert.equal(stored.error_code,'extraction-review-required');assert.equal(stored.metrics.unresolvedBlocks,63);
    assert.equal(stored.lease_token,null);assert.equal(stored.lease_until,null);assert.equal(stored.published_document_id,null);
    assert.equal((await listKnowledgeUploadJobs(owner)).find(row=>row.id===job.id)?.treeStatus,'review-required');
    assert(!(await listKnowledgeUploadJobs(other)).some(row=>row.id===job.id));
    const repeated=await createKnowledgeUploadJob(owner,input);assert.equal(repeated.id,job.id);assert(repeated.reused);
    assert.equal((await worker(job.id)).inputJobs,0);
    if(process.argv.includes('--visual-candidates')&&visibility==='private'){
      await new Promise<void>((done,reject)=>{
        const child=spawn(process.execPath,['--require','./scripts/patch-node-user.cjs','--import','tsx','scripts/prepare-upload-visual-review.ts',`--job-id=${job.id}`,`--user-id=${owner}`],{cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,DATABASE_URL:url.toString()}});
        let error='';child.stdout.on('data',()=>{});child.stderr.on('data',part=>{error=(error+String(part)).slice(-2000);});
        child.once('error',reject);child.once('exit',code=>code===0?done():reject(new Error(error)));
      });
      const firstPage=await getExtractionReview(owner,job.id),image=firstPage.blocks.find(row=>row.candidate?.imageFile);assert(image);
      const png=await getExtractionReviewImage(owner,job.id,firstPage.artifactSha256,image.block.id);assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
      await assert.rejects(()=>getExtractionReviewImage(other,job.id,firstPage.artifactSha256,image.block.id),/不存在/);
      await assert.rejects(()=>getExtractionReviewImage(owner,job.id,'0'.repeat(64),image.block.id),/版本已变化/);
      const meta=(await pool.query('select metrics from knowledge_upload_job where id=$1',[job.id])).rows[0].metrics;
      const packagePath=resolve(meta.visualReviewKey);assert(packagePath.startsWith(root+sep));const packageBytes=await readFile(packagePath);
      await writeFile(packagePath,Buffer.concat([packageBytes,Buffer.from(' ')]));
      try{await assert.rejects(()=>getExtractionReview(owner,job.id),/hash mismatch/);}finally{await writeFile(packagePath,packageBytes);}
    }
    const review=await getExtractionReview(owner,job.id);assert.equal(review.total,63);assert.equal(review.blocks.length,20);
    assert.deepEqual((await getExtractionReviewOriginal(owner,job.id,review.artifactSha256)).bytes,bytes);
    await assert.rejects(()=>getExtractionReviewOriginal(other,job.id,review.artifactSha256),/不存在/);
    await assert.rejects(()=>getExtractionReviewOriginal(owner,job.id,'0'.repeat(64)),/版本已变化/);
    await assert.rejects(()=>getExtractionReview(other,job.id),/不存在/);
    const decision={jobId:job.id,artifactSha256:review.artifactSha256,blockId:review.blocks[0].block.id,expectedRevision:0,decision:'unresolved',evidenceText:'',note:'Synthetic development verification; not a human quality approval'};
    await assert.rejects(()=>recordExtractionReview(other,decision),/不存在/);
    await assert.rejects(()=>recordExtractionReview(owner,{...decision,artifactSha256:'0'.repeat(64)}),/版本已变化/);
    await assert.rejects(()=>recordExtractionReview(owner,{...decision,blockId:'not-present'}),/不属于/);
    assert.equal((await recordExtractionReview(owner,decision)).revision,1);
    await assert.rejects(()=>recordExtractionReview(owner,decision),/新的审核/);
    assert.equal((await recordExtractionReview(owner,{...decision,expectedRevision:1})).revision,2);
    const saved=await getExtractionReview(owner,job.id);assert.equal(saved.resolved,0);assert.equal(saved.blocks[0].judgment?.revision,2);
    assert.equal((await pool.query('select count(*)::int as n from knowledge_upload_extraction_review where job_id=$1',[job.id])).rows[0].n,2);
    assert.equal((await tenantQuery(other,'select * from knowledge_upload_extraction_review where job_id=$1',[job.id])).length,0);
    const competing=await Promise.allSettled([recordExtractionReview(owner,{...decision,expectedRevision:2}),recordExtractionReview(owner,{...decision,expectedRevision:2})]);
    assert.equal(competing.filter(result=>result.status==='fulfilled').length,1);
    assert.equal(competing.filter(result=>result.status==='rejected').length,1);
    const originalPath=resolve(stored.storage_key);assert(originalPath.startsWith(root+sep));
    await writeFile(originalPath,Buffer.concat([bytes,Buffer.from('changed')]));
    try{await assert.rejects(()=>getExtractionReview(owner,job.id),/原件已变化/);}finally{await writeFile(originalPath,bytes);}
    await assert.rejects(()=>registerVectorlessUpload(owner,job.id,{language:'und',authorityLevel:2}),/Unresolved extraction/);
    assert.equal((await pool.query('select count(*)::int as n from knowledge_document where owner_id=$1',[owner])).rows[0].n,process.argv.includes('--complete-reviews')&&visibility==='shared'?1:0);
    if(process.argv.includes('--complete-reviews')){
      const current=await getExtractionReview(owner,job.id);
      await assert.rejects(()=>completeExtractionReview(owner,job.id,current.artifactSha256,current.decisionSha256),/未解决/);
      for(let offset=0;offset<current.total;offset+=20){
        const page=await getExtractionReview(owner,job.id,offset);
        for(const item of page.blocks)await recordExtractionReview(owner,{jobId:job.id,artifactSha256:page.artifactSha256,blockId:item.block.id,expectedRevision:item.judgment?.revision??0,
          decision:item.block.id===current.blocks[0].block.id?'evidence':'decoration',evidenceText:item.block.id===current.blocks[0].block.id?'Synthetic review integration marker':'',note:'Synthetic clone workflow test; not document quality acceptance'});
      }
      await assert.rejects(()=>completeExtractionReview(owner,job.id,current.artifactSha256,current.decisionSha256),/记录已变化/);
      const reviewed=await getExtractionReview(owner,job.id);assert.equal(reviewed.resolved,63);
      await assert.rejects(()=>completeExtractionReview(other,job.id,reviewed.artifactSha256,reviewed.decisionSha256),/不存在/);
      if(reviewCrashes)await crashCompletion(job.id,reviewed.artifactSha256,reviewed.decisionSha256,visibility==='private'?'review-before-commit':'review-after-commit');
      const both=await Promise.all([completeExtractionReview(owner,job.id,reviewed.artifactSha256,reviewed.decisionSha256),completeExtractionReview(owner,job.id,reviewed.artifactSha256,reviewed.decisionSha256)]);
      const receipt=both[0];assert(receipt.readyForRegistration);assert.equal(both[0].receiptId,both[1].receiptId);
      assert.equal(both.filter(result=>!result.reused).length,reviewCrashes&&visibility==='shared'?0:1);
      assert.equal((await pool.query('select count(*)::int as n from knowledge_upload_review_completion where job_id=$1',[job.id])).rows[0].n,1);
      await assert.rejects(()=>completeExtractionReview(owner,job.id,reviewed.artifactSha256,'0'.repeat(64)),/记录已变化/);
      const ready=(await pool.query('select * from knowledge_upload_job where id=$1',[job.id])).rows[0];
      assert.equal(ready.error_code,null);assert.notEqual(ready.extraction_artifact_key,stored.extraction_artifact_key);
      assert.equal(createHash('sha256').update(await readFile(resolve(stored.extraction_artifact_key))).digest('hex'),stored.metrics.artifactSha256);
      const derivedPath=resolve(ready.extraction_artifact_key);assert(derivedPath.startsWith(root+sep));const derivedBytes=await readFile(derivedPath);
      const fake=Buffer.from(derivedBytes.toString().replace('Synthetic review integration marker','Unapproved changed text'));
      await writeFile(derivedPath,fake);await pool.query("update knowledge_upload_job set metrics=jsonb_set(metrics,'{artifactSha256}',to_jsonb($2::text)) where id=$1",[job.id,createHash('sha256').update(fake).digest('hex')]);
      await assert.rejects(()=>registerVectorlessUpload(owner,job.id,{language:'und',authorityLevel:2}),/review receipt/);
      await writeFile(derivedPath,derivedBytes);await pool.query("update knowledge_upload_job set metrics=$2 where id=$1",[job.id,ready.metrics]);
      const processed=await worker(job.id);assert.equal(processed.completed,visibility==='private'?1:0);
      const replay=await completeExtractionReview(owner,job.id,reviewed.artifactSha256,reviewed.decisionSha256);assert(replay.reused);assert.equal(replay.receiptId,receipt.receiptId);
      assert.equal(replay.status,visibility==='private'?'registered':'extracted');
      if(visibility==='private'){
        const node=(await pool.query("select n.id from knowledge_tree_node n join knowledge_tree_version v on v.id=n.version_id join knowledge_document d on d.id=v.document_id where d.owner_id=$1 and n.content='Synthetic review integration marker'",[owner])).rows[0];assert(node);
        const evidence=await readEvidence(owner,node.id);assert.equal((evidence?.source_location as {extractionReview:{receiptId:string}}).extractionReview.receiptId,receipt.receiptId);
      }else assert.equal((await pool.query('select status from knowledge_upload_job where id=$1',[job.id])).rows[0].status,'extracted');
    }
  }
  assert.equal(JSON.stringify((await pool.query('select * from knowledge_release_pointer_v3 order by scope_kind,owner_id')).rows),pointers);
  const permissions=(await pool.query("select has_table_privilege('network_copilot_app','knowledge_upload_extraction_review','UPDATE') as update_allowed,has_table_privilege('network_copilot_app','knowledge_upload_extraction_review','DELETE') as delete_allowed")).rows[0];
  assert.equal(permissions.update_allowed,false);assert.equal(permissions.delete_allowed,false);
  const evidence={cloneOnly:true,formats:['PPTX'],privateAndSharedHeld:true,unresolvedBlocksPerJob:63,dedupReused:true,restartDoesNotReclaim:true,otherAccountHidden:true,directRegistrationRejected:true,noDocumentsPublished:!process.argv.includes('--complete-reviews'),privatePublishesOnlyAfterCompletion:process.argv.includes('--complete-reviews'),sharedStillUnpublished:true,v3PointersUnchanged:true,appendOnlyReview:true,staleReviewRejected:true,otherAccountReviewDenied:true,sourceArtifactBound:true,externalCalls:0,modelCalls:0};
  await writeFile(reviewCrashes?'tmp/upload-review-crash-result.json':process.argv.includes('--complete-reviews')?'tmp/upload-review-completion-result.json':process.argv.includes('--visual-candidates')?'tmp/upload-visual-candidate-result.json':'tmp/upload-review-hold-result.json',JSON.stringify({...evidence,completionVerified:process.argv.includes('--complete-reviews'),completionReplayVerified:process.argv.includes('--complete-reviews'),completionProcessesKilled:reviewCrashes?2:0,visualCandidatesVerified:process.argv.includes('--visual-candidates')},null,2));console.log(JSON.stringify(evidence));
}catch(error){console.error(error);throw error;}finally{
  await pool.query('delete from knowledge_upload_review_completion where owner_id=$1',[owner]);
  await pool.query('delete from knowledge_upload_extraction_review where owner_id=$1',[owner]);
  await pool.query('delete from knowledge_upload_job where user_id=$1',[owner]);
  await pool.query('update knowledge_document set current_tree_version_id=null where owner_id=$1',[owner]);
  await pool.query('delete from knowledge_tree_node where version_id in(select v.id from knowledge_tree_version v join knowledge_document d on d.id=v.document_id where d.owner_id=$1)',[owner]);
  await pool.query('delete from knowledge_tree_version where document_id in(select id from knowledge_document where owner_id=$1)',[owner]);
  await pool.query('delete from knowledge_document_revision where user_id=$1',[owner]);
  await pool.query('delete from knowledge_document where owner_id=$1',[owner]);
  await pool.query('delete from app_user where id=any($1::uuid[])',[[owner,other]]);await pool.end();await getPool().end();
  assert(root.startsWith(resolve('knowledge/uploads')+sep)&&basename(root)===owner);
  for(const name of await readdir(root).catch(()=>[])){const file=resolve(root,name);assert(file.startsWith(root+sep));await rm(file,{force:true,recursive:true});}
  await rmdir(root).catch(()=>undefined);
}
