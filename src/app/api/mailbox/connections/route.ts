import { requireApiSession } from "@/lib/auth/session";
import { normalizeEmail } from "@/lib/auth/users";
import { connectMailbox } from "@/lib/mailbox/service";
import { mailboxConnectionSchema } from "@/lib/mailbox/connection-config";
import { listMailboxConnections } from "@/lib/mailbox/repository";
import { mailboxConnectionErrorMessage } from "@/lib/mailbox/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  return Response.json({ connections: await listMailboxConnections(session.userId) });
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  if (!process.env.MAILBOX_CREDENTIAL_KEY?.trim()) {
    return Response.json({ error: "MAILBOX_CREDENTIAL_KEY 尚未配置" }, { status: 503 });
  }
  let body: Record<string,unknown>;
  try { body = await request.json() as Record<string,unknown>; } catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  const parsed = mailboxConnectionSchema.safeParse({...body,email:normalizeEmail(String(body.email??""))});
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "邮箱配置无效" }, { status: 400 });
  try {
    const connectionId = await connectMailbox(session.userId, parsed.data);
    return Response.json({ connectionId, connected: true }, { status: 201 });
  } catch (error) {
    return Response.json({ error: mailboxConnectionErrorMessage(error) }, { status: 502 });
  }
}
