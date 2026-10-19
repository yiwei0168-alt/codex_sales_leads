import { readFile, realpath, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { extname, resolve } from "node:path";
import { requireApiSession } from "@/lib/auth/session";
import { tenantQuery,tenantTransaction } from "@/lib/rag/db";
import {readAvailableImmutableKnowledgeAsset} from '@/lib/knowledge/immutable-asset-snapshot';
import { assertResolvedInsideKnowledgeRoot, safeKnowledgeStorageKey } from "@/lib/knowledge/document-repository";
import { parseByteRange, safeDownloadName } from "@/lib/knowledge/asset-response";

export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{assetId:string}>}){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const {assetId}=await params;if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(assetId))return Response.json({error:"资料链接无效"},{status:404});
  type Asset={storageKey:string;mimeType:string;byteSize:string;title:string;sourceSha256:string};
  const currentAsset=async()=>(await tenantQuery<Asset>(session.userId,`select a.storage_key as "storageKey",a.mime_type as "mimeType",a.byte_size::text as "byteSize",d.title,a.source_sha256 as "sourceSha256"
    from knowledge_asset a join knowledge_document d on d.id=a.document_id where a.id=$1 and a.registration_status='registered' and d.status='active' and (d.visibility='shared' or d.owner_id=$2)`,[assetId,session.userId]))[0];
  const asset=await currentAsset();if(!asset)return Response.json({error:"资料不存在、已撤回或无权访问"},{status:404});
  try{
    const key=safeKnowledgeStorageKey(asset.storageKey);
    const snapshot=await tenantTransaction(session.userId,client=>readAvailableImmutableKnowledgeAsset(client,session.userId,assetId,asset.sourceSha256));
    let bytes:Buffer;
    if(snapshot){bytes=snapshot.bytes;}
    else{
      const path=await realpath(resolve(key));assertResolvedInsideKnowledgeRoot(path);const info=await stat(path);
      if(!info.isFile()||info.size!==Number(asset.byteSize))return Response.json({error:"原始资料已变更，请管理员重新登记"},{status:410});
      bytes=await readFile(path);
    }
    if(bytes.length!==Number(asset.byteSize)||createHash('sha256').update(bytes).digest('hex')!==asset.sourceSha256)
      return Response.json({error:"原始资料已变更，请管理员重新登记"},{status:410});
    // Permission and registration can change while the file is read or hashed.
    const current=await currentAsset();
    if(!current)return Response.json({error:"资料不存在、已撤回或无权访问"},{status:404});
    if(current.storageKey!==asset.storageKey||current.sourceSha256!==asset.sourceSha256
      ||current.byteSize!==asset.byteSize||current.mimeType!==asset.mimeType)
      return Response.json({error:"原始资料已变更，请管理员重新登记"},{status:410});
    let range;try{range=parseByteRange(request.headers.get("range"),bytes.length);}catch{return new Response(null,{status:416,headers:{"Content-Range":`bytes */${bytes.length}`}});}
    const extension=extname(key);const inline=asset.mimeType==="application/pdf"||asset.mimeType.startsWith("text/");const body=range?bytes.subarray(range.start,range.end+1):bytes;
    const headers=new Headers({"Content-Type":asset.mimeType,"Content-Length":String(body.length),"Accept-Ranges":"bytes","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Disposition":`${inline?"inline":"attachment"}; filename*=UTF-8''${encodeURIComponent(safeDownloadName(current.title,extension))}`});
    if(range)headers.set("Content-Range",`bytes ${range.start}-${range.end}/${bytes.length}`);return new Response(new Uint8Array(body),{status:range?206:200,headers});
  }catch{return Response.json({error:"原始资料不可用，请管理员检查登记文件"},{status:410});}
}
