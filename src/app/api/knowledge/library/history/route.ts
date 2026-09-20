import { z } from "zod";
import { requireApiSession } from "@/lib/auth/session";
import {listKnowledgeRevisions} from "@/lib/knowledge/library-service";
import { uiEfficiency } from "@/lib/ui-efficiency";
export async function GET(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;const params=new URL(request.url).searchParams;
  const parsed=z.object({id:z.uuid(),offset:z.coerce.number().int().min(0).max(100000)}).safeParse({id:params.get('document'),offset:params.get('offset')??0});
  if(!parsed.success)return Response.json({error:"文档参数无效"},{status:400});const started=Date.now();
  const page=await listKnowledgeRevisions(session.userId,parsed.data.id,parsed.data.offset);
  uiEfficiency("knowledge-revision-read",started,page.fetched,page.items.length);return Response.json({items:page.items,hasMore:page.hasMore},{headers:{"Cache-Control":"private, no-store"}});
}
