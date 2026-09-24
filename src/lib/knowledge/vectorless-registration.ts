import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {extname,resolve} from "node:path";
import {tenantQuery,tenantTransaction} from "@/lib/rag/db";
import {assertResolvedInsideKnowledgeRoot,safeKnowledgeStorageKey} from "./document-repository";
import {evidenceText,indexExtractedDocument} from "./vectorless";

const sha=(value:Uint8Array|string)=>createHash("sha256").update(value).digest("hex");
type Job={id:string;status:string;visibility:"private"|"shared";collection_slug:string;title:string;source_url:string|null;entity_key:string|null;storage_key:string;extraction_artifact_key:string|null;source_sha256:string;extractor_version:string|null;mime_type:string;byte_size:string;metrics:{artifactSha256?:string};published_document_id:string|null;published_asset_id:string|null};
type Block={id:string;unitType:"page"|"slide"|"sheet"|"document";unitIndex:number;blockType:string;quality:string;text?:string;section?:string;table?:{headers?:unknown[];rows?:unknown[][];startRow?:number}};

/** Register approved shared or owned private extraction without creating embeddings. */
export async function registerVectorlessUpload(userId:string,jobId:string,options:{language:string;authorityLevel:1|2|3|4|5;expectedSourceSha256?:string}){
  const [actor]=await tenantQuery<{role:string}>(userId,"select role from app_user where id=$1 and status='active'",[userId]);
  if(actor?.role!=="admin"&&actor?.role!=="member")throw new Error("Active account required");
  const [job]=await tenantQuery<Job>(userId,`select id,status,visibility,collection_slug,title,source_url,entity_key,storage_key,extraction_artifact_key,
    source_sha256,extractor_version,mime_type,byte_size::text,metrics,published_document_id,published_asset_id
    from knowledge_upload_job where id=$1 and user_id=$2`,[jobId,userId]);
  if(!job||!job.extraction_artifact_key||!job.extractor_version||!['extracted','registered'].includes(job.status))throw new Error("Completed owned extraction required");
  if(options.expectedSourceSha256&&options.expectedSourceSha256!==job.source_sha256)throw new Error("Observed source hash changed");
  if(job.visibility==="shared"&&actor.role!=="admin")throw new Error("Shared publication requires administrator");
  if(job.collection_slug==="product"&&!job.entity_key)throw new Error("Product model/SKU required");
  const source=resolve(safeKnowledgeStorageKey(job.storage_key));assertResolvedInsideKnowledgeRoot(source);
  const artifactPath=resolve(safeKnowledgeStorageKey(job.extraction_artifact_key));assertResolvedInsideKnowledgeRoot(artifactPath);
  const [sourceBytes,artifactBytes]=await Promise.all([readFile(source),readFile(artifactPath)]);
  if(sourceBytes.length!==Number(job.byte_size)||sha(sourceBytes)!==job.source_sha256)throw new Error("Source bytes changed after upload");
  if(!job.metrics.artifactSha256||sha(artifactBytes)!==job.metrics.artifactSha256)throw new Error("Extraction artifact hash mismatch");
  const artifact=JSON.parse(artifactBytes.toString("utf8")) as {documents?:Array<{sourceSha256?:string;extractorVersion?:string;blocks?:Block[]}>};
  const extracted=artifact.documents?.[0];
  if(artifact.documents?.length!==1||extracted?.sourceSha256!==job.source_sha256||extracted.extractorVersion!==job.extractor_version||!Array.isArray(extracted.blocks))throw new Error("Extraction identity mismatch");
  if(extracted.blocks.some(block=>!['success','blank'].includes(block.quality)))throw new Error("Unresolved extraction unit");
  const content=extracted.blocks.filter(block=>block.quality==="success").map(block=>`${block.unitType} ${block.unitIndex} · ${block.id}\n${evidenceText(block)}`).join("\n\n");
  if(!content.trim()||content.length>2_000_000)throw new Error("Extracted content is empty or too large");
  const contentHash=sha(content);
  const registered=await tenantTransaction(userId,async client=>{
    const selected=await client.query<Job>(`select id,status,visibility,source_sha256,extractor_version,extraction_artifact_key,metrics,published_document_id,published_asset_id
      from knowledge_upload_job where id=$1 and user_id=$2 for update`,[jobId,userId]);
    const current=selected.rows[0];
    if(!current||current.source_sha256!==job.source_sha256||current.visibility!==job.visibility
      ||current.extractor_version!==job.extractor_version||current.extraction_artifact_key!==job.extraction_artifact_key
      ||current.metrics.artifactSha256!==job.metrics.artifactSha256||!['extracted','registered'].includes(current.status))throw new Error("Upload changed during registration");
    if(current.status==="registered"){
      if(!current.published_document_id||!current.published_asset_id)throw new Error("Incomplete prior registration");
      return {documentId:current.published_document_id,assetId:current.published_asset_id,reused:true};
    }
    const existing=await client.query<{id:string;source_sha256:string}>(`select id,metadata->>'sourceSha256' as source_sha256 from knowledge_document
      where owner_id=$1 and collection_id=(select id from knowledge_collection where slug=$2) and external_id=$3 for update`,
      [userId,job.collection_slug,`upload:${jobId}`]);
    if(existing.rows[0]&&existing.rows[0].source_sha256!==job.source_sha256)throw new Error("Conflicting document source");
    const documentId=existing.rows[0]?.id??(await client.query<{id:string}>(`insert into knowledge_document
      (collection_id,external_id,title,source_url,source_type,authority_level,language,company_id,product_id,content_sha256,metadata,status,published_at,owner_id,visibility)
      values((select id from knowledge_collection where slug=$1),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active',$12,$13,$14) returning id`,
      [job.collection_slug,`upload:${jobId}`,job.title,job.source_url,job.visibility==="shared"?"Admin-uploaded binary":"Private-uploaded binary",
        options.authorityLevel,options.language,job.collection_slug==="company"&&job.visibility==="shared"?"cudy-technology":null,
        job.collection_slug==="product"?job.entity_key:null,contentHash,
        JSON.stringify({uploadJobId:jobId,sourceSha256:job.source_sha256,extractorArtifactSha256:job.metrics.artifactSha256}),
        job.visibility==="shared"?new Date():null,userId,job.visibility])).rows[0].id;
    await client.query(`insert into knowledge_document_revision(document_id,user_id,content_sha256,title,content,reconstructed)
      values($1,$2,$3,$4,$5,false) on conflict(document_id,content_sha256) do nothing`,[documentId,userId,contentHash,job.title,content]);
    const asset=await client.query<{id:string}>(`insert into knowledge_asset
      (document_id,storage_key,source_sha256,mime_type,byte_size,document_type,language,source_nature,externally_disclosable)
      values($1,$2,$3,$4,$5,$6,$7,$8,false)
      on conflict(document_id,storage_key,source_sha256) do update set registration_status='registered',updated_at=now() returning id`,
      [documentId,job.storage_key,job.source_sha256,job.mime_type,Number(job.byte_size),extname(job.storage_key).slice(1).toUpperCase(),options.language,
        job.visibility==="shared"?"admin-uploaded-binary":"private-uploaded-binary"]);
    await client.query(`update knowledge_upload_job set status='registered',published_document_id=$2,published_asset_id=$3,error_code=null,updated_at=now()
      where id=$1`,[jobId,documentId,asset.rows[0].id]);
    return {documentId,assetId:asset.rows[0].id,reused:false};
  },actor.role);
  try{
    const tree=await indexExtractedDocument(userId,jobId);
    return {...registered,treeStatus:"searchable" as const,versionId:tree.versionId};
  }catch(error){
    await tenantQuery(userId,"update knowledge_upload_job set error_code='tree-index-failed',updated_at=now() where id=$1 and user_id=$2",[jobId,userId]);
    return {...registered,treeStatus:"failed" as const,treeError:error instanceof Error?error.message:"unknown"};
  }
}
