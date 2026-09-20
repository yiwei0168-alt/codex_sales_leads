import { z } from "zod";
import { requireApiSession } from "@/lib/auth/session";
import {createFollowUpDraft,listSavedFollowUps} from "@/lib/outreach/follow-up-service";
import {BudgetDeniedError} from "@/lib/billing/policy";
const schema=z.object({parentId:z.uuid(),instructions:z.string().trim().min(2).max(2000)}).strict();
export async function GET(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const parentId=new URL(request.url).searchParams.get("parentId");if(!z.uuid().safeParse(parentId).success)return Response.json({error:"原邮件参数无效"},{status:400});
  return Response.json({drafts:await listSavedFollowUps(session.userId,parentId!)},{headers:{"Cache-Control":"private, no-store"}});
}
export async function POST(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const input=schema.safeParse(await request.json().catch(()=>null));if(!input.success)return Response.json({error:"请填写跟进内容"},{status:400});
  try {
    const result=await createFollowUpDraft(session.userId,input.data);
    return result?Response.json(result):Response.json({error:"原邮件不存在"},{status:404});
  }catch(error){if(error instanceof BudgetDeniedError)return Response.json({error:error.message,code:error.code},{status:402});return Response.json({error:"跟进草稿生成失败，原邮件和发送记录未改变"},{status:502});}
}
