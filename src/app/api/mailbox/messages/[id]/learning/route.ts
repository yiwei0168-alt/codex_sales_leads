import { requireApiSession } from "@/lib/auth/session";
import { reviewMailboxMessageForLearning } from "@/lib/mailbox/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "邮件 ID 无效" }, { status: 400 });
  let body: { action?: string; consent?: boolean };
  try { body = await request.json() as typeof body; } catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  if (body.action !== "authorize" && body.action !== "skip") return Response.json({ error: "action 无效" }, { status: 400 });
  if (body.action === "authorize" && body.consent !== true) return Response.json({ error: "必须明确同意脱敏后发送给 Kimi" }, { status: 400 });
  if (body.action === "authorize" && !process.env.KIMI_API_KEY?.trim()) return Response.json({ error: "KIMI_API_KEY 尚未配置" }, { status: 503 });
  try {
    return Response.json(await reviewMailboxMessageForLearning(session.userId, id, body.action));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "邮件学习处理失败" }, { status: 502 });
  }
}
