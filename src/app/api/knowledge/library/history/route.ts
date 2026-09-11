import { z } from "zod";
import { requireApiSession } from "@/lib/auth/session";
import { tenantQuery } from "@/lib/rag/db";
import { uiEfficiency } from "@/lib/ui-efficiency";
export async function GET(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;const params=new URL(request.url).searchParams;
  const parsed=z.object({id:z.uuid(),offset:z.coerce.number().int().min(0).max(100000)}).safeParse({id:params.get('document'),offset:params.get('offset')??0});
  if(!parsed.success)return Response.json({error:"文档参数无效"},{status:400});const started=Date.now();
  const rows=await tenantQuery(session.userId,"select id,title,content_sha256 as hash,left(content,5000) as content,length(content)>5000 as truncated,reconstructed,created_at::text as time from knowledge_document_revision where user_id=$1 and document_id=$2 order by created_at desc,id desc limit 11 offset $3",[session.userId,parsed.data.id,parsed.data.offset]);
  uiEfficiency("knowledge-revision-read",started,rows.length,Math.min(rows.length,10));return Response.json({items:rows.slice(0,10),hasMore:rows.length>10},{headers:{"Cache-Control":"private, no-store"}});
}
