import { requireApiSession } from "@/lib/auth/session";
import { screenStoredMailboxMessages } from "@/lib/mailbox/repository";
import { reviewMailboxMessageForLearning } from "@/lib/mailbox/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  let body: { action?: string; messageIds?: unknown; consent?: boolean };
  try { body = await request.json() as typeof body; } catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }

  if (body.action === "rescreen") {
    return Response.json(await screenStoredMailboxMessages(session.userId));
  }

  if (body.action !== "authorize" && body.action !== "skip") {
    return Response.json({ error: "action 无效" }, { status: 400 });
  }
  if (!Array.isArray(body.messageIds)) return Response.json({ error: "messageIds 必须是数组" }, { status: 400 });
  const limit = body.action === "authorize" ? 5 : 50;
  const messageIds = [...new Set(body.messageIds)].filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id));
  if (messageIds.length === 0 || messageIds.length > limit || messageIds.length !== body.messageIds.length) {
    return Response.json({ error: `一次最多处理 ${limit} 封有效邮件` }, { status: 400 });
  }
  if (body.action === "authorize" && body.consent !== true) {
    return Response.json({ error: "必须明确同意这些邮件脱敏后发送给 Kimi" }, { status: 400 });
  }
  if (body.action === "authorize" && !process.env.KIMI_API_KEY?.trim()) {
    return Response.json({ error: "KIMI_API_KEY 尚未配置" }, { status: 503 });
  }

  const results: Array<{ id: string; status: string; candidates: number; error?: string }> = [];
  for (const id of messageIds) {
    try {
      const result = await reviewMailboxMessageForLearning(session.userId, id, body.action);
      results.push({ id, status: result.status, candidates: result.candidates });
    } catch (error) {
      results.push({ id, status: "failed", candidates: 0, error: error instanceof Error ? error.message : "处理失败" });
    }
  }
  return Response.json({ results, processed: results.length, failed: results.filter((item) => item.status === "failed").length });
}
