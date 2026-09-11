import { requireApiSession } from "@/lib/auth/session";
import { listRelationships, relationshipSchema, saveRelationship } from "@/lib/sales/relationships";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  const country = new URL(request.url).searchParams.get("country") ?? "";
  if (!/^[A-Z]{2}$/.test(country)) return Response.json({error:"请选择国家"},{status:400});
  return Response.json({relationships:await listRelationships(session.userId,country)});
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  const input = relationshipSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({error:"请填写两家公司、关系类型与依据；来源须为网页地址"},{status:400});
  try { return Response.json({id:await saveRelationship(session.userId,input.data)}); }
  catch { return Response.json({error:"关系保存失败，请检查国家、公司及输入后重试"},{status:400}); }
}
