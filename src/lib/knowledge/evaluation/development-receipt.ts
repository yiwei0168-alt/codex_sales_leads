import {createHash,randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {z} from 'zod';
import type {RetrievedChunk} from '@/lib/rag/types';

export const DEVELOPMENT_CAPTURE_VERSION='knowledge-development-capture-v1';
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const coordinate=z.object({unitType:z.enum(['page','slide','sheet','document']),unitIndex:z.number().int().nonnegative()}).passthrough();
const provenance=z.object({releaseId:z.uuid(),assetId:z.uuid(),sourceRevisionId:z.uuid(),sourceSha256:hash,
  contentSha256:hash,sourceLocation:coordinate}).passthrough();
export const developmentCaseSchema=z.object({split:z.literal('development'),id:z.string().regex(/^[a-z0-9-]+$/),
  question:z.string().min(1),tool:z.enum(['knowledge_originals','knowledge_compare']),arguments:z.record(z.string(),z.unknown())}).strict();
const disposition=z.enum(['answer','comparison-evidence','document-candidates','deny','clarification','insufficient-evidence']);

/** Pure capture, never an automatic semantic correctness judgment. */
export function captureDevelopmentReceipt(input:{case:unknown;output:unknown;kind:unknown;promptVersion:string;
  evidence:RetrievedChunk[];answer?:string;citedChunkIds?:string[]}){
  const testCase=developmentCaseSchema.parse(input.case);
  const kind=disposition.parse(input.kind);
  const evidence=input.evidence.map(chunk=>{
    const source=provenance.parse(chunk.metadata);
    if(sha(chunk.content)!==source.contentSha256)throw Error('Evidence text does not match original block hash');
    return {chunkId:chunk.id,documentId:chunk.documentId,title:chunk.title,sourceUrl:chunk.sourceUrl,
      text:chunk.content,...source};
  });
  if(new Set(evidence.map(e=>e.chunkId)).size!==evidence.length)throw Error('Duplicate evidence identifier');
  const citations=input.citedChunkIds??[];
  if(citations.some(id=>!evidence.some(e=>e.chunkId===id)))throw Error('Citation is not in captured evidence');
  if(['deny','clarification','insufficient-evidence'].includes(kind)&&citations.length)throw Error('Non-answer must not attach unrelated citations');
  return {schema:DEVELOPMENT_CAPTURE_VERSION,createdAt:new Date().toISOString(),case:testCase,
    questionSha256:sha(testCase.question),promptVersion:input.promptVersion,kind,
    output:structuredClone(input.output),outputSha256:sha(JSON.stringify(input.output)),
    answer:input.answer??null,citedChunkIds:citations,evidence,
    semanticReview:'pending' as const,releaseEligible:false as const};
}

/** Fixed development directory + exclusive creation cannot overwrite frozen receipts. */
export async function saveDevelopmentReceipt(receipt:ReturnType<typeof captureDevelopmentReceipt>){
  const root=join(process.cwd(),'tmp','ma24-development-receipts');
  await mkdir(root,{recursive:true});
  const file=join(root,`${randomUUID()}.json`);
  await writeFile(file,JSON.stringify(receipt,null,2)+'\n',{encoding:'utf8',flag:'wx'});
  return file;
}
