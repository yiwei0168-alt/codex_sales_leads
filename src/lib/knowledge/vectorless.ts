import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {tenantQuery,tenantTransaction} from "@/lib/rag/db";
import {assertResolvedInsideKnowledgeRoot,safeKnowledgeStorageKey} from "./document-repository";

const digest=(value:Uint8Array|string)=>createHash("sha256").update(value).digest("hex");
type Block={id:string;unitType:"page"|"slide"|"sheet"|"document";unitIndex:number;blockType:string;quality:string;text?:string;section?:string;bbox?:number[];table?:{headers?:unknown[];rows?:unknown[][];startRow?:number}};
type Artifact={documents?:Array<{sourceSha256:string;extractorVersion:string;blocks:Block[]}>};
const unitKey=(block:Block)=>`${block.unitType}:${block.unitIndex}`;
export function evidenceText(block:Block):string{
  if(block.blockType==="table"&&block.table){
    const rows=[block.table.headers??[],...(block.table.rows??[])];
    return rows.map(row=>row.map(cell=>String(cell??"").replaceAll("\t"," ").replaceAll("\n"," ")).join("\t")).join("\n").trim();
  }
  return block.text?.trim()??"";
}

/** Build one approved document in a single transaction. Any failure leaves its old pointer intact. */
export async function indexExtractedDocument(userId:string,jobId:string){
  const [actor]=await tenantQuery<{role:string}>(userId,"select role from app_user where id=$1 and status='active'",[userId]);
  if(actor?.role!=="admin"&&actor?.role!=="member")throw new Error("Active account required");
  const [job]=await tenantQuery<{id:string;status:string;visibility:string;published_document_id:string;published_asset_id:string;source_sha256:string;extractor_version:string;storage_key:string;extraction_artifact_key:string;metrics:{artifactSha256?:string}}>(userId,
    `select id,status,visibility,published_document_id,published_asset_id,source_sha256,extractor_version,storage_key,extraction_artifact_key,metrics
     from knowledge_upload_job where id=$1 and user_id=$2`,[jobId,userId]);
  if(!job||job.status!=="registered"||!job.published_document_id||!job.published_asset_id||!job.extraction_artifact_key)throw new Error("Registered extracted document required");
  if(job.visibility==="shared"&&actor.role!=="admin")throw new Error("Shared tree requires administrator");
  const sourcePath=resolve(safeKnowledgeStorageKey(job.storage_key));assertResolvedInsideKnowledgeRoot(sourcePath);
  const artifactPath=resolve(safeKnowledgeStorageKey(job.extraction_artifact_key));assertResolvedInsideKnowledgeRoot(artifactPath);
  const [sourceBytes,artifactBytes]=await Promise.all([readFile(sourcePath),readFile(artifactPath)]);
  if(digest(sourceBytes)!==job.source_sha256)throw new Error("Source hash mismatch");
  const artifactHash=digest(artifactBytes);
  if(!job.metrics.artifactSha256||artifactHash!==job.metrics.artifactSha256)throw new Error("Artifact hash mismatch");
  const artifact=JSON.parse(artifactBytes.toString("utf8")) as Artifact;
  const doc=artifact.documents?.[0];
  if(artifact.documents?.length!==1||!doc||doc.sourceSha256!==job.source_sha256||doc.extractorVersion!==job.extractor_version||!Array.isArray(doc.blocks))throw new Error("Extraction identity mismatch");
  if(doc.blocks.some(block=>block.quality!=="success"&&block.quality!=="blank"))throw new Error("Unresolved extraction units");
  const blocks=doc.blocks.filter(block=>block.quality==="success"&&evidenceText(block));
  if(!blocks.length||blocks.some(block=>!block.id||!Number.isInteger(block.unitIndex)||block.unitIndex<1))throw new Error("No complete evidence blocks");
  const units=[...new Map(blocks.map(block=>[unitKey(block),block])).values()];
  return tenantTransaction(userId,async client=>{
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[job.published_document_id]);
    const asset=await client.query<{id:string}>(`select a.id from knowledge_asset a join knowledge_document d on d.id=a.document_id
      where a.id=$1 and d.id=$2 and a.source_sha256=$3 and a.registration_status='registered' and d.status='active'
        and d.owner_id=$4 and d.metadata->>'sourceSha256'=$3 for update of d`,
      [job.published_asset_id,job.published_document_id,job.source_sha256,userId]);
    if(!asset.rows[0])throw new Error("Approved source no longer current");
    const existing=await client.query<{id:string;status:string;artifact_sha256:string}>(`select id,status,artifact_sha256 from knowledge_tree_version where document_id=$1 and source_sha256=$2 and extractor_version=$3 for update`,
      [job.published_document_id,job.source_sha256,doc.extractorVersion]);
    if(existing.rows[0]&&existing.rows[0].artifact_sha256!==artifactHash)throw new Error("Conflicting artifact for document source and extractor version");
    if(existing.rows[0]?.status==="ready"){
      await client.query("update knowledge_document set current_tree_version_id=$2 where id=$1",[job.published_document_id,existing.rows[0].id]);
      return {versionId:existing.rows[0].id,reused:true,nodes:blocks.length+units.length};
    }
    const version=existing.rows[0]??(await client.query<{id:string}>(`insert into knowledge_tree_version(document_id,asset_id,source_sha256,extractor_version,artifact_sha256)
      values($1,$2,$3,$4,$5) returning id`,[job.published_document_id,job.published_asset_id,job.source_sha256,doc.extractorVersion,artifactHash])).rows[0];
    await client.query("delete from knowledge_tree_node where version_id=$1",[version.id]);
    const parents=new Map<string,string>();
    for(const [ordinal,block] of units.entries()){
      const title=block.section?.trim()||`${block.unitType} ${block.unitIndex}`;
      const inserted=await client.query<{id:string}>(`insert into knowledge_tree_node(version_id,ordinal,node_kind,title,heading_path,unit_type,unit_index,source_location)
        values($1,$2,'unit',$3,$4,$5,$6,$7) returning id`,[version.id,ordinal,title,[title],block.unitType,block.unitIndex,JSON.stringify({unitType:block.unitType,unitIndex:block.unitIndex})]);
      parents.set(unitKey(block),inserted.rows[0].id);
    }
    for(const [ordinal,block] of blocks.entries()){
      const parent=parents.get(unitKey(block));if(!parent)throw new Error("Missing unit parent");
      const content=evidenceText(block);
      await client.query(`insert into knowledge_tree_node(version_id,parent_id,ordinal,node_kind,title,heading_path,unit_type,unit_index,source_location,content,content_sha256)
        values($1,$2,$3,'evidence',$4,$5,$6,$7,$8,$9,$10)`,[version.id,parent,ordinal,block.id,[block.section??`${block.unitType} ${block.unitIndex}`],block.unitType,block.unitIndex,
          JSON.stringify({unitType:block.unitType,unitIndex:block.unitIndex,blockId:block.id,bbox:block.bbox??null,startRow:block.table?.startRow??null}),content,digest(content)]);
    }
    const count=await client.query<{count:string}>("select count(*)::text as count from knowledge_tree_node where version_id=$1",[version.id]);
    if(Number(count.rows[0].count)!==blocks.length+units.length)throw new Error("Tree completeness check failed");
    await client.query("update knowledge_tree_version set status='ready',ready_at=now(),error_code=null where id=$1",[version.id]);
    await client.query("update knowledge_document set current_tree_version_id=$2 where id=$1",[job.published_document_id,version.id]);
    return {versionId:version.id,reused:false,nodes:blocks.length+units.length};
  },actor.role);
}

