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
  const body = await request.json().catch(() => null) as { question?: unknown; filters?: { collections?: unknown } } | null;
  const collections = body?.filters?.collections ?? ["industry", "company", "product"];
  const input = messageInputSchema.safeParse({
    content: body?.question,
    knowledgeScope: collections,
    requestKey: randomUUID(),
    attachments: [],
  });
  if (!input.success || input.data.content.length < 3 || input.data.content.length > 4000) {
    return Response.json({ error: "问题或检索范围无效" }, { status: 400 });
  }
  try {
    const run = await enqueueRun(session.userId, input.data, defaultModelConfig());
    return Response.json({ conversation: await getConversation(session.userId, run.conversation_id),
      run: { id: run.id, status: run.status } }, { status: 202 });
  } catch {
    return Response.json({ error: "知识问答任务入队失败" }, { status: 409 });
  }
}
