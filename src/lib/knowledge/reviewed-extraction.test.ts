import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import {deriveReviewedExtraction,verifyReviewedExtraction,type ExtractionJudgment} from './reviewed-extraction';
const sourceSha256='a'.repeat(64),extractorVersion='layout-test';
const original=Buffer.from(JSON.stringify({documents:[{sourceSha256,extractorVersion,blocks:[{id:'native',quality:'success',unitType:'slide',unitIndex:1,blockType:'text',text:'Original'},
  {id:'visual',quality:'pending-ocr',unitType:'slide',unitIndex:1,shapePath:[2],shapeIdPath:[7]}]}]}));
const input={receiptId:'receipt',sourceSha256,extractorVersion,artifactSha256:createHash('sha256').update(original).digest('hex')};
const row:ExtractionJudgment={block_id:'visual',revision:2,decision:'evidence',evidence_text:'Reviewed words',source_sha256:sourceSha256,extractor_version:extractorVersion};
it('preserves original blocks and coordinates with review provenance',()=>{
  const derived=JSON.parse(deriveReviewedExtraction(original,input,[row]).toString());
  expect(derived.documents[0].blocks[0].text).toBe('Original');
  expect(derived.documents[0].blocks[1]).toMatchObject({text:'Reviewed words',quality:'success',shapeIdPath:[7],review:{receiptId:'receipt',revision:2,originalQuality:'pending-ocr'}});
  expect(original.toString()).not.toContain('Reviewed words');
});
it('rejects incomplete, unresolved, cross-version and duplicate decisions',()=>{
  for(const rows of [[],[row,row],[{...row,decision:'unresolved'}],[{...row,source_sha256:'b'.repeat(64)}],[{...row,evidence_text:''}]])expect(()=>deriveReviewedExtraction(original,input,rows)).toThrow();
});
it('keeps decoration excluded from evidence',()=>{
  const derived=JSON.parse(deriveReviewedExtraction(original,input,[{...row,decision:'decoration',evidence_text:''}]).toString());
  expect(derived.documents[0].blocks[1]).toMatchObject({quality:'blank',blockType:'reviewed-decoration',text:''});
});
it('rejects reviewed blocks with a stripped receipt before database access',async()=>{
  const artifact=JSON.parse(deriveReviewedExtraction(original,input,[row]).toString());delete artifact.reviewReceiptId;
  await expect(verifyReviewedExtraction('owner','job',Buffer.from(JSON.stringify(artifact)))).rejects.toThrow('Missing extraction review receipt');
});
