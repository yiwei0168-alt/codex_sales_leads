import {readFile,writeFile} from 'node:fs/promises';
import {bindRuntime,userId,json,local,sha,verifyDesign,id} from './runtime';
const designHash=await verifyDesign(),admin=await bindRuntime();
try{
 const {upsertKnowledgeDocument}=await import('../../src/lib/rag/repository');
 const fixtures=JSON.parse(await readFile('experiments/hybrid-evaluation-v1/business-fixtures.json','utf8'));
 const documents=[];
 for(const p of fixtures.products)for(const version of ['v1','v2']){
  const historical=version==='v1',title=`${p.model} ${version} ${historical?'历史规格':'当前已批准规格'}`;
  const content=historical?`# ${title}\n型号：${p.model}；版本：v1。端口数：${p.historical.ports}。此历史记录仅提供端口数量；没有说明后续变化的原因。`
   :`# ${title}\n型号：${p.model}；版本：v2；批准日期：${p.approvedDate}。端口数：${p.ports}。PoE 功率预算：${p.poeBudgetW===null?'未提供':`${p.poeBudgetW} W`}。保修期：${p.warrantyMonths} 个月。没有说明与旧版差异的原因。`;
  const saved=await upsertKnowledgeDocument(userId,{collection:'product',externalId:`eval/${p.model}/${version}`,title,content,
   sourceUrl:historical?p.historical.source:p.source,sourceType:'synthetic-evaluation-text',authorityLevel:5,visibility:'private',productId:p.model,
   metadata:{synthetic:true,fixtureVersion:fixtures.version,version}});
  documents.push({model:p.model,version,documentId:saved.documentId,contentHash:sha(content)});
 }
 const {productTools}=await import('../../src/lib/assistant/main/tools');
 const tool=productTools.find(t=>t.id==='knowledge_search')!;
 const output=await tool.execute({query:'NX410',limit:8,collections:['product']},{userId,runId:id('knowledge-check'),leaseToken:'isolated-read-check',role:'member',mode:'deep'});
 if(!Array.isArray(output.data)||output.data.length!==2)throw Error('Expected two real current-accessible NX410 document sources');
 const binding={designHash,documents,realSearchSources:output.data.length,paidCalls:0,productionDataAccess:false,
  sourceScope:'Private synthetic text revisions using real save/index/search; no shared production index copied.'};
 await writeFile(`${local}/knowledge-binding.json`,json(binding));console.log(json({knowledgeDocuments:documents.length,realSearchSources:output.data.length,paidCalls:0}));
}finally{await admin.end();const {getPool}=await import('../../src/lib/rag/db');await getPool().end();}
