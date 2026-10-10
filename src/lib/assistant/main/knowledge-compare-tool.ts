import {z} from 'zod';
import {hybridSearch,authorizedKnowledgeChunkIds} from '@/lib/rag/repository';
import {resolveVerifiedFacts} from '@/lib/knowledge/fact-repository';
import {buildControlledLexicalQuery} from '@/lib/knowledge/query-normalizer';
import registry from '../../../../config/knowledge/attribute-registry.v1.json';
import type {RetrievedChunk} from '@/lib/rag/types';
import {defineTool} from './tool-definition';
import {result} from './contracts';

export const knowledgeCompareInput=z.object({
  entities:z.array(z.string().trim().min(1).max(180)).length(2)
    .refine(values=>new Set(values.map(v=>v.toLowerCase())).size===2,'Two distinct explicit entities required'),
  attributes:z.array(z.string().trim().min(1).max(120)).min(1).max(6)
    .refine(values=>new Set(values).size===values.length,'Duplicate attributes'),
}).strict();

export const knowledgeCompareTool=defineTool({id:'knowledge_compare',
  description:'Read two explicit product entities independently for up to six requested attribute keys or field names. Returns a per-entity field matrix, verifiedFacts and separate full raw evidence. Missing or conflicting verified fields remain unresolved; raw retrieval is not verification. Uses local lexical/fact queries, max four evidence blocks per entity, eight total. Ask for unclear entities first. Only product collection; never infers absent specifications.',
  input:knowledgeCompareInput,
  execute:async(i,c)=>{
    if(c.knowledgeScope&&!c.knowledgeScope.includes('product'))return result({kind:'deny',reason:'collection-scope',
      message:'当前选定资料范围不包含产品资料，不能跨范围读取。'}, {status:'unavailable',cost:'known'});
    const packets=await Promise.all(i.entities.map(async entity=>{
      const [facts,searches]=await Promise.all([
        resolveVerifiedFacts(c.userId,entity,i.attributes),
        Promise.all(i.attributes.map(async attribute=>{
          const aliases=registry.attributes.find(a=>a.key===attribute)?.aliases??[attribute.replace(/_/g,' ')];
          const question=`${entity} ${aliases.join(' ')}`;
          const chunks=await hybridSearch(c.userId,question,null,{collections:['product'],
            structuredProductTerms:[entity],lexicalQuery:buildControlledLexicalQuery(question)},4);
          return {attribute,chunks};
        })),
      ]);
      // Take one result per field before second results; one entity cannot
      // consume the other entity's evidence budget.
      const selected:RetrievedChunk[]=[];
      for(let rank=0;rank<4&&selected.length<4;rank++)for(const search of searches){
        const chunk=search.chunks[rank];
        if(chunk&&!selected.some(item=>item.id===chunk.id)&&selected.length<4)selected.push(chunk);
      }
      return {entity,facts,searches,selected};
    }));
    const ids=[...new Set(packets.flatMap(p=>[...p.selected.map(s=>s.id),...p.facts.flatMap(f=>f.chunkId?[f.chunkId]:[])]))];
    const allowed=await authorizedKnowledgeChunkIds(c.userId,ids);
    const entities=packets.map(packet=>{
      const evidence=packet.selected.filter(s=>allowed.has(s.id));
      const verifiedFacts=packet.facts.filter(f=>f.status==='verified'&&f.chunkId&&allowed.has(f.chunkId));
      const fields=i.attributes.map(attribute=>{
        const matching=verifiedFacts.filter(f=>f.attributeKey===attribute);
        const values=new Set(matching.map(f=>JSON.stringify([f.typedValue,f.unit])));
        const evidenceIds=evidence.filter(e=>packet.searches.find(s=>s.attribute===attribute)!.chunks.some(s=>s.id===e.id)).map(e=>e.id);
        return {attribute,status:values.size>1?'conflicting':values.size===1?'verified':'missing',
          factIds:matching.map(f=>f.id),evidenceIds,
          ...(values.size===1?{value:matching[0].typedValue,unit:matching[0].unit}:{})};
      });
      return {entity:packet.entity,fields,verifiedFacts,evidence,
        evidenceLimit:4,partial:fields.some(f=>f.status!=='verified'),
        missingFields:fields.filter(f=>f.status!=='verified').map(f=>f.attribute),
        unsearchedScope:'Only four lexical/fact candidates per requested field were considered; at most four blocks retained for this entity. Other documents and fields are unsearched.'};
    });
    const partial=entities.some(e=>e.partial);
    return result({kind:'comparison-evidence',entities,partial,evidenceLimit:8,
      boundary:'evidenceIds are navigation matches, not proof of a field value. Only verifiedFacts establish formal facts. Missing is not false; do not infer equality, capability absence or power budgets.'},
      {status:partial?'partial':'success',cost:'known',missing:entities.flatMap(e=>e.missingFields.map(field=>`${e.entity}: ${field}`))});
  }});
