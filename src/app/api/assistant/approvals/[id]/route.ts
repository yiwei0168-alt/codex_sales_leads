import { z } from "zod";
import { requireApiSession } from "@/lib/auth/session";
import { decideApproval } from "@/lib/assistant/main/approvals";
const input = z.object({ decision: z.enum(["approve", "deny", "revoke"]), parameterHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(); if (session instanceof Response) return session;
  const { id } = await context.params;
  const body = input.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !body.success) return Response.json({ error: "Invalid approval" }, { status: 400 });
  const changed = await decideApproval(session.userId, id, body.data.parameterHash, body.data.decision);
  return changed ? Response.json({ accepted: true }) : Response.json({ error: "确认内容或状态已变化，请刷新" }, { status: 409 });
}
