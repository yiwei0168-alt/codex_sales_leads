import { requireApiSession } from "@/lib/auth/session";
import { getConversation } from "@/lib/assistant/repository";
import { enqueueRun } from "@/lib/assistant/main/repository";
import { messageInputSchema } from "@/lib/assistant/main/contracts";
import { defaultModelConfig } from "@/lib/assistant/main/product";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  let parsed: unknown;
  try { parsed = await request.json(); } catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return Response.json({ error: "请求体无效" }, { status: 400 });
  const input = messageInputSchema.safeParse({ requestKey: randomUUID(), ...parsed });
  if (!input.success) return Response.json({ error: "消息或附件参数无效" }, { status: 400 });
  try {
    const run = await enqueueRun(session.userId, input.data, defaultModelConfig());
    return Response.json({ conversation: await getConversation(session.userId, run.conversation_id), run: { id: run.id, status: run.status } }, { status: 202 });
  } catch {
    return Response.json({ error: "任务入队失败；请检查对话、附件或重复请求内容" }, { status: 409 });
  }
}
