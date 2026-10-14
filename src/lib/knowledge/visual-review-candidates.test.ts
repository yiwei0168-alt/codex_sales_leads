import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import {validateVisualCandidates} from './visual-review-candidates';
import type {Block} from './extracted-tree';
const block:Block={id:'s1',unitType:'slide',unitIndex:1,blockType:'visual',quality:'pending-ocr',shapePath:[2,1],shapeIdPath:[4,7]};
const record={blockId:'s1',unitIndex:1,shapePath:[2,1],shapeIdPath:[4,7],status:'review-required',reason:'unsupported-visual-object'};
function run(records:unknown[],extra:Record<string,unknown>={}){
  const bytes=Buffer.from(JSON.stringify({schema:'pptx-visual-review-candidates-v1',sourceSha256:'a'.repeat(64),extractionArtifactSha256:'b'.repeat(64),externalCalls:0,qualityAccepted:false,extractionStatusChanged:false,records,...extra}));
  return validateVisualCandidates(bytes,{sourceSha256:'a'.repeat(64),artifactSha256:'b'.repeat(64),packageSha256:createHash('sha256').update(bytes).digest('hex')},[block]);
}
it('keeps an unsupported object explicitly unresolved',()=>expect(run([record])[0].reason).toBe('unsupported-visual-object'));
it('binds complete PDF page previews and rejects a wrong page or missing preview',()=>{
 const pdf:Block={id:'page-2-visual-review',unitType:'page',unitIndex:2,blockType:'pending-ocr',quality:'pending-ocr'};
 const item={blockId:pdf.id,unitIndex:2,unitType:'page',status:'review-required',reason:'original-page-render-requires-review',coordinateSpace:'pdf-page-render',imageFile:`${'d'.repeat(64)}.png`,reviewImageSha256:'d'.repeat(64)};
 const verify=(records:unknown[])=>{
  const bytes=Buffer.from(JSON.stringify({schema:'pdf-visual-review-candidates-v1',sourceSha256:'a'.repeat(64),extractionArtifactSha256:'b'.repeat(64),externalCalls:0,qualityAccepted:false,extractionStatusChanged:false,records}));
  return validateVisualCandidates(bytes,{sourceSha256:'a'.repeat(64),artifactSha256:'b'.repeat(64),packageSha256:createHash('sha256').update(bytes).digest('hex')},[pdf]);
 };
 expect(verify([item])[0].unitIndex).toBe(2);
 for(const records of [[],[{...item,unitIndex:1}],[{...item,imageFile:undefined}],[item,item]])expect(()=>verify(records)).toThrow();
});
it('rejects missing, duplicate and changed object identities',()=>{
  for(const records of [[],[record,record],[{...record,shapeIdPath:[4,8]}],[{...record,unitIndex:2}]])expect(()=>run(records)).toThrow();
});
it('rejects source substitution, premature acceptance and arbitrary image paths',()=>{
  expect(()=>run([record],{sourceSha256:'c'.repeat(64)})).toThrow();expect(()=>run([record],{qualityAccepted:true})).toThrow();
  expect(()=>run([{...record,imageFile:'../private.png',reviewImageSha256:'d'.repeat(64)}])).toThrow();
});
it('binds worksheet drawing references field by field, rejecting another sheet or relationship',()=>{
 const reference={kind:'drawing',relationshipId:'rId1',worksheetPart:'xl/worksheets/sheet1.xml'};
 const source={id:'sheet-1-visual-1',unitType:'sheet' as const,unitIndex:1,blockType:'pending-ocr',quality:'pending-ocr',section:'Chart',visualReference:reference};
 const item={blockId:source.id,unitIndex:1,unitType:'sheet',status:'review-required',reason:'native-sheet-visual-requires-review',sheetName:'Chart',visualReference:reference,sheetObjects:[]};
 const verify=(record:unknown)=>{
  const bytes=Buffer.from(JSON.stringify({schema:'xlsx-visual-review-candidates-v1',sourceSha256:'a'.repeat(64),extractionArtifactSha256:'b'.repeat(64),externalCalls:0,qualityAccepted:false,extractionStatusChanged:false,records:[record]}));
  return validateVisualCandidates(bytes,{sourceSha256:'a'.repeat(64),artifactSha256:'b'.repeat(64),packageSha256:createHash('sha256').update(bytes).digest('hex')},[source]);
 };
 expect(verify(item)[0].sheetName).toBe('Chart');
 expect(()=>verify({...item,sheetName:'Other'})).toThrow();
 expect(()=>verify({...item,visualReference:{...reference,relationshipId:'rId2'}})).toThrow();
});
it('binds cached spreadsheet error candidates to the pending table and exact cells',()=>{
 const cells=[{cell:'K12',value:'#VALUE!'},{cell:'L12',value:'#VALUE!'}];
 const source:Block={id:'sheet-2-table',unitType:'sheet',unitIndex:2,blockType:'table',quality:'pending-ocr',section:'Report',
  metadata:{reviewReason:'cached-spreadsheet-error',cachedErrorCount:2,cachedErrorCells:cells}};
 const item={blockId:source.id,unitIndex:2,unitType:'sheet',status:'review-required',reason:'cached-spreadsheet-error',
  sheetName:'Report',cachedErrorCount:2,cachedErrorCells:cells};
 const verify=(record:unknown)=>{
  const bytes=Buffer.from(JSON.stringify({schema:'xlsx-visual-review-candidates-v1',sourceSha256:'a'.repeat(64),extractionArtifactSha256:'b'.repeat(64),externalCalls:0,qualityAccepted:false,extractionStatusChanged:false,records:[record]}));
  return validateVisualCandidates(bytes,{sourceSha256:'a'.repeat(64),artifactSha256:'b'.repeat(64),packageSha256:createHash('sha256').update(bytes).digest('hex')},[source]);
 };
 expect(verify(item)[0].cachedErrorCount).toBe(2);
 for(const changed of [{...item,cachedErrorCount:1},{...item,cachedErrorCells:[cells[0]]},{...item,sheetName:'Data source'},
  {...item,visualReference:{kind:'drawing',relationshipId:'rId1',worksheetPart:'xl/worksheets/sheet2.xml'}}])
  expect(()=>verify(changed)).toThrow();
});
