import { requireApiSession } from "@/lib/auth/session";
import { getMailboxMessageForReview } from "@/lib/mailbox/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "邮件 ID 无效" }, { status: 400 });
  const message = await getMailboxMessageForReview(session.userId, id);
  if (!message) return Response.json({ error: "邮件不存在" }, { status: 404 });
  return Response.json({ message });
}
