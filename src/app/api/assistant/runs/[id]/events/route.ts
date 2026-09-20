import { z } from "zod";
import { requireApiSession } from "@/lib/auth/session";
import { getRun, readEvents } from "@/lib/assistant/main/repository";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(); if (session instanceof Response) return session;
  const { id } = await context.params;
  const after = request.headers.get("Last-Event-ID") ?? new URL(request.url).searchParams.get("after") ?? "0";
  if (!z.uuid().safeParse(id).success || !/^\d{1,18}$/.test(after)) return Response.json({ error: "Invalid cursor or run" }, { status: 400 });
  try {
    const run = await getRun(session.userId, id);
    if (!run) return Response.json({ error: "Not found" }, { status: 404 });
    const events = await readEvents(session.userId, id, after);
    // Short-lived SSE pages naturally reconnect with Last-Event-ID. No task work lives in this request.
    const body = "retry: 1500\n\n" + events.map(e => `id: ${e.id}\nevent: ${e.kind}\ndata: ${JSON.stringify(e.payload)}\n\n`).join("") + ": cursor page complete\n\n";
    return new Response(body, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "private, no-store", "X-Accel-Buffering": "no" } });
  } catch { return Response.json({ error: "事件暂不可用" }, { status: 503 }); }
}
