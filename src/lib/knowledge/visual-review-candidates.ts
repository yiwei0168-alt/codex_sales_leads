import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {z} from 'zod';
import {assertResolvedInsideKnowledgeRoot,safeKnowledgeStorageKey} from './document-repository';
import type {Block} from './extracted-tree';
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const sha=z.string().regex(/^[a-f0-9]{64}$/);
const ocrLines=z.array(z.object({text:z.string(),confidence:z.number(),box:z.array(z.array(z.number()))}));
const candidate=z.object({blockId:z.string(),unitIndex:z.number().int().positive(),unitType:z.enum(['page','sheet']).optional(),shapePath:z.array(z.number().int().positive()).optional(),shapeIdPath:z.array(z.number().int().positive()).optional(),
  sheetName:z.string().optional(),visualReference:z.object({kind:z.string(),worksheetPart:z.string(),relationshipId:z.string().nullable()}).optional(),
  sheetObjects:z.array(z.object({kind:z.string(),objectIndex:z.number().int().positive(),anchor:z.string(),text:z.string(),sourcePart:z.string(),images:z.array(z.object({imageIndex:z.number().int().positive(),imageFile:z.string(),reviewImageSha256:sha,ocrLines:ocrLines.optional()})).optional()})).optional(),
  status:z.literal('review-required'),reason:z.string(),imageFile:z.string().optional(),reviewImageSha256:sha.optional(),
  rotation:z.number().optional(),coordinateSpace:z.string().optional(),
  ocrLines:ocrLines.optional(),
  diagram:z.object({diagramSha256:sha,points:z.array(z.object({modelId:z.string().nullable(),type:z.string().nullable(),text:z.string()})),connections:z.array(z.record(z.string(),z.string().nullable()))}).optional(),
  connector:z.record(z.string(),z.unknown()).optional(),
});
export type VisualCandidate=z.infer<typeof candidate>;
export function validateVisualCandidates(bytes:Uint8Array,expected:{sourceSha256:string;artifactSha256:string;packageSha256:string},blocks:Block[]){
  if(hash(bytes)!==expected.packageSha256)throw new Error('Visual package hash mismatch');
  const payload=z.object({schema:z.enum(['pptx-visual-review-candidates-v1','pdf-visual-review-candidates-v1','xlsx-visual-review-candidates-v1']),sourceSha256:sha,extractionArtifactSha256:sha,
    externalCalls:z.literal(0),qualityAccepted:z.literal(false),extractionStatusChanged:z.literal(false),records:z.array(candidate)}).parse(JSON.parse(Buffer.from(bytes).toString('utf8')));
  if(payload.sourceSha256!==expected.sourceSha256||payload.extractionArtifactSha256!==expected.artifactSha256)throw new Error('Visual package identity mismatch');
  const unitType=payload.schema==='pdf-visual-review-candidates-v1'?'page':payload.schema==='xlsx-visual-review-candidates-v1'?'sheet':'slide';
  const pending=blocks.filter(block=>block.quality==='pending-ocr'),byId=new Map(pending.map(block=>[block.id,block]));
  if(pending.some(block=>block.unitType!==unitType))throw new Error('Visual format mismatch');
  const seen=new Set<string>();
  for(const record of payload.records){
    const block=byId.get(record.blockId);
    if(!block||seen.has(record.blockId)||block.unitIndex!==record.unitIndex||JSON.stringify(block.shapePath)!==JSON.stringify(record.shapePath)
      ||JSON.stringify(block.shapeIdPath)!==JSON.stringify(record.shapeIdPath))throw new Error('Visual object identity mismatch');
    if(unitType==='page'&&(record.unitType!=='page'||record.coordinateSpace!=='pdf-page-render'||!record.imageFile))throw new Error('Incomplete PDF preview');
    if(unitType==='slide'&&(!record.shapePath?.length||!record.shapeIdPath?.length||record.unitType))throw new Error('Incomplete slide locator');
    if(unitType==='sheet'){
      const source=block as Block & {visualReference?:VisualCandidate['visualReference']};
      if(record.unitType!=='sheet'||record.sheetName!==block.section||!source.visualReference||!record.visualReference
        ||source.visualReference.kind!==record.visualReference.kind||source.visualReference.worksheetPart!==record.visualReference.worksheetPart
        ||source.visualReference.relationshipId!==record.visualReference.relationshipId||!record.sheetObjects)throw new Error('Sheet visual identity mismatch');
    }
    if(record.imageFile&&(!record.reviewImageSha256||record.imageFile!==`${record.reviewImageSha256}.png`))throw new Error('Invalid visual image path');
    const objectIds=new Set<number>();
    for(const object of record.sheetObjects??[]){
      if(objectIds.has(object.objectIndex))throw new Error('Duplicate sheet visual object');objectIds.add(object.objectIndex);
      const imageIds=new Set<number>();for(const image of object.images??[]){
        if(imageIds.has(image.imageIndex)||image.imageFile!==`${image.reviewImageSha256}.png`)throw new Error('Invalid sheet image');imageIds.add(image.imageIndex);
      }
    }
    seen.add(record.blockId);
  }
  if(!pending.length||seen.size!==pending.length)throw new Error('Incomplete visual package');
  return payload.records;
}
export async function readVisualCandidateImage(packageKey:string,record:Pick<VisualCandidate,'imageFile'|'reviewImageSha256'>){
  if(!record.reviewImageSha256||record.imageFile!==`${record.reviewImageSha256}.png`)throw new Error('No candidate image');
  const path=resolve(dirname(safeKnowledgeStorageKey(packageKey)),record.imageFile);assertResolvedInsideKnowledgeRoot(path);
  const bytes=await readFile(path);
  if(hash(bytes)!==record.reviewImageSha256||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error('Candidate image changed');
  return bytes;
}
export async function loadVisualCandidates(metrics:{visualReviewKey?:string;visualReviewSha256?:string},sourceSha256:string,artifactSha256:string,blocks:Block[]){
  if(!metrics.visualReviewKey&&!metrics.visualReviewSha256)return null;
  if(!metrics.visualReviewKey||!metrics.visualReviewSha256)throw new Error('Incomplete visual package binding');
  const path=resolve(safeKnowledgeStorageKey(metrics.visualReviewKey));assertResolvedInsideKnowledgeRoot(path);
  return validateVisualCandidates(await readFile(path),{sourceSha256,artifactSha256,packageSha256:metrics.visualReviewSha256},blocks);
}
export async function verifyVisualCandidateImages(packageKey:string,records:VisualCandidate[]){
  for(const record of records){
    if(record.imageFile)await readVisualCandidateImage(packageKey,record);
    for(const object of record.sheetObjects??[])for(const image of object.images??[])await readVisualCandidateImage(packageKey,image);
  }
}
