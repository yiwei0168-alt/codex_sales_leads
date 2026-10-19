import { createHash } from "node:crypto";
import { open, realpath, stat } from "node:fs/promises";
import { extname, resolve, relative, isAbsolute } from "node:path";
import { tenantQuery } from "@/lib/rag/db";

const MIME: Record<string,string>={".pdf":"application/pdf",".pptx":"application/vnd.openxmlformats-officedocument.presentationml.presentation",".xlsx":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",".txt":"text/plain",".md":"text/markdown"};

export function safeKnowledgeStorageKey(storageKey:string):string{
  const normalized=storageKey.replaceAll("\\","/");
  if(!normalized.startsWith("knowledge/")||isAbsolute(storageKey)||normalized.split("/").includes("..")||/^[a-z]:/i.test(normalized))throw new Error("Invalid knowledge asset storage key");
  return normalized;
}

/** A stable read for registration, not an immutable-storage lease. Later readers
 * still verify the registered digest and current access before using the file. */
export async function inspectKnowledgeAssetBytes(key:string,expectedSha256?:string){
  if(expectedSha256!==undefined&&!/^[a-f0-9]{64}$/.test(expectedSha256))throw new Error("Invalid expected knowledge asset hash");
  const storageKey=safeKnowledgeStorageKey(key),requested=resolve(storageKey),path=await realpath(requested);
  assertResolvedInsideKnowledgeRoot(path);
  const file=await open(path,"r");let hash:string,byteSize:number;
  try{
    const info=await file.stat();
    if(!info.isFile()||!Number.isSafeInteger(info.size)||info.size<0)throw new Error("Knowledge asset is not a valid file");
    const digest=createHash("sha256"),buffer=Buffer.alloc(64*1024);let length=0;
    while(true){
      const {bytesRead}=await file.read(buffer,0,Math.min(buffer.length,info.size-length+1),null);
      if(!bytesRead)break;
      length+=bytesRead;if(length>info.size)throw new Error("Knowledge asset changed during registration");
      digest.update(buffer.subarray(0,bytesRead));
    }
    const after=await file.stat(),currentPath=await realpath(requested);
    assertResolvedInsideKnowledgeRoot(currentPath);
    const current=await stat(currentPath);
    if(length!==info.size||currentPath!==path||[after,current].some(value=>!value.isFile()
      ||value.dev!==info.dev||value.ino!==info.ino||value.size!==info.size
      ||value.mtimeMs!==info.mtimeMs||value.ctimeMs!==info.ctimeMs))throw new Error("Knowledge asset changed during registration");
    hash=digest.digest("hex");byteSize=info.size;
    if(expectedSha256!==undefined&&hash!==expectedSha256)throw new Error("Knowledge asset no longer matches approved hash");
  }finally{await file.close();}
  return {storageKey,sha256:hash,byteSize};
}

export async function registerKnowledgeAsset(userId:string,input:{documentId:string;storageKey:string;documentType:string;version?:string;market?:string;language?:string;sourceNature:string;externallyDisclosable?:boolean;expectedSha256?:string}){
  const {storageKey,sha256:hash,byteSize}=await inspectKnowledgeAssetBytes(input.storageKey,input.expectedSha256);
  const rows=await tenantQuery<{id:string}>(userId,`insert into knowledge_asset(document_id,storage_key,source_sha256,mime_type,byte_size,document_type,document_version,market,language,source_nature,externally_disclosable)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict(document_id,storage_key,source_sha256) do update set document_type=excluded.document_type,document_version=excluded.document_version,market=excluded.market,language=excluded.language,source_nature=excluded.source_nature,externally_disclosable=excluded.externally_disclosable,registration_status='registered',updated_at=now() returning id`,
    [input.documentId,storageKey,hash,MIME[extname(storageKey).toLowerCase()]??"application/octet-stream",byteSize,input.documentType,input.version??null,input.market??null,input.language??null,input.sourceNature,input.externallyDisclosable??false],"admin");
  return {id:rows[0].id,sha256:hash,byteSize};
}

export function assertResolvedInsideKnowledgeRoot(path:string):void{
  const root=resolve("knowledge");const rel=relative(root,path);if(rel.startsWith("..")||isAbsolute(rel))throw new Error("Knowledge asset escaped storage root");
}
