import { requireApiSession } from "@/lib/auth/session";
import { addManualCompany, manualCompanySchema } from "@/lib/sales/manual-company";

export async function POST(request:Request) {
  const session=await requireApiSession();if(session instanceof Response)return session;
  const input=manualCompanySchema.safeParse(await request.json().catch(()=>null));
  if(!input.success)return Response.json({error:"请填写公司名称和有效国家"},{status:400});
  try {return Response.json(await addManualCompany(session.userId,input.data));}
  catch {return Response.json({error:"添加失败，请检查官网地址或稍后重试"},{status:400});}
}
