import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { tenantQuery, tenantTransaction } from "@/lib/rag/db";
import type { KnowledgeBaseType } from "@/lib/rag/types";
import { assertResolvedInsideKnowledgeRoot, safeKnowledgeStorageKey } from "./document-repository";

export const MAX_KNOWLEDGE_BINARY_BYTES = 25 * 1024 * 1024;
export class KnowledgeUploadConflictError extends Error {}
const FORMATS: Record<string,{mime:string;marker:string}> = {
  ".pdf": { mime: "application/pdf", marker: "%PDF-" },
  ".pptx": { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", marker: "ppt/" },
  ".xlsx": { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", marker: "xl/" },
};

export interface KnowledgeUploadInput {
  collection: KnowledgeBaseType; title: string; originalFilename: string; mimeType: string;
  bytes: Uint8Array; sourceUrl?: string; visibility: "private"|"shared"; entityKey?: string;
  revisionDocumentId?: string; revisionBaseVersionId?: string;
}

export function validateKnowledgeBinary(input:Pick<KnowledgeUploadInput,"originalFilename"|"mimeType"|"bytes">){
  const name=basename(input.originalFilename).replace(/[\u0000-\u001f\u007f]/g,"").trim();
  const extension=extname(name).toLowerCase();const format=FORMATS[extension];
  if(!name||name!==input.originalFilename||!format)throw new Error("仅支持 PDF、PPTX、XLSX 原件");
  if(input.bytes.byteLength===0||input.bytes.byteLength>MAX_KNOWLEDGE_BINARY_BYTES)throw new Error("二进制资料大小必须在 1 byte 至 25 MB 之间");
  if(input.mimeType&&input.mimeType!=="application/octet-stream"&&input.mimeType!==format.mime)throw new Error("文件扩展名与 MIME 类型不一致");
  const prefix=Buffer.from(input.bytes.subarray(0,8)).toString("latin1");
  if(extension===".pdf"&&!prefix.startsWith(format.marker))throw new Error("PDF 文件签名无效");
  if(extension!==".pdf"){
    if(!prefix.startsWith("PK"))throw new Error("Office Open XML 文件签名无效");
    const directory=Buffer.from(input.bytes).toString("latin1");
    if(!directory.includes("[Content_Types].xml")||!directory.includes(format.marker))throw new Error("Office 文件容器类型不匹配");
  }
  return {name,extension,mimeType:format.mime,documentType:extension.slice(1).toUpperCase()};
}

export async function createKnowledgeUploadJob(userId:string,input:KnowledgeUploadInput){
  const format=validateKnowledgeBinary(input);const id=randomUUID();
  const storageKey=safeKnowledgeStorageKey(`knowledge/uploads/${userId}/${id}${format.extension}`);
  const absolute=resolve(storageKey);assertResolvedInsideKnowledgeRoot(absolute);
  const sourceSha256=createHash("sha256").update(input.bytes).digest("hex");
  // Use the installed local extractor's declaration; never merge work across upgrades.
  const extractorSource=await readFile(resolve('scripts/knowledge_extraction_v2.py'),'utf8');
  const requestedExtractorVersion=extractorSource.match(/^EXTRACTOR_VERSION = "([A-Za-z0-9._-]+)"$/m)?.[1];
  if(!requestedExtractorVersion)throw new Error("Local extractor version unavailable");
  const sourceUrl=input.sourceUrl?.trim()||null,entityKey=input.entityKey?.trim()||null;
  if(Boolean(input.revisionDocumentId)!==Boolean(input.revisionBaseVersionId))throw new Error('Revision document and base version required together');
  const identity=JSON.stringify([userId,input.collection,input.visibility,entityKey,sourceUrl,sourceSha256,requestedExtractorVersion,input.revisionDocumentId??null,input.revisionBaseVersionId??null]);
  let written=false;
  try{
    return await tenantTransaction(userId,async client=>{
    await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[identity]);
    if(input.revisionDocumentId){
      const target=await client.query<{id:string;current_tree_version_id:string;source_sha256:string}>(`select d.id,d.current_tree_version_id,v.source_sha256
        from knowledge_document d join knowledge_collection c on c.id=d.collection_id
        join knowledge_tree_version v on v.id=d.current_tree_version_id and v.status='ready'
        join knowledge_asset a on a.id=v.asset_id and a.registration_status='registered' and a.source_sha256=v.source_sha256
        where d.id=$1 and d.owner_id=$2 and d.status='active' and d.visibility=$3 and c.slug=$4
          and d.metadata->>'sourceSha256'=v.source_sha256 and (c.slug<>'product' or d.product_id is not distinct from $5::text)
          and ($3='private' or exists(select 1 from app_user where id=$2 and role='admin' and status='active')) for update of d`,
        [input.revisionDocumentId,userId,input.visibility,input.collection,entityKey]);
      if(!target.rows[0])throw new Error('Active owned binary document with matching scope required');
      if(target.rows[0].source_sha256!==sourceSha256&&target.rows[0].current_tree_version_id!==input.revisionBaseVersionId)
        throw new KnowledgeUploadConflictError('Document version changed; reload before uploading a revision');
    }
    const existing=await client.query<{id:string;status:string;storage_key:string}>(`select j.id,j.status,j.storage_key from knowledge_upload_job j
      where j.user_id=$1 and j.collection_slug=$2 and j.visibility=$3 and j.entity_key is not distinct from $4::text
        and j.source_url is not distinct from $5::text and j.source_sha256=$6
        and coalesce(j.extractor_version,j.metrics->>'requestedExtractorVersion')=$7
        and ((j.revision_target_document_id is not distinct from $8::uuid and j.revision_base_version_id is not distinct from $9::uuid)
          or (j.published_document_id=$8 and j.status='registered'))
        and j.status in('pending','running','extracted','registered') and (j.error_code is null or (j.status='extracted' and j.error_code='extraction-review-required'))
        and (j.published_document_id is null or exists(select 1 from knowledge_document d join knowledge_asset a
          on a.id=j.published_asset_id and a.document_id=d.id where d.id=j.published_document_id
          and d.owner_id=$1 and d.status='active' and d.metadata->>'sourceSha256'=$6
          and a.registration_status='registered' and a.source_sha256=$6))
      order by j.created_at limit 1`,[userId,input.collection,input.visibility,entityKey,sourceUrl,sourceSha256,requestedExtractorVersion,input.revisionDocumentId??null,input.revisionBaseVersionId??null]);
    if(existing.rows[0]){
      const prior=existing.rows[0],source=resolve(safeKnowledgeStorageKey(prior.storage_key));assertResolvedInsideKnowledgeRoot(source);
      const bytes=await readFile(source);
      if(bytes.length!==input.bytes.byteLength||createHash('sha256').update(bytes).digest('hex')!==sourceSha256)
        throw new Error('Previously uploaded original changed; repair the source before retrying');
      return {id:prior.id,status:prior.status,documentType:format.documentType,byteSize:input.bytes.byteLength,sourceSha256,reused:true};
    }
    await mkdir(resolve("knowledge","uploads",userId),{recursive:true});
    await writeFile(absolute,input.bytes,{flag:"wx"});written=true;
    await client.query(`insert into knowledge_upload_job(id,user_id,collection_slug,title,original_filename,storage_key,mime_type,byte_size,source_sha256,source_url,visibility,entity_key,metrics,revision_target_document_id,revision_base_version_id)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,[id,userId,input.collection,input.title,format.name,storageKey,format.mimeType,input.bytes.byteLength,sourceSha256,sourceUrl,input.visibility,entityKey,JSON.stringify({requestedExtractorVersion,inputItems:1,inputBytes:input.bytes.byteLength,validOutputItems:1,downstreamUsedItems:1,inputTokens:0,outputTokens:0,apiCredits:0,costUsd:0,retries:0,discardedReasonCounts:{},usageBoundary:"raw-private-upload-pending-local-extraction",optimizationOpportunity:"Extract locally before any indexing or external disclosure"}),input.revisionDocumentId??null,input.revisionBaseVersionId??null]);
    return {id,status:"pending" as const,documentType:format.documentType,byteSize:input.bytes.byteLength,sourceSha256,reused:false};
    });
  }catch(error){if(written)await unlink(absolute).catch(()=>undefined);throw error;}
}

export async function listKnowledgeUploadJobs(userId:string,offset=0,limit=30){
  return tenantQuery<{id:string;collection:string;status:string;treeStatus:string;currentVersionId:string|null;sourceSha256:string;title:string;originalFilename:string;documentType:string;byteSize:string;errorCode:string|null;createdAt:string;updatedAt:string;documentId:string|null;visibility:string;sourceUrl:string|null;entityKey:string|null;revisionBaseVersionId:string|null}>(userId,`select j.id,j.collection_slug as collection,j.status,j.title,j.original_filename as "originalFilename",
    coalesce(j.published_document_id,j.revision_target_document_id) as "documentId",j.visibility,j.source_url as "sourceUrl",j.entity_key as "entityKey",j.revision_base_version_id as "revisionBaseVersionId",
    upper(ltrim(substring(j.original_filename from '\\.[^.]+$'),'.')) as "documentType",j.byte_size::text as "byteSize",
    j.source_sha256 as "sourceSha256",j.error_code as "errorCode",j.created_at::text as "createdAt",j.updated_at::text as "updatedAt",
    v.id as "currentVersionId",case when j.status='registered' and (d.status<>'active' or a.registration_status<>'registered') then 'unavailable'
      when j.status='registered' and v.status='ready' and a.registration_status='registered' and d.status='active' and d.metadata->>'sourceSha256'=j.source_sha256 then 'searchable'
      when j.status='registered' and v.status='ready' and d.metadata->>'sourceSha256'<>j.source_sha256 then 'historical'
      when j.status='extracted' and j.error_code='extraction-review-required' then 'review-required'
      when j.error_code='tree-index-failed' then 'failed' when j.status='registered' then 'indexing' else j.status end as "treeStatus"
    from knowledge_upload_job j left join knowledge_document d on d.id=coalesce(j.published_document_id,j.revision_target_document_id)
    left join knowledge_tree_version v on v.id=d.current_tree_version_id
    left join knowledge_asset a on a.id=v.asset_id
    where j.user_id=$1 order by j.created_at desc,j.id limit $2 offset $3`,[userId,Math.min(50,Math.max(1,limit)),Math.max(0,offset)]);
}
