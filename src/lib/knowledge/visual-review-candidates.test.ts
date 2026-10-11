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
it('rejects missing, duplicate and changed object identities',()=>{
  for(const records of [[],[record,record],[{...record,shapeIdPath:[4,8]}],[{...record,unitIndex:2}]])expect(()=>run(records)).toThrow();
});
it('rejects source substitution, premature acceptance and arbitrary image paths',()=>{
  expect(()=>run([record],{sourceSha256:'c'.repeat(64)})).toThrow();expect(()=>run([record],{qualityAccepted:true})).toThrow();
  expect(()=>run([{...record,imageFile:'../private.png',reviewImageSha256:'d'.repeat(64)}])).toThrow();
});
