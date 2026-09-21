import { z } from "zod";
import { requireApiSession } from "@/lib/auth/session";
import { readKnowledgeLibraryItem } from "@/lib/knowledge/library-service";
export const dynamic = "force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
  const session=await requireApiSession();if(session instanceof Response)return session;
  const parsed=z.object({id:z.uuid(),scope:z.enum(["private","shared","evidence"])}).safeParse({...(await params),scope:new URL(request.url).searchParams.get("scope")??"private"});
  if(!parsed.success)return Response.json({error:"资料参数无效"},{status:400});
  try {
    const item=await readKnowledgeLibraryItem(session.userId,parsed.data.id,parsed.data.scope);
    return item?Response.json({item},{headers:{"Cache-Control":"private, no-store"}}):Response.json({error:"资料不存在或无权读取"},{status:404});
  }catch{return Response.json({error:"资料读取失败，请重试"},{status:503});}
}
