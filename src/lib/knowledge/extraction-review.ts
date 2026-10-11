import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {tenantTransaction} from '@/lib/rag/db';
import {assertResolvedInsideKnowledgeRoot,safeKnowledgeStorageKey} from './document-repository';
import {extractionReadiness} from './extraction-readiness';
import {slideShapeLocation,type Block} from './extracted-tree';

export class ExtractionReviewConflict extends Error {}
export const extractionReviewDecision=z.object({
  jobId:z.uuid(),artifactSha256:z.string().regex(/^[a-f0-9]{64}$/),
  blockId:z.string().min(1).max(300),expectedRevision:z.number().int().min(0),
  decision:z.enum(['evidence','decoration','unresolved']),evidenceText:z.string().trim().max(20000),note:z.string().trim().min(1).max(2000),
}).strict().refine(v=>v.decision==='evidence'?v.evidenceText.length>0:v.evidenceText==='');

async function load(client:PoolClient,userId:string,jobId:string){
  const result=await client.query<{source_sha256:string;extractor_version:string;extraction_artifact_key:string;storage_key:string;byte_size:string;metrics:{artifactSha256:string};title:string;original_filename:string}>(
    `select j.source_sha256,j.extractor_version,j.extraction_artifact_key,j.storage_key,j.byte_size::text,j.metrics,j.title,j.original_filename
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
  return {job,blocks,original};
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
    const judgments=await client.query(`select distinct on(block_id) block_id,revision,decision,evidence_text,note,created_at
      from knowledge_upload_extraction_review where owner_id=$1 and job_id=$2 and artifact_sha256=$3 order by block_id,revision desc`,[userId,jobId,job.metrics.artifactSha256]);
    const byBlock=new Map(judgments.rows.map(row=>[row.block_id,row]));
    return {jobId,title:job.title,sourceSha256:job.source_sha256,artifactSha256:job.metrics.artifactSha256,extractorVersion:job.extractor_version,
      total:blocks.length,offset,blocks:blocks.slice(offset,offset+20).map(block=>({block,judgment:byBlock.get(block.id)??null})),
      resolved:blocks.filter(block=>{const row=byBlock.get(block.id);return row&&row.decision!=='unresolved';}).length,indexingResumed:false};
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
    const location={unitType:block.unitType,unitIndex:block.unitIndex,blockId:block.id,bbox:block.bbox??null,...slideShapeLocation(block)};
    await client.query(`insert into knowledge_upload_extraction_review(owner_id,job_id,source_sha256,artifact_sha256,extractor_version,block_id,revision,decision,evidence_text,note,source_location,reviewer_id)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$1)`,[userId,input.jobId,job.source_sha256,input.artifactSha256,job.extractor_version,block.id,revision,input.decision,input.evidenceText,input.note,JSON.stringify(location)]);
    return {revision,indexingResumed:false};
  });
}