export async function searchDocuments(userId:string,query:string,filters:{market?:string;companyId?:string;productId?:string}={}){
  return tenantQuery<{documentId:string;title:string;versionId:string;reason:string}>(userId,`select d.id as "documentId",d.title,v.id as "versionId",
    case when n.id is not null then 'fulltext' else 'title' end as reason
    from knowledge_document d join knowledge_tree_version v on v.id=d.current_tree_version_id
    join knowledge_asset a on a.id=v.asset_id and a.registration_status='registered' and a.source_sha256=v.source_sha256
    left join lateral(select id from knowledge_tree_node where version_id=v.id and node_kind='evidence'
      and search_vector @@ websearch_to_tsquery('simple',$1) limit 1)n on true
    where d.status='active' and v.status='ready' and d.metadata->>'sourceSha256'=v.source_sha256
      and (d.owner_id=$2 or d.visibility='shared')
      and ($3::text is null or d.market=$3) and ($4::text is null or d.company_id=$4) and ($5::text is null or d.product_id=$5)
      and (n.id is not null or d.title ilike '%'||$1||'%') order by (n.id is not null) desc,d.title limit 24`,
    [query,userId,filters.market??null,filters.companyId??null,filters.productId??null]);
}
export async function browseTree(userId:string,documentId:string,parentId:string|null=null){
  return tenantQuery<{id:string;title:string;node_kind:string;unit_type:string;unit_index:number}>(userId,`select n.id,n.title,n.node_kind,n.unit_type,n.unit_index from knowledge_tree_node n
    join knowledge_tree_version v on v.id=n.version_id join knowledge_document d on d.current_tree_version_id=v.id
    join knowledge_asset a on a.id=v.asset_id and a.registration_status='registered' and a.source_sha256=v.source_sha256
    where d.id=$1 and d.status='active' and v.status='ready' and d.metadata->>'sourceSha256'=v.source_sha256
      and (d.owner_id=$2 or d.visibility='shared')
      and n.parent_id is not distinct from $3::uuid order by n.ordinal limit 200`,[documentId,userId,parentId]);
}
export async function readEvidence(userId:string,nodeId:string){
  const rows=await tenantQuery<{id:string;documentId:string;content:string;source_location:Record<string,unknown>;source_sha256:string}>(userId,`select n.id,d.id as "documentId",n.content,n.source_location,v.source_sha256
    from knowledge_tree_node n join knowledge_tree_version v on v.id=n.version_id join knowledge_document d on d.current_tree_version_id=v.id
    join knowledge_asset a on a.id=v.asset_id where n.id=$1 and n.node_kind='evidence' and v.status='ready'
      and d.status='active' and d.metadata->>'sourceSha256'=v.source_sha256
      and a.registration_status='registered' and a.source_sha256=v.source_sha256
      and (d.owner_id=$2 or d.visibility='shared')`,[nodeId,userId]);
  return rows[0]??null;
}
export async function aggregateDocumentSet(userId:string,documentIds:string[]){
  const ids=[...new Set(documentIds)].slice(0,24);
  const rows=await tenantQuery<{documentId:string}>(userId,`select d.id as "documentId" from knowledge_document d
    join knowledge_tree_version v on v.id=d.current_tree_version_id join knowledge_asset a on a.id=v.asset_id
    where d.id=any($1::uuid[]) and d.status='active' and d.metadata->>'sourceSha256'=v.source_sha256
      and v.status='ready' and a.registration_status='registered'
      and (d.owner_id=$2 or d.visibility='shared') order by d.id`,[ids,userId]);
  return {documentIds:rows.map(row=>row.documentId),count:rows.length,truncated:documentIds.length>24};
}
