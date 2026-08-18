import { requireApiSession } from "@/lib/auth/session";
import { processAssistantMessage } from "@/lib/assistant/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  let parsed: unknown;
  try { parsed = await request.json(); } catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return Response.json({ error: "请求体无效" }, { status: 400 });
  const body = parsed as { conversationId?: string; content?: string };
  const content = body.content?.trim();
  if (!content || content.length < 2 || content.length > 4000) return Response.json({ error: "消息长度必须在 2–4000 字符之间" }, { status: 400 });
  if (body.conversationId && !/^[0-9a-f-]{36}$/i.test(body.conversationId)) return Response.json({ error: "对话 ID 无效" }, { status: 400 });
  try {
    return Response.json({ conversation: await processAssistantMessage(session.userId, { conversationId: body.conversationId, content }) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "消息处理失败" }, { status: 500 });
  }
}
