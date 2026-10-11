import {runBoundedLocalProcess} from './lib/run-bounded-local-process';
import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import nextEnv from '@next/env';
import {z} from 'zod';
import {getPool,tenantQuery,tenantTransaction} from '../src/lib/rag/db';
import {assertResolvedInsideKnowledgeRoot,safeKnowledgeStorageKey} from '../src/lib/knowledge/document-repository';
import {extractionReadiness} from '../src/lib/knowledge/extraction-readiness';
import {validateVisualCandidates,readVisualCandidateImage} from '../src/lib/knowledge/visual-review-candidates';
import type {Block} from '../src/lib/knowledge/extracted-tree';
nextEnv.loadEnvConfig(process.cwd());
const arg=(name:string)=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const userId=z.uuid().parse(arg('user-id')),jobId=z.uuid().parse(arg('job-id'));
const visualLease=arg('visual-lease');if(visualLease)z.uuid().parse(visualLease);
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
try{
 const [job]=await tenantQuery<{storage_key:string;extraction_artifact_key:string;source_sha256:string;extractor_version:string;metrics:{artifactSha256:string;visualReviewKey?:string}}>(userId,
  `select j.storage_key,j.extraction_artifact_key,j.source_sha256,j.extractor_version,j.metrics from knowledge_upload_job j
   join app_user u on u.id=j.user_id and u.status='active' where j.id=$1 and j.user_id=$2 and j.status='extracted' and j.error_code='extraction-review-required' and j.lease_token is null
   and (($3::uuid is null and (j.visual_lease_until is null or j.visual_lease_until<now())) or (j.visual_lease_token=$3 and j.visual_lease_until>now()))`,[jobId,userId,visualLease??null]);
 if(!job||! /\.(pptx|pdf|xlsx)$/i.test(job.storage_key))throw new Error('Owned pending binary review required');
 if(job.metrics.visualReviewKey){console.log(JSON.stringify({alreadyPrepared:true}));}
 else{
 const source=resolve(safeKnowledgeStorageKey(job.storage_key)),artifact=resolve(safeKnowledgeStorageKey(job.extraction_artifact_key));
 assertResolvedInsideKnowledgeRoot(source);assertResolvedInsideKnowledgeRoot(artifact);
 const bytes=await readFile(artifact);extractionReadiness(bytes,{artifactSha256:job.metrics.artifactSha256,sourceSha256:job.source_sha256,extractorVersion:job.extractor_version});
 if(hash(await readFile(source))!==job.source_sha256)throw new Error('Source changed');
 const blocks=JSON.parse(bytes.toString('utf8')).documents[0].blocks as Block[];
 const folder=safeKnowledgeStorageKey(`knowledge/uploads/${userId}/${jobId}.visual.${randomUUID()}`),key=`${folder}/review.json`;
 const python=resolve('.venv-docling-v3/Scripts/python.exe');
 const checkpoints=resolve(safeKnowledgeStorageKey(`knowledge/uploads/${userId}/${jobId}.visual-checkpoints`));assertResolvedInsideKnowledgeRoot(checkpoints);
 if(job.storage_key.toLowerCase().endsWith('.pdf')){
  await runBoundedLocalProcess(process.env.PYTHON_BINARY||'python',['scripts/prepare_pdf_visual_review.py','--input',source,'--artifact',artifact,'--output',resolve(folder)],20*60*1000);
  await runBoundedLocalProcess(python,['scripts/ocr_rendered_visual_review.py','--review',resolve(key),'--checkpoint-dir',checkpoints],20*60*1000);
 }
 else if(job.storage_key.toLowerCase().endsWith('.xlsx'))await runBoundedLocalProcess(process.env.PYTHON_BINARY||'python',['scripts/prepare_xlsx_visual_review.py','--input',source,'--artifact',artifact,'--output',resolve(folder)],20*60*1000);
 else await runBoundedLocalProcess(python,['scripts/prepare_pptx_visual_review.py','--input',source,'--artifact',artifact,'--output',resolve(folder),'--max-unique-images','100','--all-batches','--checkpoint-dir',checkpoints],20*60*1000);
 const review=await readFile(resolve(key)),packageSha256=hash(review);
 const candidates=validateVisualCandidates(review,{sourceSha256:job.source_sha256,artifactSha256:job.metrics.artifactSha256,packageSha256},blocks);
 if(candidates.some(record=>record.reason==='local-image-budget-exhausted'))throw new Error('Incomplete image batches');
 for(const record of candidates)if(record.imageFile)await readVisualCandidateImage(key,record);
 for(const record of candidates)for(const object of record.sheetObjects??[])for(const image of object.images??[])await readVisualCandidateImage(key,image);
 if(hash(await readFile(source))!==job.source_sha256||hash(await readFile(artifact))!==job.metrics.artifactSha256)throw new Error('Source changed during candidate extraction');
 await tenantTransaction(userId,async client=>{
  const result=await client.query(`update knowledge_upload_job set metrics=metrics||$3::jsonb,updated_at=now()
   where id=$1 and user_id=$2 and status='extracted' and error_code='extraction-review-required' and lease_token is null
    and source_sha256=$4 and extraction_artifact_key=$5 and metrics->>'artifactSha256'=$6 and metrics->>'visualReviewKey' is null
    and (($7::uuid is null and (visual_lease_until is null or visual_lease_until<now())) or (visual_lease_token=$7 and visual_lease_until>now()))
    and exists(select 1 from app_user where id=$2 and status='active') returning id`,
   [jobId,userId,JSON.stringify({visualReviewKey:key,visualReviewSha256:packageSha256}),job.source_sha256,job.extraction_artifact_key,job.metrics.artifactSha256,visualLease??null]);
  if(!result.rows[0])throw new Error('Review job changed or another candidate package won');
 });
 console.log(JSON.stringify({prepared:true,objects:candidates.length,externalCalls:0,qualityAccepted:false,indexingResumed:false}));
 }
}finally{await getPool().end();}
