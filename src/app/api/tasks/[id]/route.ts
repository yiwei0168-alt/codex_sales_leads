import { z } from "zod";
import { requireApiSession } from "@/lib/auth/session";
import { readTaskDetail } from "@/lib/assistant/task-detail";
export const runtime="nodejs";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const {id}=await params;const kind=new URL(request.url).searchParams.get("kind")??"search";
  const offset=Number(new URL(request.url).searchParams.get("offset")??0);if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)return Response.json({error:"分页参数无效"},{status:400});
  if(!z.uuid().safeParse(id).success||!["search","contacts","draft","send","relationship","generation"].includes(kind))return Response.json({error:"任务参数无效"},{status:400});
  try{const detail=await readTaskDetail(session.userId,id,kind,offset);return detail?Response.json(detail,{headers:{"Cache-Control":"private, no-store"}}):Response.json({error:"任务不存在"},{status:404});}
  catch{return Response.json({error:"任务详情暂不可读取"},{status:503});}
}
