import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {tenantTransaction} from '@/lib/rag/db';
import {assertResolvedInsideKnowledgeRoot,safeKnowledgeStorageKey} from './document-repository';
import {extractionReadiness} from './extraction-readiness';
import {slideShapeLocation,visualSourceLocation,type Block} from './extracted-tree';
import {loadVisualCandidates,readVisualCandidateImage} from './visual-review-candidates';
import {deriveReviewedExtraction,reviewDecisionHash,type ExtractionJudgment} from './reviewed-extraction';

export class ExtractionReviewConflict extends Error {}
export const extractionReviewDecision=z.object({
  jobId:z.uuid(),artifactSha256:z.string().regex(/^[a-f0-9]{64}$/),
  blockId:z.string().min(1).max(300),expectedRevision:z.number().int().min(0),
  decision:z.enum(['evidence','decoration','unresolved']),evidenceText:z.string().trim().max(20000),note:z.string().trim().min(1).max(2000),
}).strict().refine(v=>v.decision==='evidence'?v.evidenceText.length>0:v.evidenceText==='');

async function load(client:PoolClient,userId:string,jobId:string){
  const result=await client.query<{source_sha256:string;extractor_version:string;extraction_artifact_key:string;storage_key:string;byte_size:string;metrics:{artifactSha256:string;visualReviewKey?:string;visualReviewSha256?:string};title:string;original_filename:string;visual_attempts:number;visual_error_code:string|null;visual_running:boolean}>(
    `select j.source_sha256,j.extractor_version,j.extraction_artifact_key,j.storage_key,j.byte_size::text,j.metrics,j.title,j.original_filename,
       j.visual_attempts,j.visual_error_code,coalesce(j.visual_lease_until>now(),false) as visual_running
     from knowledge_upload_job j join app_user u on u.id=j.user_id and u.status='active'
     where j.id=$1 and j.user_id=$2 and j.status='extracted' and j.error_code='extraction-review-required'
       and j.lease_token is null for update of j`,[jobId,userId]);
  const job=result.rows[0];if(!job)throw new ExtractionReviewConflict('待审核作业不存在或状态已变化');
  const source=resolve(safeKnowledgeStorageKey(job.storage_key)),artifact=resolve(safeKnowledgeStorageKey(job.extraction_artifact_key));
  assertResolvedInsideKnowledgeRoot(source);assertResolvedInsideKnowledgeRoot(artifact);
  const [original,bytes]=await Promise.all([readFile(source),readFile(artifact)]);
  if(original.length!==Number(job.byte_size)||createHash('sha256').update(original).digest('hex')!==job.source_sha256)
    throw new ExtractionReviewConflict('原件已变化，不能审核');
  extractionReadiness(bytes,{sourceSha256:job.source_sha256,artifactSha256:job.metrics.artifactSha256,extractorVersion:job.extractor_version});
  const blocks=(JSON.parse(bytes.toString('utf8')).documents[0].blocks as Block[]).filter(block=>!['success','blank'].includes(block.quality));
  return {job,blocks,original,artifactBytes:bytes};
}

