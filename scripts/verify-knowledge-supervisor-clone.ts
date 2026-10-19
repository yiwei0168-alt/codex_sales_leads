import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,mkdtemp,readdir,rm} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {createKnowledgeUploadJob,listKnowledgeUploadJobs} from '../src/lib/knowledge/upload';
import {completeExtractionReview,getExtractionReview,recordExtractionReview} from '../src/lib/knowledge/extraction-review';
import {registerVectorlessUpload} from '../src/lib/knowledge/vectorless-registration';
import {browseTree,readEvidence,searchDocuments} from '../src/lib/knowledge/vectorless';
import {finishVisualReviewJob} from '../src/lib/knowledge/visual-queue';
nextEnv.loadEnvConfig(process.cwd());
assert.equal(process.platform,'win32');
const base=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;assert(base);
const url=new URL(base);assert(['localhost','127.0.0.1','::1'].includes(url.hostname));
const {database}=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8'));assert(/^ma11_replay_[a-f0-9]{12}$/.test(database));
url.pathname=`/${database}`;process.env.DATABASE_URL=url.toString();
const pool=new Pool({connectionString:url.toString()}),owner=randomUUID(),peerOwner=randomUUID();
const fixtureDirectory=resolve('tmp');let multiFormatDirectory:string|undefined;
const publishedDocumentIds:string[]=[];
try{
await mkdir(fixtureDirectory,{recursive:true});
multiFormatDirectory=await mkdtemp(resolve(fixtureDirectory,'g05-successful-multiformat-'));
assert(multiFormatDirectory.startsWith(fixtureDirectory+sep));
const pdfPath=resolve(multiFormatDirectory,'successful-fixture.pdf');
const pptxPath=resolve(multiFormatDirectory,'successful-fixture.pptx');
const imagePath=resolve(multiFormatDirectory,'fixture.png');
const makeFixtures=spawnSync(process.env.PYTHON_BINARY?.trim()||'python',['-c',[
 'from pathlib import Path',
 'import sys',
 'import fitz',
 'from PIL import Image',
 'from pptx import Presentation',
 'from pptx.util import Inches',
 'pdf_path,pptx_path,image_path=sys.argv[1:]',
 'Image.new("RGB",(64,64),(20,80,140)).save(image_path)',
 'doc=fitz.open(); page=doc.new_page(); page.insert_text((50,50),"Synthetic PDF worker fixture"); page.insert_image(fitz.Rect(50,80,114,144),filename=image_path); doc.save(pdf_path); doc.close()',
 'deck=Presentation(); slide=deck.slides.add_slide(deck.slide_layouts[6]); shape=slide.shapes.add_textbox(0,0,Inches(4),Inches(1)); shape.text="Synthetic PPTX worker fixture"; slide.shapes.add_picture(image_path,Inches(1),Inches(1),width=Inches(1),height=Inches(1)); deck.save(pptx_path)',
 'for label in ["revision","competing"]:',
 '    doc=fitz.open(pdf_path); page=doc.new_page(); page.insert_text((50,80),"Synthetic "+label+" PDF fixture"); doc.save(str(Path(pdf_path).parent/(label+".pdf"))); doc.close()',
 '    deck=Presentation(pptx_path); slide=deck.slides.add_slide(deck.slide_layouts[6]); slide.shapes.add_textbox(Inches(1),Inches(1),Inches(7),Inches(1)).text="Synthetic "+label+" PPTX fixture"; deck.save(str(Path(pptx_path).parent/(label+".pptx")))',
].join('\n'),pdfPath,pptxPath,imagePath],{encoding:'utf8',windowsHide:true});
assert.equal(makeFixtures.status,0,makeFixtures.stderr||'Could not create synthetic PDF/PPTX fixtures');
const stored=async(id:string)=>(await pool.query('select * from knowledge_upload_job where id=$1',[id])).rows[0];
async function supervisor(id:string,phase?:string){
 const marker=resolve('tmp/upload-crash',`${randomUUID()}.json`);await mkdir(resolve('tmp/upload-crash'),{recursive:true});
 const child=spawn(process.execPath,['--require','./scripts/patch-node-user.cjs',...(phase?['--require','./scripts/fixtures/upload-crash-preload.cjs']:[]),'--import','tsx','scripts/run-knowledge-worker.ts',`--job-id=${id}`,...(phase?[]:['--once'])],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,DATABASE_URL:url.toString(),...(phase?{UPLOAD_CRASH_PHASE:phase,UPLOAD_CRASH_MARKER:marker}:{})}});
 let err='',out='';child.stdout.on('data',part=>{out=(out+String(part)).slice(-2000);});child.stderr.on('data',part=>{err=(err+String(part)).slice(-2000);});
 const exited=new Promise<number|null>((done,reject)=>{child.once('exit',done);child.once('error',reject);});
 try{
  if(!phase){const timer=setTimeout(()=>child.kill(),120000);try{assert.equal(await exited,0,err);}finally{clearTimeout(timer);}return;}
  let reached:{pid:number;phase:string}|null=null;
  for(let i=0;i<900;i++){
   const raw=await readFile(marker,'utf8').catch(()=>null);if(raw){reached=JSON.parse(raw);break;}
   if(child.exitCode!==null)break;await new Promise(done=>setTimeout(done,100));
  }
  assert(reached,`Checkpoint not reached: ${phase}; ${err}; ${out}; state=${(await stored(id)).status}`);assert.equal(reached.phase,phase);assert.notEqual(reached.pid,child.pid);
  assert(child.kill());await exited;
  let stopped=false;for(let i=0;i<100;i++){try{process.kill(reached.pid,0);}catch{stopped=true;break;}await new Promise(done=>setTimeout(done,50));}
  assert(stopped,'Worker descendant survived supervisor kill');
 }finally{
  if(child.exitCode===null&&child.signalCode===null){child.kill();await exited;}
  await rm(marker,{force:true});
 }
}
async function reviewRegisterAndSearch(userId:string,otherUserId:string,jobId:string,expectedText:string,unitType:'page'|'slide'){
 const review=await getExtractionReview(userId,jobId,0,'pending');
 assert(review.blocks.length>0,`${expectedText} has no reviewable visual blocks`);
 for(const item of review.blocks){
  assert.equal(item.block.quality,'pending-ocr');
  assert(item.candidate?.imageFile,`${item.block.id} has no verified review image`);
  await recordExtractionReview(userId,{jobId,artifactSha256:review.artifactSha256,blockId:item.block.id,
   expectedRevision:0,decision:'decoration',evidenceText:'',
   note:'Synthetic fixture only: the verifier generated a plain blue square with no factual content.'});
 }
 const completedReview=await getExtractionReview(userId,jobId,0,'pending');
 assert.equal(completedReview.pendingResolved,completedReview.pendingTotal);
 const completion=await completeExtractionReview(userId,jobId,completedReview.artifactSha256,completedReview.decisionSha256);
 assert.equal(completion.readyForRegistration,true);
 const registered=await registerVectorlessUpload(userId,jobId,{language:'en',authorityLevel:2});
 assert.equal(registered.treeStatus,'searchable');publishedDocumentIds.push(registered.documentId);
 const matches=await searchDocuments(userId,expectedText,{collections:['industry']});
 const match=matches.find(row=>row.documentId===registered.documentId);assert(match,`${expectedText} was not retrievable`);
 const roots=await browseTree(userId,registered.documentId,null,0,20,['industry']);
 let citation:Awaited<ReturnType<typeof browseTree>>[number]|undefined;
 for(const unit of roots.filter(row=>row.node_kind==='unit'&&row.unit_type===unitType)){
  const nodes=await browseTree(userId,registered.documentId,unit.id,0,20,['industry']);
  for(const node of nodes.filter(row=>row.node_kind==='evidence'&&row.unit_type===unitType)){
   if((await readEvidence(userId,node.id,['industry']))?.content.includes(expectedText)){citation=node;break;}
  }
  if(citation)break;
 }
 assert(citation,`${expectedText} evidence node missing`);
 const evidence=await readEvidence(userId,citation.id,['industry']);
 assert(evidence?.content.includes(expectedText),`${expectedText} citation text does not match source`);
 assert.equal(evidence?.source_sha256,(await stored(jobId)).source_sha256);
 if(unitType==='page')assert(Array.isArray(evidence?.source_location.bbox)&&evidence.source_location.bbox.length===4);
 else assert(Array.isArray(evidence?.source_location.shapePath)&&Array.isArray(evidence?.source_location.shapeIdPath));
 const otherAccountMatches=await searchDocuments(otherUserId,expectedText,{collections:['industry']});
 assert(!otherAccountMatches.some(row=>row.documentId===registered.documentId),'Private document leaked to peer account');
 assert.equal((await browseTree(otherUserId,registered.documentId,null,0,20,['industry'])).length,0);
 assert.equal(await readEvidence(otherUserId,citation.id,['industry']),null);
 return {documentId:registered.documentId,reason:match.reason,sourceSha256:evidence?.source_sha256,sourceLocation:evidence?.source_location};
}
 await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Supervisor fixture','!','member','active')",[owner,`${owner}@example.invalid`]);
 await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Supervisor peer fixture','!','member','active')",[peerOwner,`${peerOwner}@example.invalid`]);
 const pointers=JSON.stringify((await pool.query('select * from knowledge_release_pointer_v3 order by scope_kind,owner_id')).rows);
 const input={collection:'industry' as const,title:'Supervisor fixture',originalFilename:'fixture.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',bytes:await readFile('tmp/xlsx-visual-local/source.xlsx'),visibility:'private' as const};
 const target=await createKnowledgeUploadJob(owner,input);
 const unrelated=await createKnowledgeUploadJob(owner,{...input,bytes:Buffer.concat([input.bytes,Buffer.from('\nunrelated fixture')])});
 const peer=await createKnowledgeUploadJob(peerOwner,input);
 const untouched=JSON.stringify(await stored(unrelated.id));
 await supervisor(target.id,'extracting');
 const first=await stored(target.id);assert.equal(first.status,'running');assert(first.lease_token);
 await supervisor(target.id);assert.equal((await stored(target.id)).lease_token,first.lease_token);assert.equal((await stored(target.id)).status,'running');
 await pool.query("update knowledge_upload_job set lease_until=now()-interval '1 second' where id=$1",[target.id]);
 // Pause immediately before candidate binding after actual local OCR has run.
 await supervisor(target.id,'visual-before-bind');
 const held=await stored(target.id);assert.equal(held.status,'extracted');assert.equal(held.error_code,'extraction-review-required');assert.equal(held.metrics.visualReviewKey,undefined);assert.equal(held.visual_attempts,1);assert(held.visual_lease_token);
 // A malformed PDF failure must not change the stranded XLSX lease or another XLSX job.
 const badPdf=await createKnowledgeUploadJob(peerOwner,{...input,title:'Malformed PDF fixture',originalFilename:'malformed.pdf',mimeType:'application/pdf',bytes:Buffer.from('%PDF-1.4\nnot a valid PDF body\n')});
 await supervisor(badPdf.id);
 const badPdfState=await stored(badPdf.id);assert.equal(badPdfState.status,'failed');assert(badPdfState.error_code);assert.equal(badPdfState.lease_token,null);
 assert.equal((await stored(target.id)).visual_lease_token,held.visual_lease_token);
 assert.equal((await stored(target.id)).visual_attempts,1);
 assert.equal((await stored(peer.id)).status,'pending');
 assert.equal(JSON.stringify((await pool.query('select * from knowledge_release_pointer_v3 order by scope_kind,owner_id')).rows),pointers);
 // Successful PDF and PPTX jobs must both extract and hand off their visual objects
 // for review while unrelated held jobs and release pointers remain untouched.
 const successfulPdf=await createKnowledgeUploadJob(owner,{...input,title:'Successful PDF worker fixture',originalFilename:'successful-fixture.pdf',mimeType:'application/pdf',bytes:await readFile(pdfPath)});
 const successfulPptx=await createKnowledgeUploadJob(peerOwner,{...input,title:'Successful PPTX worker fixture',originalFilename:'successful-fixture.pptx',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',bytes:await readFile(pptxPath)});
const syntheticCitations:Array<Record<string,unknown>>=[];
const revisionResults:Array<Record<string,unknown>>=[];
 for(const job of [successfulPdf,successfulPptx]){
  await supervisor(job.id);
  if(!(await stored(job.id)).metrics.visualReviewKey)await supervisor(job.id);
  const state=await stored(job.id);
  assert.equal(state.status,'extracted');assert.equal(state.error_code,'extraction-review-required');
  assert(state.extraction_artifact_key);assert(state.metrics.visualReviewKey);
  const artifact=JSON.parse(await readFile(resolve(state.extraction_artifact_key),'utf8'));
  const document=artifact.documents?.[0];
  const expectedText=job===successfulPdf?'Synthetic PDF worker fixture':'Synthetic PPTX worker fixture';
  assert(document?.blocks?.some((block:{text?:string})=>block.text===expectedText),`${expectedText} was not extracted`);
  assert(document.blocks.some((block:{quality?:string})=>block.quality==='pending-ocr'));
  const review=await getExtractionReview(job===successfulPdf?owner:peerOwner,job.id);
  assert.equal(review.visualState,'ready');assert(review.total>0);
  const candidate=JSON.parse(await readFile(resolve(state.metrics.visualReviewKey),'utf8'));
  assert(candidate.records.some((record:{status:string})=>record.status==='review-required'));
  syntheticCitations.push(await reviewRegisterAndSearch(job===successfulPdf?owner:peerOwner,job===successfulPdf?peerOwner:owner,job.id,
   job===successfulPdf?'Synthetic PDF worker fixture':'Synthetic PPTX worker fixture',job===successfulPdf?'page':'slide'));
  const userId=job===successfulPdf?owner:peerOwner,otherUserId=job===successfulPdf?peerOwner:owner,format=job===successfulPdf?'pdf':'pptx',unitType=job===successfulPdf?'page':'slide';
  const original=await stored(job.id),documentId=original.published_document_id;
  const oldVersion=(await pool.query('select current_tree_version_id from knowledge_document where id=$1',[documentId])).rows[0].current_tree_version_id;
  const oldEvidence=(await pool.query("select id from knowledge_tree_node where version_id=$1 and node_kind='evidence' and position($2 in content)>0 order by id limit 1",[oldVersion,expectedText])).rows[0];assert(oldEvidence);
  const oldNode=oldEvidence.id;
  const assertOld=async()=>{
   assert.equal((await pool.query('select current_tree_version_id from knowledge_document where id=$1',[documentId])).rows[0].current_tree_version_id,oldVersion);
   assert((await readEvidence(userId,oldNode))?.content.includes(expectedText));
  };
  const revisionInput={...input,title:`Synthetic revision ${format}`,originalFilename:`revision.${format}`,
   mimeType:job===successfulPdf?'application/pdf':'application/vnd.openxmlformats-officedocument.presentationml.presentation',
   bytes:await readFile(resolve(multiFormatDirectory,`revision.${format}`)),revisionDocumentId:documentId,revisionBaseVersionId:oldVersion};
  await assert.rejects(createKnowledgeUploadJob(otherUserId,revisionInput),/owned/);
  const failed=await createKnowledgeUploadJob(userId,{...revisionInput,originalFilename:'invalid.pdf',mimeType:'application/pdf',bytes:Buffer.from('%PDF-1.4\nnot a revision PDF\n')});
  await supervisor(failed.id);assert.equal((await stored(failed.id)).status,'failed');await assertOld();
  const revision=await createKnowledgeUploadJob(userId,revisionInput);
  const duplicate=await createKnowledgeUploadJob(userId,revisionInput);assert(duplicate.reused);assert.equal(duplicate.id,revision.id);
  const competing=await createKnowledgeUploadJob(userId,{...revisionInput,bytes:await readFile(resolve(multiFormatDirectory,`competing.${format}`))});
  for(const pending of [revision,competing]){
   await supervisor(pending.id);if(!(await stored(pending.id)).metrics.visualReviewKey)await supervisor(pending.id);
   assert.equal((await getExtractionReview(userId,pending.id)).visualState,'ready');await assertOld();
  }
  await assert.rejects(registerVectorlessUpload(userId,revision.id,{language:'en',authorityLevel:2}),/Unresolved/);await assertOld();
  const citation=await reviewRegisterAndSearch(userId,otherUserId,revision.id,`Synthetic revision ${format.toUpperCase()} fixture`,unitType);
  assert.equal(citation.documentId,documentId);assert.equal((citation.sourceLocation as {unitIndex:number}).unitIndex,2);
  const newVersion=(await pool.query('select current_tree_version_id from knowledge_document where id=$1',[documentId])).rows[0].current_tree_version_id;
  assert.notEqual(newVersion,oldVersion);assert.equal(await readEvidence(userId,oldNode),null);
  await assert.rejects(reviewRegisterAndSearch(userId,otherUserId,competing.id,`Synthetic competing ${format.toUpperCase()} fixture`,unitType),/version changed/);
  assert.equal((await pool.query('select current_tree_version_id from knowledge_document where id=$1',[documentId])).rows[0].current_tree_version_id,newVersion);
  assert((await registerVectorlessUpload(userId,revision.id,{language:'en',authorityLevel:2})).reused);
  const jobs=await listKnowledgeUploadJobs(userId,0,50);
  assert.equal(jobs.find(row=>row.id===job.id)?.treeStatus,'historical');assert.equal(jobs.find(row=>row.id===revision.id)?.treeStatus,'searchable');
  assert.equal((await pool.query('select count(*)::int n from knowledge_tree_version where document_id=$1',[documentId])).rows[0].n,2);
  revisionResults.push({format,stableDocumentId:true,parserFailureKeepsOld:true,oldReadableDuringProcessingAndReview:true,
   crossAccountRevisionRejected:true,duplicateReused:true,unresolvedRegistrationRejected:true,oneReviewedWinner:true,competingRevisionRejected:true,
   oldEvidenceRejectedAfterSwitch:true,historyStatusVerified:true,exactSecondUnitCitation:citation,registrationReplayReused:true});
 }
 assert.equal((await stored(target.id)).visual_lease_token,held.visual_lease_token);
 assert.equal(JSON.stringify((await pool.query('select * from knowledge_release_pointer_v3 order by scope_kind,owner_id')).rows),pointers);
 // A different account can finish its own visual job while the target lease is stranded.
 await supervisor(peer.id);
 // --once runs extraction and visual workers concurrently; visual may poll before extraction completes.
 if(!(await stored(peer.id)).metrics.visualReviewKey)await supervisor(peer.id);
 const peerReady=await stored(peer.id);assert.equal(peerReady.status,'extracted');assert(peerReady.metrics.visualReviewKey);assert.equal(peerReady.visual_lease_token,null);
 assert.equal((await getExtractionReview(peerOwner,peer.id)).visualState,'ready');
 assert.equal((await stored(target.id)).visual_lease_token,held.visual_lease_token);
 assert.equal((await stored(target.id)).visual_attempts,1);
 await supervisor(target.id);assert.equal((await stored(target.id)).visual_lease_token,held.visual_lease_token);assert.equal((await stored(target.id)).visual_attempts,1);
 await pool.query("update knowledge_upload_job set visual_lease_until=now()-interval '1 second' where id=$1",[target.id]);
 assert.equal(await finishVisualReviewJob({jobId:target.id,userId:owner,leaseToken:held.visual_lease_token},true),false);
 await supervisor(target.id);
 const ready=await stored(target.id);assert.equal(ready.visual_attempts,2);assert.equal(ready.visual_lease_token,null);assert(ready.metrics.visualReviewKey);
 const review=await getExtractionReview(owner,target.id);assert.equal(review.visualState,'ready');assert.equal(review.resolved,0);
 const candidate=JSON.parse(await readFile(resolve(ready.metrics.visualReviewKey),'utf8'));
 assert.equal(candidate.ocrImageExecutions,0);assert.equal(candidate.ocrCheckpointReuses,1);
 assert.equal(JSON.stringify(await stored(unrelated.id)),untouched);
 assert.equal((await pool.query('select count(*)::int as n from knowledge_document where owner_id=$1',[owner])).rows[0].n,1);
 assert.equal((await pool.query('select count(*)::int as n from knowledge_document where owner_id=$1',[peerOwner])).rows[0].n,1);
 assert.equal(JSON.stringify((await pool.query('select * from knowledge_release_pointer_v3 order by scope_kind,owner_id')).rows),pointers);
 const syntheticVisualJudgments=(await pool.query('select count(*)::int n from knowledge_upload_extraction_review where owner_id=any($1::uuid[])',[[owner,peerOwner]])).rows[0].n;
 const result={cloneOnly:true,platform:process.platform,actualSupervisorKills:2,descendantsStopped:true,extractionLeaseHeld:true,extractionExpiredRecovery:true,visualLeaseHeld:true,malformedPdfFailedWithoutCrossJobEffect:true,successfulPdfWorkerHandoff:true,successfulPdfTextExtracted:true,successfulPptxWorkerHandoff:true,successfulPptxTextExtracted:true,syntheticVisualJudgments,reviewCompletionVerified:true,vectorlessRegistrationVerified:true,searchAndSourceCitationVerified:true,syntheticCitations,revisionResults,peerAccountCompletedWhileTargetHeld:true,peerVisualReady:true,expiredFinishRejected:true,visualExpiredRecovery:true,ocrExecutionsOnResume:0,ocrCheckpointReuses:1,unrelatedJobUnchanged:true,v3PointersUnchanged:true,syntheticDocumentsRegistered:2,externalCalls:0,syntheticFixture:true,qualityAccepted:false};
 await writeFile('tmp/knowledge-supervisor-clone-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{
 for(const userId of [owner,peerOwner]){
  await pool.query('delete from knowledge_upload_extraction_review where owner_id=$1',[userId]);
  await pool.query('delete from knowledge_upload_review_completion where owner_id=$1',[userId]);
  await pool.query('delete from knowledge_upload_job where user_id=$1',[userId]);
  await pool.query('delete from knowledge_document where id=any($1::uuid[]) and owner_id=$2',[publishedDocumentIds,userId]);
  await pool.query('delete from app_user where id=$1',[userId]);
  const residue=await pool.query<{users:string;jobs:string;documents:string;reviews:string;completions:string}>(`select
   (select count(*) from app_user where id=$1)::text as users,
   (select count(*) from knowledge_upload_job where user_id=$1)::text as jobs,
   (select count(*) from knowledge_document where owner_id=$1)::text as documents,
   (select count(*) from knowledge_upload_extraction_review where owner_id=$1)::text as reviews,
   (select count(*) from knowledge_upload_review_completion where owner_id=$1)::text as completions`,[userId]);
  assert.deepEqual(residue.rows[0],{users:'0',jobs:'0',documents:'0',reviews:'0',completions:'0'});
 }
 await pool.end();await getPool().end();
 for(const userId of [owner,peerOwner]){
  const root=resolve('knowledge/uploads',userId);assert(root.startsWith(resolve('knowledge/uploads')+sep));
  for(const name of await readdir(root).catch(()=>[])){const path=resolve(root,name);assert(path.startsWith(root+sep));await rm(path,{recursive:true,force:true});}await rm(root,{recursive:true,force:true});
 }
 if(multiFormatDirectory){assert(multiFormatDirectory.startsWith(fixtureDirectory+sep));await rm(multiFormatDirectory,{recursive:true,force:true});}
}
