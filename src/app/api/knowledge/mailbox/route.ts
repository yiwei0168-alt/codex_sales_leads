import { requireApiSession } from "@/lib/auth/session";
import { listApprovedMailboxKnowledge } from "@/lib/mailbox/knowledge-overview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  const items = await listApprovedMailboxKnowledge(session.userId);
  return Response.json({ items, total: items.length });
}
