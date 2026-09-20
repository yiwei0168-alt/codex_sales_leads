import { z } from "zod";
import { requireApiSession } from "@/lib/auth/session";
import { decideMailBatch } from "@/lib/assistant/main/approvals";
export async function POST(request:Request) {
  const session=await requireApiSession();if(session instanceof Response)return session;
  const parsed=z.object({items:z.array(z.object({id:z.uuid(),parameterHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).min(1).max(50)}).strict().safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return Response.json({error:"邮件确认列表无效"},{status:400});
  const changed=await decideMailBatch(session.userId,parsed.data.items);
  return Response.json({changed},{status:changed?200:409});
}
