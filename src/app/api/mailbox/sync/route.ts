import { requireApiSession } from "@/lib/auth/session";
import { syncAliMail } from "@/lib/mailbox/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  let body: { connectionId?: string; lookbackDays?: number; maxMessages?: number };
  try { body = await request.json() as typeof body; } catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  if (!body.connectionId || !/^[0-9a-f-]{36}$/i.test(body.connectionId)) {
    return Response.json({ error: "connectionId 无效" }, { status: 400 });
  }
  try {
    const result = await syncAliMail(session.userId, body.connectionId, {
      lookbackDays: body.lookbackDays,
      maxMessages: body.maxMessages,
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "邮箱同步失败" }, { status: 502 });
  }
}
