import { z } from "zod";
import { requireApiSession } from "@/lib/auth/session";
import { controlRun,readInstructionSubmission } from "@/lib/assistant/main/repository";
import {runControlSchema,instructionRequestKeySchema} from '@/lib/assistant/main/run-control';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const {id}=await context.params,key=instructionRequestKeySchema.safeParse(new URL(request.url).searchParams.get('requestKey'));
  if(!z.uuid().safeParse(id).success||!key.success)return Response.json({error:'核对参数无效'},{status:400});
  try{
    const receipt=await readInstructionSubmission(session.userId,id,key.data);
    return receipt?Response.json(receipt,{headers:{'Cache-Control':'private, no-store'}}):Response.json({error:'任务不存在'},{status:404});
  }catch{return Response.json({error:'保存结果暂不可用'},{status:503});}
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(); if (session instanceof Response) return session;
  const { id } = await context.params;
  const p = runControlSchema.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !p.success) return Response.json({ error: "Invalid control" }, { status: 400 });
  try {
    const found = await controlRun(session.userId, id, p.data.action, p.data.content,p.data.requestKey);
    return found ? Response.json({ accepted: true }) : Response.json({ error: "Not found" }, { status: 404 });
  } catch { return Response.json({ error: "当前状态不能执行此操作" }, { status: 409 }); }
}
