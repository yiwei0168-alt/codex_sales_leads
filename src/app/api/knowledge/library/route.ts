import { z } from "zod";
import { requireApiSession } from "@/lib/auth/session";
import {listKnowledgeLibrary,deletePrivateKnowledgeDocument} from "@/lib/knowledge/library-service";
import { uiEfficiency } from "@/lib/ui-efficiency";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const params=new URL(request.url).searchParams;
  const parsed=z.object({scope:z.enum(["private","shared","evidence"]),query:z.string().max(200),offset:z.coerce.number().int().min(0).max(100000)}).safeParse({scope:params.get("scope")??"private",query:params.get("q")??"",offset:params.get("offset")??0});
  if(!parsed.success)return Response.json({error:"筛选参数无效"},{status:400});const started=Date.now();const p=parsed.data;
  try{const page=await listKnowledgeLibrary(session.userId,p.scope,p.query,p.offset);
    uiEfficiency("knowledge-library-read",started,page.fetched,page.items.length);return Response.json({items:page.items,hasMore:page.hasMore},{headers:{"Cache-Control":"private, no-store"}});
  }catch{uiEfficiency("knowledge-library-read",started,1,0,true);return Response.json({error:"知识库记录读取失败"},{status:503});}
}
export async function DELETE(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const parsed=z.object({id:z.uuid(),confirmed:z.literal(true)}).strict().safeParse(await request.json().catch(()=>null));if(!parsed.success)return Response.json({error:"需要确认删除"},{status:400});
  const started=Date.now();const deleted=await deletePrivateKnowledgeDocument(session.userId,parsed.data.id);
  uiEfficiency("private-knowledge-delete",started,1,deleted?1:0);return deleted?Response.json({deleted:true}):Response.json({error:"私有知识不存在或不属于当前用户"},{status:404});
}
