import { requireApiSession } from "@/lib/auth/session";
import { processAssistantMessage } from "@/lib/assistant/service";
import { getConversation } from "@/lib/assistant/repository";
import { enqueueRun } from "@/lib/assistant/main/repository";
import { messageInputSchema } from "@/lib/assistant/main/contracts";
import { defaultModelConfig, mainAgentEnabled } from "@/lib/assistant/main/product";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  let parsed: unknown;
  try { parsed = await request.json(); } catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return Response.json({ error: "请求体无效" }, { status: 400 });
  if (mainAgentEnabled(session.role)) {
    const input = messageInputSchema.safeParse({ requestKey: randomUUID(), ...parsed });
    if (!input.success) return Response.json({ error: "消息或附件参数无效" }, { status: 400 });
    try {
      const run = await enqueueRun(session.userId, input.data, defaultModelConfig());
      return Response.json({ conversation: await getConversation(session.userId, run.conversation_id), run: { id: run.id, status: run.status } }, { status: 202 });
    } catch {
      return Response.json({ error: "任务入队失败；请检查对话、附件或重复请求内容" }, { status: 409 });
    }
  }
  if (Array.isArray((parsed as Record<string,unknown>).attachments) && ((parsed as Record<string,unknown>).attachments as unknown[]).length > 0) {
    return Response.json({error:"当前账户尚未启用主 Agent 附件任务；资料已保留，请启用后重试"},{status:409});
  }
  const body = parsed as { conversationId?: string; content?: string };
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content || content.length < 2 || content.length > 4000) return Response.json({ error: "消息长度必须在 2–4000 字符之间" }, { status: 400 });
  if (body.conversationId && !/^[0-9a-f-]{36}$/i.test(body.conversationId)) return Response.json({ error: "对话 ID 无效" }, { status: 400 });
  try {
    return Response.json({ conversation: await processAssistantMessage(session.userId, { conversationId: body.conversationId, content }) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "消息处理失败" }, { status: 500 });
  }
}
