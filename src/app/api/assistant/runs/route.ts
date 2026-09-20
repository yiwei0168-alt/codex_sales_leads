import { z } from "zod";
import { requireApiSession } from "@/lib/auth/session";
import { listRuns } from "@/lib/assistant/main/repository";
import { mainAgentEnabled } from "@/lib/assistant/main/product";
export async function GET(request: Request) {
  const session = await requireApiSession(); if (session instanceof Response) return session;
  const id = new URL(request.url).searchParams.get("conversationId") ?? undefined;
  if (id && !z.uuid().safeParse(id).success) return Response.json({ error: "Invalid conversation ID" }, { status: 400 });
  try { return Response.json({ enabled: mainAgentEnabled(session.role), runs: await listRuns(session.userId, id) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return Response.json({ error: "任务服务暂不可用" }, { status: 503 }); }
}
