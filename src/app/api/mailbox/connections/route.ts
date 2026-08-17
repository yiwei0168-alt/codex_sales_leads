import { requireApiSession } from "@/lib/auth/session";
import { isValidEmail, normalizeEmail } from "@/lib/auth/users";
import { connectAliMail } from "@/lib/mailbox/service";
import { listMailboxConnections } from "@/lib/mailbox/repository";

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
  let body: { email?: string; securityPassword?: string };
  try { body = await request.json() as typeof body; } catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  const email = normalizeEmail(body.email ?? "");
  const password = body.securityPassword ?? "";
  if (!isValidEmail(email)) return Response.json({ error: "请输入有效的阿里邮箱地址" }, { status: 400 });
  if (password.length < 6 || password.length > 1024) return Response.json({ error: "请输入有效的第三方客户端安全密码" }, { status: 400 });
  try {
    const connectionId = await connectAliMail(session.userId, email, password);
    return Response.json({ connectionId, connected: true }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "阿里邮箱连接失败" }, { status: 502 });
  }
}
