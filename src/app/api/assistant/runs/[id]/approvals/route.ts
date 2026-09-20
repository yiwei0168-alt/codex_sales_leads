import { z } from "zod";
import { requireApiSession } from "@/lib/auth/session";
import { listApprovals } from "@/lib/assistant/main/approvals";
import { getRun } from "@/lib/assistant/main/repository";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(); if (session instanceof Response) return session;
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Invalid run" }, { status: 400 });
  if (!await getRun(session.userId, id)) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ approvals: await listApprovals(session.userId, id) }, { headers: { "Cache-Control": "private, no-store" } });
}
