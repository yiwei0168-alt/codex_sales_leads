import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {extractionReadiness} from './extraction-readiness';

function fixture(blocks:unknown[]){
  const sourceSha256='a'.repeat(64),extractorVersion='layout-test';
  const bytes=Buffer.from(JSON.stringify({documents:[{sourceSha256,extractorVersion,blocks}],qualitySummary:{success:99}}));
  return {bytes,expected:{sourceSha256,extractorVersion,artifactSha256:createHash('sha256').update(bytes).digest('hex')}};
}
describe('immutable extraction readiness',()=>{
  it('holds mixed visual objects despite an optimistic summary',()=>{
    const f=fixture([{id:'text',quality:'success'},{id:'image',quality:'pending-ocr'},{id:'chart',quality:'review-required'}]);
    expect(extractionReadiness(f.bytes,f.expected)).toEqual({reviewRequired:true,unresolvedBlocks:2});
  });
  it('allows complete and proven blank blocks',()=>{
    const f=fixture([{id:'text',quality:'success'},{id:'empty-page',quality:'blank'}]);
    expect(extractionReadiness(f.bytes,f.expected)).toEqual({reviewRequired:false,unresolvedBlocks:0});
  });
  it('rejects modified bytes and mismatched source or extractor',()=>{
    const f=fixture([{id:'text',quality:'success'}]);
    expect(()=>extractionReadiness(Buffer.concat([f.bytes,Buffer.from(' ')]),f.expected)).toThrow('hash mismatch');
    expect(()=>extractionReadiness(f.bytes,{...f.expected,sourceSha256:'b'.repeat(64)})).toThrow('identity mismatch');
    expect(()=>extractionReadiness(f.bytes,{...f.expected,extractorVersion:'other'})).toThrow('identity mismatch');
  });
  it.each([{blocks:[]},{blocks:[{id:'x',quality:'success'},{id:'x',quality:'blank'}]},{blocks:[{id:'x'}]}])('rejects missing or ambiguous blocks %#',({blocks})=>{
    const f=fixture(blocks);expect(()=>extractionReadiness(f.bytes,f.expected)).toThrow();
  });
});
