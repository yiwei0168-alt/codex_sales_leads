import { requireApiSession } from "@/lib/auth/session";
import {reviewMailboxCandidate} from "@/lib/mailbox/candidate-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  let body: { status?: string };
  try { body = await request.json() as typeof body; } catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  if (body.status !== "approved" && body.status !== "rejected") return Response.json({ error: "status 无效" }, { status: 400 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "候选 ID 无效" }, { status: 400 });
  const result=await reviewMailboxCandidate(session.userId,id,body.status);
  if(result.kind==="missing")return Response.json({error:"候选不存在"},{status:404});
  if(result.kind==="busy")return Response.json({error:"该候选正在审核，请稍后刷新"},{status:409});
  if(result.kind==="conflict")return Response.json({error:"该候选已有不同审核结果，请刷新"},{status:409});
  if(result.kind==="approval-incomplete")return Response.json({error:"此前批准已保存知识，请再次批准以完成审核"},{status:409});
  return Response.json({updated:true,status:result.status,reused:result.reused});
}
