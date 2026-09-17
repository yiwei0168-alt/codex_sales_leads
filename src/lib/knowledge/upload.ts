import { createHash, randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { tenantQuery } from "@/lib/rag/db";
import type { KnowledgeBaseType } from "@/lib/rag/types";
import { assertResolvedInsideKnowledgeRoot, safeKnowledgeStorageKey } from "./document-repository";

export const MAX_KNOWLEDGE_BINARY_BYTES = 25 * 1024 * 1024;
const FORMATS: Record<string,{mime:string;marker:string}> = {
  ".pdf": { mime: "application/pdf", marker: "%PDF-" },
  ".pptx": { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", marker: "ppt/" },
  ".xlsx": { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", marker: "xl/" },
};

export interface KnowledgeUploadInput {
  collection: KnowledgeBaseType; title: string; originalFilename: string; mimeType: string;
  bytes: Uint8Array; sourceUrl?: string; visibility: "private"|"shared"; entityKey?: string;
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
  await mkdir(resolve("knowledge","uploads",userId),{recursive:true});
  await writeFile(absolute,input.bytes,{flag:"wx"});
  const sourceSha256=createHash("sha256").update(input.bytes).digest("hex");
  try{
    await tenantQuery(userId,`insert into knowledge_upload_job(id,user_id,collection_slug,title,original_filename,storage_key,mime_type,byte_size,source_sha256,source_url,visibility,entity_key,metrics)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[id,userId,input.collection,input.title,format.name,storageKey,format.mimeType,input.bytes.byteLength,sourceSha256,input.sourceUrl??null,input.visibility,input.entityKey??null,JSON.stringify({inputItems:1,inputBytes:input.bytes.byteLength,validOutputItems:1,downstreamUsedItems:1,inputTokens:0,outputTokens:0,apiCredits:0,costUsd:0,retries:0,discardedReasonCounts:{},usageBoundary:"raw-private-upload-pending-local-extraction",optimizationOpportunity:"Extract locally before any indexing or external disclosure"})]);
  }catch(error){await unlink(absolute).catch(()=>undefined);throw error;}
  return {id,status:"pending" as const,documentType:format.documentType,byteSize:input.bytes.byteLength,sourceSha256};
}

export async function listKnowledgeUploadJobs(userId:string){
  return tenantQuery<{id:string;collection:string;status:string;title:string;originalFilename:string;documentType:string;byteSize:string;errorCode:string|null;createdAt:string;updatedAt:string}>(userId,`select id,collection_slug as collection,status,title,original_filename as "originalFilename",upper(ltrim(substring(original_filename from '\\.[^.]+$'),'.')) as "documentType",byte_size::text as "byteSize",error_code as "errorCode",created_at::text as "createdAt",updated_at::text as "updatedAt" from knowledge_upload_job where user_id=$1 order by created_at desc limit 30`,[userId]);
}
