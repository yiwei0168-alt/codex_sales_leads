import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {extname,resolve} from "node:path";
import {tenantQuery} from "@/lib/rag/db";
import {upsertKnowledgeDocument} from "@/lib/rag/repository";
import {assertResolvedInsideKnowledgeRoot,registerKnowledgeAsset,safeKnowledgeStorageKey} from "./document-repository";

type Job={id:string;collection_slug:"industry"|"company"|"product";status:string;title:string;storage_key:string;extraction_artifact_key:string|null;source_sha256:string;source_url:string|null;entity_key:string|null;metrics:{artifactSha256?:string};published_document_id:string|null;published_asset_id:string|null};
type Block={id:string;unitType:string;unitIndex:number;blockType:string;text?:string;table?:{headers?:unknown[];rows?:unknown[][]};quality:string};
const sha=(value:Uint8Array)=>createHash("sha256").update(value).digest("hex");

function renderBlock(block:Block):string{
  const location=`${block.unitType} ${block.unitIndex} · ${block.id}`;
  if(block.blockType==="table"&&block.table){
    const rows=[block.table.headers??[],...(block.table.rows??[])].slice(0,500);
    if(!rows.some(row=>row.some(cell=>String(cell??"").trim())))return "";
    return `${location}\n${rows.map(row=>row.map(cell=>String(cell??"").replaceAll("\t"," ").replaceAll("\n"," ")).join("\t")).join("\n")}`;
  }
  return block.text?.trim()?`${location}\n${block.text.trim()}`:"";
}

export async function registerExtractedSharedBinary(userId:string,input:{jobId:string;sourceSha256:string;language:string;authorityLevel:1|2|3|4|5}){
  const [job]=await tenantQuery<Job>(userId,`select id,collection_slug,status,title,storage_key,extraction_artifact_key,source_sha256,source_url,entity_key,metrics,published_document_id,published_asset_id
    from knowledge_upload_job where id=$1 and user_id=$2`,[input.jobId,userId],"admin");
  if(!job)return {status:"missing_input" as const,missing:["Owned extracted upload job"]};
  if(job.source_sha256!==input.sourceSha256)return {status:"missing_input" as const,missing:["Current upload SHA-256; the approved source changed"]};
  if(job.status==="registered"&&job.published_document_id&&job.published_asset_id)
    return {status:"registered" as const,documentId:job.published_document_id,assetId:job.published_asset_id,sourceSha256:job.source_sha256,ragV3:"pending-release" as const,reused:true};
  if(job.status!=="extracted"||!job.extraction_artifact_key)return {status:"missing_input" as const,missing:[`Locally extracted upload job; current status: ${job.status}`]};
  if(job.collection_slug==="product"&&!job.entity_key)return {status:"missing_input" as const,missing:["Product model/SKU entity key"]};
  const source=resolve(safeKnowledgeStorageKey(job.storage_key));assertResolvedInsideKnowledgeRoot(source);
  const sourceBytes=await readFile(source);
  if(sha(sourceBytes)!==job.source_sha256)throw new Error("Original binary hash changed after upload");
  const artifactPath=resolve(safeKnowledgeStorageKey(job.extraction_artifact_key));assertResolvedInsideKnowledgeRoot(artifactPath);
  const artifactBytes=await readFile(artifactPath);
  if(!job.metrics.artifactSha256||sha(artifactBytes)!==job.metrics.artifactSha256)throw new Error("Extraction artifact hash mismatch");
  const artifact=JSON.parse(artifactBytes.toString("utf8")) as {documents?:Array<{sourceSha256?:string;blocks?:Block[]}>};
  const document=artifact.documents?.[0];
  if(artifact.documents?.length!==1||document?.sourceSha256!==job.source_sha256||!Array.isArray(document.blocks))throw new Error("Extraction artifact does not match the approved original");
  if(document.blocks.some(block=>block.quality==="failed"||block.quality==="pending-ocr"))
    return {status:"missing_input" as const,missing:["Completed local extraction for every page/slide/sheet; pending OCR or failed units require review"]};
  const content=document.blocks.filter(block=>block.quality==="success").map(renderBlock).filter(Boolean).join("\n\n");
  if(!content.trim()||content.length>2_000_000)return {status:"missing_input" as const,missing:["Nonempty extracted text within the 2 MB document limit"]};
  const saved=await upsertKnowledgeDocument(userId,{collection:job.collection_slug,externalId:`upload:${job.id}`,title:job.title,
    content,sourceType:"Admin-uploaded binary",sourceUrl:job.source_url??undefined,authorityLevel:input.authorityLevel,
    language:input.language,visibility:"shared",productId:job.collection_slug==="product"?job.entity_key??undefined:undefined,
    companyId:job.collection_slug==="company"?"cudy-technology":undefined,
    metadata:{uploadJobId:job.id,sourceSha256:job.source_sha256,extractorArtifactSha256:job.metrics.artifactSha256}},"admin");
  const asset=await registerKnowledgeAsset(userId,{documentId:saved.documentId,storageKey:job.storage_key,
    documentType:extname(job.storage_key).slice(1).toUpperCase(),sourceNature:"admin-uploaded-binary",language:input.language});
  const updated=await tenantQuery<{id:string}>(userId,`update knowledge_upload_job set status='registered',visibility='shared',published_document_id=$3,published_asset_id=$4,updated_at=now()
    where id=$1 and user_id=$2 and status='extracted' and source_sha256=$5 returning id`,[job.id,userId,saved.documentId,asset.id,job.source_sha256],"admin");
  if(!updated[0])throw new Error("Upload registration changed during publication; inspect saved document and asset before retry");
  return {status:"registered" as const,documentId:saved.documentId,assetId:asset.id,sourceSha256:job.source_sha256,ragV3:"pending-release" as const,reused:false};
}
