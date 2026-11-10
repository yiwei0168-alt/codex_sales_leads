import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {bindRuntime,userId,otherUserId,id,sha,json} from '../hybrid-evaluation-v1/runtime';
import {upsertKnowledgeDocument} from '../../src/lib/rag/repository';
import {registerKnowledgeAsset,readKnowledgeAssetSnapshot} from '../../src/lib/knowledge/document-repository';
import {knowledgeOriginalsTool} from '../../src/lib/assistant/main/knowledge-originals-tool';
import {knowledgeCompareTool} from '../../src/lib/assistant/main/knowledge-compare-tool';
const root='experiments/hybrid-knowledge-originals-v2',local='.local-runtime/hybrid-knowledge-originals-v2';
process.env.KNOWLEDGE_STORAGE_ROOT=resolve(`${local}/files`);
const db=await bindRuntime();
const read=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
try{
 assert.equal((await db.query("select count(*)::int n from agent_run where status in('queued','running','waiting_user')")).rows[0].n,0);
 const fixture=await read('experiments/hybrid-evaluation-v1/business-fixtures.json');
 const old=await read('.local-runtime/hybrid-evaluation-v1/knowledge-binding.json');
 const extension=await read('.local-runtime/hybrid-local-read-extension-v1/binding.json');
 const release=id('synthetic-originals-v2-release'),documents=[];
 const existing=(await db.query('select release_id from knowledge_release_pointer_v3')).rows;
 assert(existing.every(r=>r.release_id===release),'Unexpected existing release; refuse replacement');
 await mkdir(process.env.KNOWLEDGE_STORAGE_ROOT,{recursive:true});await mkdir(`${root}/results`,{recursive:true});
 for(const doc of [...old.documents,...extension.quotations]){
  const current=(await db.query(`select d.*,k.slug collection,r.content from knowledge_document d join knowledge_collection k on k.id=d.collection_id
   join knowledge_document_revision r on r.document_id=d.id and r.content_sha256=d.content_sha256 and r.reconstructed=false where d.id=$1 and d.owner_id=$2`,[doc.documentId,userId])).rows[0];
  assert(current,'Missing owned original text revision');
  const product=doc.model?fixture.products.find((p:{model:string})=>p.model===doc.model):null;
  const ports=product?(doc.version==='v1'?product.historical.ports:product.ports):null;
  // Prospective synthetic fixture clarification, not an inferred real product spec.
  const marker='\n夹具 v2 字段定义：';
  const content=product?current.content.split(marker)[0]+`${marker}这里的端口数为以太网端口总数，不表示 PoE 供电端口数。\nEthernet ports: ${ports}.`+ (doc.version==='v2'&&product.poeBudgetW!==null?` PoE power budget: ${product.poeBudgetW} W.`:''):current.content;
  await upsertKnowledgeDocument(userId,{collection:current.collection,externalId:current.external_id,title:current.title,content,
   sourceUrl:current.source_url,sourceType:current.source_type,authorityLevel:current.authority_level,visibility:'private',
   ...(current.product_id?{productId:current.product_id}:{}),...(current.company_id?{companyId:current.company_id}:{}),metadata:{...current.metadata,originalFixture:'synthetic-originals-v2'}});
  const key=`${doc.documentId}.md`,hash=sha(content);
  try{await writeFile(resolve(process.env.KNOWLEDGE_STORAGE_ROOT,key),content,{flag:'wx'});}
  catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;assert.equal(sha(await readFile(resolve(process.env.KNOWLEDGE_STORAGE_ROOT,key),'utf8')),hash);}
  const asset=await registerKnowledgeAsset(userId,{documentId:doc.documentId,storageKey:`knowledge/${key}`,documentType:product?'synthetic-product-text':'synthetic-quote-text',version:doc.version??doc.id,
   sourceNature:'synthetic-evaluation-fixture',expectedSha256:hash});
  const bytes=await readKnowledgeAssetSnapshot(`knowledge/${key}`,hash);assert.equal(bytes.bytes!.toString('utf8'),content);
  await db.query(`update knowledge_tree_version set asset_id=$2,source_sha256=$3 where id=(select current_tree_version_id from knowledge_document where id=$1 and owner_id=$4)`,[doc.documentId,asset.id,hash,userId]);
  documents.push({...doc,assetId:asset.id,contentHash:hash,content,sourceUrl:current.source_url,ports,poeBudgetW:doc.version==='v2'?product?.poeBudgetW??null:null});
 }
 const client=await db.connect();
 try{
  await client.query('begin');
  await client.query(`insert into knowledge_release_v3(id,release_key,scope_kind,extractor_profile,chunk_profile,manifest)
   values($1,'synthetic-originals-v2','shared','synthetic-known-facts-v2','one-original-one-chunk',$2) on conflict(id) do nothing`,[release,json({synthetic:true,approval:'Fixture state only; no human review or production activation claim',vectors:false})]);
  for(const doc of documents){
   const revision=id(`originals-v2/revision/${doc.documentId}`),chunk=id(`originals-v2/chunk/${doc.documentId}`),location={unitType:'document',unitIndex:1,synthetic:true};
   await client.query(`insert into knowledge_source_revision_v3(id,release_id,asset_id,source_sha256,artifact_sha256,extractor_profile,parser_status)
    values($1,$2,$3,$4,$4,'synthetic-known-facts-v2','success') on conflict(id) do nothing`,[revision,release,doc.assetId,doc.contentHash]);
   await client.query(`insert into knowledge_chunk_v3(id,release_id,document_id,source_revision_id,chunk_index,block_type,source_location,content,canonical_embedding_text,token_estimate,content_sha256)
    values($1,$2,$3,$4,0,'text',$5,$6,$6,$7,$8) on conflict(id) do nothing`,[chunk,release,doc.documentId,revision,json(location),doc.content,Math.ceil(doc.content.length/3),doc.contentHash]);
   doc.chunkId=chunk;
   if(!doc.model)continue;
   for(const key of [doc.model,`${doc.model} ${doc.version}`]){
    const entity=id(`originals-v2/entity/${key}`);
    await client.query(`insert into knowledge_entity(id,entity_type,canonical_key,display_name,metadata) values($1,'product',$2,$2,'{"synthetic":true}') on conflict(id) do nothing`,[entity,key]);
    await client.query(`insert into knowledge_chunk_entity_v3(chunk_id,entity_id,relation_type,binding_method,binding_confidence)
     values($1,$2,'about','explicit-synthetic-version',1) on conflict do nothing`,[chunk,entity]);
    // Bare model facts describe current v2 only; historical facts require explicit v1.
    if(key===doc.model&&doc.version==='v1')continue;
    const values=[{key:'ethernet_port_count',value:doc.ports,unit:'port'},...(doc.poeBudgetW===null?[]:[{key:'poe_power_budget',value:doc.poeBudgetW,unit:'W'}])];
    for(const field of values){
     const fact=id(`originals-v2/fact/${key}/${field.key}`);
     await client.query(`insert into knowledge_fact_v3(id,release_id,source_revision_id,chunk_id,entity_id,entity_version,attribute_key,raw_field_name,typed_value,raw_value,unit,polarity,evidence_location,evidence_hash,validation_rule,validation_rule_version,verification_status,verified_at)
      values($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10,'positive',$11,$12,'synthetic-known-source-state','v2','verified',now()) on conflict(id) do nothing`,
      [fact,release,revision,chunk,entity,doc.version,field.key,json(field.value),String(field.value),field.unit,json(location),sha(`${doc.contentHash}/${field.key}/${field.value}`)]);
    }
   }
  }
  // This is explicitly a disposable fixture installer, not the production release validator.
  await client.query("update knowledge_release_v3 set status='active',activated_at=now() where id=$1",[release]);
  await client.query("insert into knowledge_release_pointer_v3(scope_kind,release_id) select 'shared',$1 where not exists(select 1 from knowledge_release_pointer_v3)",[release]);
  await client.query('commit');
 }catch(e){await client.query('rollback');throw e;}finally{client.release();}
 const context={userId,runId:id('originals-v2-check'),leaseToken:'isolated-fixture-check',role:'member' as const};
 const original=await knowledgeOriginalsTool.execute({query:'NX420 v2'},context);assert.equal(original.status,'success');
 const compare=await knowledgeCompareTool.execute({entities:['NX420 v2','NX430 v2'],attributes:['网口','PoE 功率预算']},context);
 const data=compare.data as {entities:Array<{fields:Array<{status:string;value?:number}>}>};
 assert.equal(data.entities[0].fields[0].value,16);assert.equal(data.entities[0].fields[1].value,250);
 assert.equal(data.entities[1].fields[0].value,24);assert.equal(data.entities[1].fields[1].status,'missing');
 const denied=await knowledgeOriginalsTool.execute({assetId:documents[0].assetId},{...context,userId:otherUserId});assert.equal(denied.status,'unavailable');
 const other=await knowledgeCompareTool.execute({entities:['NX420 v2','NX430 v2'],attributes:['网口','PoE 功率预算']},{...context,userId:otherUserId});
 assert((other.data as typeof data).entities.every(e=>e.fields.every(f=>f.status==='missing')));
 const binding={version:'synthetic-originals-v2',releaseId:release,documents:documents.map(({content,...d})=>{void content;return d;}),
  registeredOriginals:documents.length,realByteChecks:true,realCompareChecks:true,crossOwnerBlocked:true,newModelCalls:0,productionChanged:false,
  caveats:['Fixture approved state is seeded, not a tested human-review or release-activation workflow','No vector embeddings; real lexical/fact retrieval only','Ethernet-port semantics explicitly clarified in new synthetic original revisions','Historical performance runs remain closed; no score or receipt rewriting']};
 await writeFile(`${local}/binding.json`,json(binding));await writeFile(`${root}/results/binding.json`,json(binding));console.log(json({registeredOriginals:documents.length,realCompareChecks:true,crossOwnerBlocked:true,newModelCalls:0}));
}finally{await db.end();const {getPool}=await import('../../src/lib/rag/db');await getPool().end();}