export async function completeExtractionReview(userId:string,jobId:string,artifactSha256:string,decisionSha256:string){
  z.uuid().parse(jobId);z.string().regex(/^[a-f0-9]{64}$/).parse(artifactSha256);z.string().regex(/^[a-f0-9]{64}$/).parse(decisionSha256);
  return tenantTransaction(userId,async client=>{
    // Serialize first submission and retries on the job, including after worker registration.
    const locked=await client.query<{status:string;storage_key:string;source_sha256:string;extraction_artifact_key:string;metrics:{artifactSha256?:string}}>(
      `select j.status,j.storage_key,j.source_sha256,j.extraction_artifact_key,j.metrics from knowledge_upload_job j
       join app_user u on u.id=j.user_id and u.status='active' where j.id=$1 and j.user_id=$2 for update of j`,[jobId,userId]);
    const current=locked.rows[0];if(!current)throw new ExtractionReviewConflict('待审核作业不存在或状态已变化');
    const prior=await client.query<{id:string;source_sha256:string;original_artifact_key:string;original_artifact_sha256:string;reviewed_artifact_key:string;reviewed_artifact_sha256:string;extractor_version:string}>(
      'select * from knowledge_upload_review_completion where job_id=$1 and owner_id=$2',[jobId,userId]);
    if(prior.rows[0]){
      const receipt=prior.rows[0];
      if(receipt.original_artifact_sha256!==artifactSha256||receipt.source_sha256!==current.source_sha256
        ||receipt.reviewed_artifact_key!==current.extraction_artifact_key||receipt.reviewed_artifact_sha256!==current.metrics.artifactSha256)
        throw new ExtractionReviewConflict('审核完成记录与当前作业不符');
      const judgments=await client.query<ExtractionJudgment>(`select distinct on(block_id) block_id,revision,decision,evidence_text,source_sha256,extractor_version
        from knowledge_upload_extraction_review where owner_id=$1 and job_id=$2 and artifact_sha256=$3 order by block_id,revision desc`,[userId,jobId,artifactSha256]);
      if(reviewDecisionHash(judgments.rows)!==decisionSha256)throw new ExtractionReviewConflict('审核记录已变化，请重新加载后完成');
      const paths=[current.storage_key,receipt.original_artifact_key,receipt.reviewed_artifact_key].map(key=>{const path=resolve(safeKnowledgeStorageKey(key));assertResolvedInsideKnowledgeRoot(path);return path;});
      const [source,original,reviewed]=await Promise.all(paths.map(path=>readFile(path)));
      const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
      if(hash(source)!==receipt.source_sha256||hash(reviewed)!==receipt.reviewed_artifact_sha256)throw new ExtractionReviewConflict('审核原件或派生产物已变化');
      const rebuilt=deriveReviewedExtraction(original,{receiptId:receipt.id,sourceSha256:receipt.source_sha256,artifactSha256,extractorVersion:receipt.extractor_version},judgments.rows);
      if(!rebuilt.equals(reviewed))throw new ExtractionReviewConflict('审核派生产物与判决不符');
      return {receiptId:receipt.id,status:current.status,indexingResumed:false,readyForRegistration:current.status==='extracted',reused:true};
    }
    const {job,artifactBytes}=await load(client,userId,jobId);
    if(job.metrics.artifactSha256!==artifactSha256)throw new ExtractionReviewConflict('抽取版本已变化，请重新加载');
    const rows=await client.query<ExtractionJudgment>(`select distinct on(block_id) block_id,revision,decision,evidence_text,source_sha256,extractor_version
      from knowledge_upload_extraction_review where owner_id=$1 and job_id=$2 and artifact_sha256=$3 order by block_id,revision desc`,[userId,jobId,artifactSha256]);
    if(reviewDecisionHash(rows.rows)!==decisionSha256)throw new ExtractionReviewConflict('审核记录已变化，请重新加载后完成');
    const receiptId=randomUUID();
    let reviewed:Buffer;
    try{reviewed=deriveReviewedExtraction(artifactBytes,{receiptId,sourceSha256:job.source_sha256,artifactSha256,extractorVersion:job.extractor_version},rows.rows);}
    catch{throw new ExtractionReviewConflict('仍有未解决或不匹配的对象，不能恢复索引');}
    const key=safeKnowledgeStorageKey(`knowledge/uploads/${userId}/${jobId}.reviewed.${receiptId}.json`),path=resolve(key);assertResolvedInsideKnowledgeRoot(path);
    await writeFile(path,reviewed,{flag:'wx'});
    const reviewedSha=createHash('sha256').update(reviewed).digest('hex');
    await client.query(`insert into knowledge_upload_review_completion(id,owner_id,job_id,source_sha256,original_artifact_key,original_artifact_sha256,reviewed_artifact_key,reviewed_artifact_sha256,extractor_version)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[receiptId,userId,jobId,job.source_sha256,job.extraction_artifact_key,artifactSha256,key,reviewedSha,job.extractor_version]);
    await client.query(`update knowledge_upload_job set extraction_artifact_key=$3,error_code=null,updated_at=now(),metrics=metrics||$4::jsonb where id=$1 and user_id=$2`,
      [jobId,userId,key,JSON.stringify({artifactSha256:reviewedSha,extractionReviewReceiptId:receiptId,originalExtractionArtifactKey:job.extraction_artifact_key,originalExtractionArtifactSha256:artifactSha256})]);
    return {receiptId,status:'extracted',indexingResumed:false,readyForRegistration:true,reused:false};
  });
}

export async function getExtractionReviewOriginal(userId:string,jobId:string,artifactSha256:string){
  z.uuid().parse(jobId);z.string().regex(/^[a-f0-9]{64}$/).parse(artifactSha256);
  return tenantTransaction(userId,async client=>{
    const {job,original}=await load(client,userId,jobId);
    if(job.metrics.artifactSha256!==artifactSha256)throw new ExtractionReviewConflict('抽取版本已变化，请重新加载');
    return {bytes:original,filename:job.original_filename};
  });
}

export async function getExtractionReview(userId:string,jobId:string,offset=0){
  z.uuid().parse(jobId);z.number().int().min(0).max(1000000).parse(offset);
  return tenantTransaction(userId,async client=>{
    const {job,blocks}=await load(client,userId,jobId);
    const candidates=await loadVisualCandidates(job.metrics,job.source_sha256,job.metrics.artifactSha256,blocks);
    const byCandidate=new Map(candidates?.map(record=>[record.blockId,record]));
    const judgments=await client.query<{block_id:string;revision:number;decision:string;evidence_text:string;note:string;created_at:string}>(`select distinct on(block_id) block_id,revision,decision,evidence_text,note,created_at
      from knowledge_upload_extraction_review where owner_id=$1 and job_id=$2 and artifact_sha256=$3 order by block_id,revision desc`,[userId,jobId,job.metrics.artifactSha256]);
    const byBlock=new Map(judgments.rows.map(row=>[row.block_id,row]));
    return {jobId,title:job.title,sourceSha256:job.source_sha256,artifactSha256:job.metrics.artifactSha256,extractorVersion:job.extractor_version,decisionSha256:reviewDecisionHash(judgments.rows),
      total:blocks.length,offset,blocks:blocks.slice(offset,offset+20).map(block=>({block,judgment:byBlock.get(block.id)??null,candidate:byCandidate.get(block.id)??null})),
      visualState:! /\.(pptx|pdf|xlsx)$/i.test(job.storage_key)?'unsupported':job.metrics.visualReviewKey?'ready':job.visual_running?'running':job.visual_attempts>=3?'failed':job.visual_error_code?'retrying':'pending',
      resolved:blocks.filter(block=>{const row=byBlock.get(block.id);return row&&row.decision!=='unresolved';}).length,indexingResumed:false};
  });
}

export async function retryExtractionVisuals(userId:string,jobId:string,artifactSha256:string){
  z.uuid().parse(jobId);z.string().regex(/^[a-f0-9]{64}$/).parse(artifactSha256);
  return tenantTransaction(userId,async client=>{
    const {job}=await load(client,userId,jobId);
    if(job.metrics.artifactSha256!==artifactSha256||! /\.(pptx|pdf|xlsx)$/i.test(job.storage_key))throw new ExtractionReviewConflict('当前原件或版本不支持该重试');
    if(job.visual_running)throw new ExtractionReviewConflict('本地候选正在准备，请等待');
    if(job.metrics.visualReviewKey)return {queued:false,alreadyPrepared:true};
    await client.query(`update knowledge_upload_job set visual_attempts=0,visual_error_code=null,visual_retry_at=null,visual_lease_token=null,visual_lease_until=null,updated_at=now() where id=$1 and user_id=$2`,[jobId,userId]);
    return {queued:true};
  });
}

export async function getExtractionReviewImage(userId:string,jobId:string,artifactSha256:string,blockId:string,objectIndex?:number,imageIndex?:number){
  z.uuid().parse(jobId);z.string().regex(/^[a-f0-9]{64}$/).parse(artifactSha256);
  if(objectIndex!==undefined||imageIndex!==undefined){z.number().int().positive().parse(objectIndex);z.number().int().positive().parse(imageIndex);}
  return tenantTransaction(userId,async client=>{
    const {job,blocks}=await load(client,userId,jobId);
    if(job.metrics.artifactSha256!==artifactSha256)throw new ExtractionReviewConflict('抽取版本已变化，请重新加载');
    const candidates=await loadVisualCandidates(job.metrics,job.source_sha256,artifactSha256,blocks);
    const record=candidates?.find(candidate=>candidate.blockId===blockId);
    const image=objectIndex===undefined?record:record?.sheetObjects?.find(object=>object.objectIndex===objectIndex)?.images?.find(image=>image.imageIndex===imageIndex);
    if(!image?.imageFile||!job.metrics.visualReviewKey)throw new ExtractionReviewConflict('该对象没有可用预览');
    return readVisualCandidateImage(job.metrics.visualReviewKey,image);
  });
}

/** Append a user judgment only; this is neither a publication nor an indexing permission. */
export async function recordExtractionReview(userId:string,raw:unknown){
  const input=extractionReviewDecision.parse(raw);
  return tenantTransaction(userId,async client=>{
    const {job,blocks}=await load(client,userId,input.jobId);
    if(input.artifactSha256!==job.metrics.artifactSha256)throw new ExtractionReviewConflict('抽取版本已变化，请重新加载');
    const block=blocks.find(block=>block.id===input.blockId);
    if(!block)throw new ExtractionReviewConflict('对象不属于当前待审核产物');
    const prior=await client.query<{revision:number}>(`select revision from knowledge_upload_extraction_review where owner_id=$1 and job_id=$2 and artifact_sha256=$3 and block_id=$4 order by revision desc limit 1`,[userId,input.jobId,input.artifactSha256,input.blockId]);
    if((prior.rows[0]?.revision??0)!==input.expectedRevision)throw new ExtractionReviewConflict('该对象已有新的审核，请重新加载');
    const revision=input.expectedRevision+1;
    const location={unitType:block.unitType,unitIndex:block.unitIndex,blockId:block.id,bbox:block.bbox??null,...slideShapeLocation(block),...visualSourceLocation(block)};
    await client.query(`insert into knowledge_upload_extraction_review(owner_id,job_id,source_sha256,artifact_sha256,extractor_version,block_id,revision,decision,evidence_text,note,source_location,reviewer_id)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$1)`,[userId,input.jobId,job.source_sha256,input.artifactSha256,job.extractor_version,block.id,revision,input.decision,input.evidenceText,input.note,JSON.stringify(location)]);
    return {revision,indexingResumed:false};
  });
}
