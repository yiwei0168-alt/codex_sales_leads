import {createHash} from 'node:crypto';

/** Inspect the immutable artifact, never the extractor's summary alone. */
export function extractionReadiness(bytes:Uint8Array, expected:{artifactSha256:string;sourceSha256:string;extractorVersion:string}) {
  if(!/^[a-f0-9]{64}$/.test(expected.artifactSha256)||createHash('sha256').update(bytes).digest('hex')!==expected.artifactSha256)
    throw new Error('Extraction artifact hash mismatch');
  const artifact=JSON.parse(Buffer.from(bytes).toString('utf8'));
  const document=artifact?.documents?.[0];
  if(!Array.isArray(artifact?.documents)||artifact.documents.length!==1||document?.sourceSha256!==expected.sourceSha256
    ||document?.extractorVersion!==expected.extractorVersion||!Array.isArray(document?.blocks)||!document.blocks.length)
    throw new Error('Extraction identity mismatch');
  const ids=new Set<string>();
  let unresolvedBlocks=0;
  for(const block of document.blocks){
    if(!block||typeof block.id!=='string'||!block.id.trim()||ids.has(block.id)||typeof block.quality!=='string')
      throw new Error('Invalid extraction block');
    ids.add(block.id);
    if(!['success','blank'].includes(block.quality))unresolvedBlocks++;
  }
  return {reviewRequired:unresolvedBlocks>0,unresolvedBlocks};
}
