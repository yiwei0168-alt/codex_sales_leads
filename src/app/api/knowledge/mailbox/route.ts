import { requireApiSession } from "@/lib/auth/session";
import { listApprovedMailboxKnowledge } from "@/lib/mailbox/knowledge-overview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request:Request) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  const page=Number(new URL(request.url).searchParams.get("page")??1);
  if(!Number.isSafeInteger(page)||page<1||page>100000)return Response.json({error:"分页参数无效"},{status:400});
  const rows=await listApprovedMailboxKnowledge(session.userId,(page-1)*8,9);
  return Response.json({ items:rows.slice(0,8), hasMore:rows.length>8, page, pageSize:8 });
}
