import { z } from "zod";
import { requireApiSession } from "@/lib/auth/session";
import { analyzeStoredRelationship } from "@/lib/sales/relationship-analysis";
export const runtime="nodejs";
export async function POST(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const parsed=z.object({country:z.string().regex(/^[A-Z]{2}$/),from:z.string().min(1).max(180),to:z.string().min(1).max(180),confirmed:z.literal(true)}).strict().refine(input=>input.from!==input.to).safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return Response.json({error:"请选择两家公司并确认分析费用"},{status:400});
  try{return Response.json(await analyzeStoredRelationship(session.userId,parsed.data.country,parsed.data.from,parsed.data.to));}catch{return Response.json({error:"分析未完成或该版本已有进行中/异常记录；未自动重试，请检查配置与任务记录"},{status:409});}
}
