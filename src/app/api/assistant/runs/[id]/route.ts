import { z } from "zod";
import { requireApiSession } from "@/lib/auth/session";
import { getRun } from "@/lib/assistant/main/repository";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  const session=await requireApiSession();if(session instanceof Response)return session;
  const {id}=await params;if(!z.uuid().safeParse(id).success)return Response.json({error:"任务 ID 无效"},{status:400});
  const run=await getRun(session.userId,id);if(!run)return Response.json({error:"任务不存在"},{status:404});
  return Response.json({id:run.id,status:run.status,result:run.result},{headers:{"Cache-Control":"private, no-store"}});
}
