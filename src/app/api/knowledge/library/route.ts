import { z } from "zod";
import { requireApiSession } from "@/lib/auth/session";
import { tenantQuery } from "@/lib/rag/db";
import { uiEfficiency } from "@/lib/ui-efficiency";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const params=new URL(request.url).searchParams;
  const parsed=z.object({scope:z.enum(["private","shared","evidence"]),query:z.string().max(200),offset:z.coerce.number().int().min(0).max(100000)}).safeParse({scope:params.get("scope")??"private",query:params.get("q")??"",offset:params.get("offset")??0});
  if(!parsed.success)return Response.json({error:"筛选参数无效"},{status:400});const started=Date.now();const p=parsed.data;
  try{const rows=p.scope==="evidence"?await tenantQuery(session.userId,`select d.id,d.title,s.canonical_url as "sourceUrl",d.last_verified_at::text as "updatedAt",d.freshness_status as status,'public-evidence' as scope,
      left(c.content,1500) as excerpt from public_evidence.document_version d join public_evidence.source s on s.id=d.source_id
      left join lateral(select content from public_evidence.chunk where document_version_id=d.id order by chunk_index limit 1)c on true
      where s.sharing_status='public' and d.freshness_status<>'invalid' and ($1='' or d.title ilike '%'||$1||'%' or s.canonical_url ilike '%'||$1||'%')
      order by d.last_verified_at desc,d.id limit 51 offset $2`,[p.query,p.offset]):await tenantQuery(session.userId,`select d.id,d.title,d.source_url as "sourceUrl",d.updated_at::text as "updatedAt",d.status,d.visibility as scope,c.slug as collection,
      left(k.content,1500) as excerpt from knowledge_document d join knowledge_collection c on c.id=d.collection_id
      left join lateral(select content from knowledge_chunk where document_id=d.id order by chunk_index limit 1) k on true
      where d.visibility=$2 and ($2='shared' or d.owner_id=$1) and ($3='' or d.title ilike '%'||$3||'%') order by d.updated_at desc,d.id limit 51 offset $4`,[session.userId,p.scope,p.query,p.offset]);
    uiEfficiency("knowledge-library-read",started,rows.length,Math.min(rows.length,50));return Response.json({items:rows.slice(0,50),hasMore:rows.length>50},{headers:{"Cache-Control":"private, no-store"}});
  }catch{uiEfficiency("knowledge-library-read",started,1,0,true);return Response.json({error:"知识库记录读取失败"},{status:503});}
}
export async function DELETE(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const parsed=z.object({id:z.uuid(),confirmed:z.literal(true)}).strict().safeParse(await request.json().catch(()=>null));if(!parsed.success)return Response.json({error:"需要确认删除"},{status:400});
  const started=Date.now();const rows=await tenantQuery(session.userId,"delete from knowledge_document where id=$1 and owner_id=$2 and visibility='private' returning id",[parsed.data.id,session.userId]);
  uiEfficiency("private-knowledge-delete",started,1,rows.length);return rows.length?Response.json({deleted:true}):Response.json({error:"私有知识不存在或不属于当前用户"},{status:404});
}
