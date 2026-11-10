import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {checkMechanics} from './coverage.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const documents=['v1','v2'].map((version,i)=>({model:'NX410',version,documentId:`doc${i}`,assetId:`asset${i}`,contentHash:hash(`body${i}`),sourceUrl:`fixture://original/${i}`}));
const env={knowledge:{documents},originals:{documents},extension:{quotations:documents}};
const calls=()=>documents.map((d,i)=>({tool_id:'knowledge_search',input:{},output:{status:'success',data:[{documentId:d.documentId,sourceUrl:`/api/knowledge/assets/${d.assetId}`,content:`body${i}`,metadata:{assetId:d.assetId}}]}}));
test('accepts exact original bodies behind authenticated asset links',()=>assert.equal(checkMechanics('P24',calls(),env).passed,true));
test('accepts original fixture URLs only with the same bound content',()=>{
 const rows=calls();rows.forEach((r,i)=>r.output.data[0].sourceUrl=documents[i].sourceUrl);
 assert.equal(checkMechanics('P24',rows,env).passed,true);
});
for(const mutation of ['body','document','url','asset','metadata-only','binding'])test(`rejects ${mutation} mismatch`,()=>{
 const rows=calls(),e=structuredClone(env),v=rows[0].output.data[0];
 if(mutation==='body')v.content+='tampered';
 if(mutation==='document')v.documentId='other';
 if(mutation==='url')v.sourceUrl='/api/knowledge/assets/other';
 if(mutation==='asset')v.metadata.assetId='other';
 if(mutation==='metadata-only')delete v.content;
 if(mutation==='binding')delete e.originals;
 assert.equal(checkMechanics('P24',rows,e).passed,false);
});
test('accepts complete non-reconstructed revisions but not metadata or truncation',()=>{
 const rows=documents.map((d,i)=>({tool_id:'knowledge_revision_list',input:{documentId:d.documentId},output:{status:'success',data:{items:[{hash:d.contentHash,content:`body${i}`,truncated:false,reconstructed:false}]}}}));
 assert.equal(checkMechanics('P19',rows,env).passed,true);
 for(const change of [{truncated:true},{reconstructed:true},{hash:'wrong'},{content:''}]){
  const changed=structuredClone(rows);Object.assign(changed[0].output.data.items[0],change);
  assert.equal(checkMechanics('P19',changed,env).passed,false);
 }
});
test('does not accept a mere original-file listing as a body read',()=>{
 const rows=documents.map(d=>({tool_id:'knowledge_originals',input:{assetId:d.assetId},output:{status:'success',data:{documents:[{id:d.assetId,sha256:d.contentHash}]}}}));
 assert.equal(checkMechanics('P24',rows,env).passed,false);
});
