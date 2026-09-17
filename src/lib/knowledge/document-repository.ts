import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, relative, isAbsolute } from "node:path";
import { tenantQuery } from "@/lib/rag/db";

const MIME: Record<string,string>={".pdf":"application/pdf",".pptx":"application/vnd.openxmlformats-officedocument.presentationml.presentation",".xlsx":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",".txt":"text/plain",".md":"text/markdown"};

export function safeKnowledgeStorageKey(storageKey:string):string{
  const normalized=storageKey.replaceAll("\\","/");
  if(!normalized.startsWith("knowledge/")||isAbsolute(storageKey)||normalized.split("/").includes("..")||/^[a-z]:/i.test(normalized))throw new Error("Invalid knowledge asset storage key");
  return normalized;
}

export async function registerKnowledgeAsset(userId:string,input:{documentId:string;storageKey:string;documentType:string;version?:string;market?:string;language?:string;sourceNature:string;externallyDisclosable?:boolean}){
  const storageKey=safeKnowledgeStorageKey(input.storageKey);const path=resolve(storageKey);const info=await stat(path);if(!info.isFile())throw new Error("Knowledge asset is not a file");
  const hash=createHash("sha256").update(await readFile(path)).digest("hex");
  const rows=await tenantQuery<{id:string}>(userId,`insert into knowledge_asset(document_id,storage_key,source_sha256,mime_type,byte_size,document_type,document_version,market,language,source_nature,externally_disclosable)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict(document_id,storage_key,source_sha256) do update set document_type=excluded.document_type,document_version=excluded.document_version,market=excluded.market,language=excluded.language,source_nature=excluded.source_nature,externally_disclosable=excluded.externally_disclosable,registration_status='registered',updated_at=now() returning id`,
    [input.documentId,storageKey,hash,MIME[extname(path).toLowerCase()]??"application/octet-stream",info.size,input.documentType,input.version??null,input.market??null,input.language??null,input.sourceNature,input.externallyDisclosable??false],"admin");
  return {id:rows[0].id,sha256:hash,byteSize:info.size};
}

export function assertResolvedInsideKnowledgeRoot(path:string):void{
  const root=resolve("knowledge");const rel=relative(root,path);if(rel.startsWith("..")||isAbsolute(rel))throw new Error("Knowledge asset escaped storage root");
}
