import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tenantQuery} from '@/lib/rag/db';
import {extractionReadiness} from './extraction-readiness';
import {assertResolvedInsideKnowledgeRoot,safeKnowledgeStorageKey} from './document-repository';
import type {Block} from './extracted-tree';
export type ExtractionJudgment={block_id:string;revision:number;decision:string;evidence_text:string;source_sha256:string;extractor_version:string};
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export const reviewDecisionHash=(rows:Array<{block_id:string;revision:number}>)=>hash(Buffer.from(JSON.stringify(rows.map(row=>[row.block_id,row.revision]))));
export function deriveReviewedExtraction(original:Uint8Array,input:{receiptId:string;sourceSha256:string;artifactSha256:string;extractorVersion:string},judgments:ExtractionJudgment[]){
  extractionReadiness(original,input);
  const artifact=JSON.parse(Buffer.from(original).toString('utf8'));
  const document=artifact.documents[0];
  const pending=(document.blocks as Block[]).filter(block=>!['success','blank'].includes(block.quality));
  const byId=new Map(judgments.map(row=>[row.block_id,row]));
  if(!pending.length||byId.size!==judgments.length||pending.length!==byId.size)throw new Error('Incomplete review decisions');
  document.blocks=(document.blocks as Block[]).map(block=>{
    if(['success','blank'].includes(block.quality))return block;
    const row=byId.get(block.id);
    if(!row||!['evidence','decoration'].includes(row.decision)||row.source_sha256!==input.sourceSha256||row.extractor_version!==input.extractorVersion
      ||!Number.isSafeInteger(row.revision)||row.revision<1||row.decision==='evidence'&&!row.evidence_text.trim()
      ||row.decision==='decoration'&&row.evidence_text!=='')throw new Error('Unresolved or mismatched review decision');
    return {...block,quality:row.decision==='evidence'?'success':'blank',blockType:row.decision==='evidence'?'reviewed-text':'reviewed-decoration',text:row.evidence_text,
      review:{receiptId:input.receiptId,revision:row.revision,decision:row.decision,originalQuality:block.quality}};
  });
  const units=new Map<string,boolean>();
  for(const block of document.blocks as Block[]){const key=`${block.unitType}:${block.unitIndex}`;units.set(key,Boolean(units.get(key))||block.quality==='success');}
  document.qualitySummary={success:[...units.values()].filter(Boolean).length,blank:[...units.values()].filter(value=>!value).length,'pending-ocr':0,failed:0};
  artifact.reviewReceiptId=input.receiptId;
  return Buffer.from(JSON.stringify(artifact));
}

/** Reconstruct reviewed bytes from immutable original and saved decisions before indexing. */
export async function verifyReviewedExtraction(userId:string,jobId:string,bytes:Uint8Array){
  const artifact=JSON.parse(Buffer.from(bytes).toString('utf8'));
  if(!artifact.reviewReceiptId){
    if(artifact.documents?.some((document:{blocks?:Block[]})=>document.blocks?.some(block=>block.review)))throw new Error('Missing extraction review receipt');
    return;
  }
  const [receipt]=await tenantQuery<{id:string;source_sha256:string;original_artifact_key:string;original_artifact_sha256:string;reviewed_artifact_sha256:string;extractor_version:string}>(userId,
    `select * from knowledge_upload_review_completion where id=$1 and job_id=$2 and owner_id=$3`,[artifact.reviewReceiptId,jobId,userId]);
  if(!receipt||hash(bytes)!==receipt.reviewed_artifact_sha256)throw new Error('Invalid extraction review receipt');
  const path=resolve(safeKnowledgeStorageKey(receipt.original_artifact_key));assertResolvedInsideKnowledgeRoot(path);
  const original=await readFile(path);
  const judgments=await tenantQuery<ExtractionJudgment>(userId,`select distinct on(block_id) block_id,revision,decision,evidence_text,source_sha256,extractor_version
    from knowledge_upload_extraction_review where owner_id=$1 and job_id=$2 and artifact_sha256=$3 order by block_id,revision desc`,[userId,jobId,receipt.original_artifact_sha256]);
  const reconstructed=deriveReviewedExtraction(original,{receiptId:receipt.id,sourceSha256:receipt.source_sha256,artifactSha256:receipt.original_artifact_sha256,extractorVersion:receipt.extractor_version},judgments);
  if(!Buffer.from(bytes).equals(reconstructed))throw new Error('Reviewed extraction differs from saved judgments');
}
