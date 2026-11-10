import {createHash} from 'node:crypto';
import {checkMechanics as legacyMechanics} from '../hybrid-evaluation-quality-v13/mechanics.mjs';
const hash=body=>createHash('sha256').update(body.replaceAll('\r\n','\n')).digest('hex');

/** Prospective coverage for the whole-document synthetic fixture, not generic RAG grading. */
export function checkMechanics(taskId,calls,env){
 if(!['P19','P20','P24'].includes(taskId))return legacyMechanics(taskId,calls,env);
 const originals=env.originals?.documents??[];
 const selected=taskId==='P19'?env.extension.quotations:env.knowledge.documents.filter(d=>taskId==='P20'?['NX420','NX430'].includes(d.model)&&d.version==='v2':d.model==='NX410');
 const reads=calls.filter(c=>['success','partial'].includes(c.output?.status));
 const checks=selected.map(d=>{
  const bound=originals.find(o=>o.documentId===d.documentId);
  if(!bound?.assetId||!bound.contentHash)return {id:d.documentId,present:false,reason:'missing-original-binding'};
  const valid=[];
  function inspect(value){
   if(Array.isArray(value)){value.forEach(inspect);return;}
   if(!value||typeof value!=='object')return;
   if(value.documentId===bound.documentId&&typeof value.content==='string'
    &&hash(value.content)===bound.contentHash
    &&[bound.sourceUrl,`/api/knowledge/assets/${bound.assetId}`].filter(Boolean).includes(value.sourceUrl)
    &&(!value.metadata?.assetId||value.metadata.assetId===bound.assetId))valid.push(true);
   Object.values(value).filter(v=>v&&typeof v==='object').forEach(inspect);
  }
  for(const call of reads){
   if(['knowledge_search','knowledge_compare'].includes(call.tool_id))inspect(call.output.data);
   if(call.tool_id==='knowledge_revision_list'&&call.input.documentId===bound.documentId){
    for(const item of call.output.data?.items??[])if(item.truncated===false&&item.reconstructed===false
     &&typeof item.content==='string'&&item.hash===bound.contentHash&&hash(item.content)===bound.contentHash)valid.push(true);
   }
  }
  return {id:d.documentId,present:valid.length>0};
 });
 return {passed:checks.length===2&&checks.every(c=>c.present),kind:'bound-full-original-coverage-v2',checks};
}
