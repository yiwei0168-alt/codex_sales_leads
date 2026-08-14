import { verifyPassword } from "@/lib/auth/password";
import { createSession, hashClientAddress } from "@/lib/auth/session";
import { isAuthConfigured } from "@/lib/auth/config";
import { query } from "@/lib/rag/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isAuthConfigured()) return Response.json({ error: "APP_PASSWORD_HASH is not configured" }, { status: 503 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const ipHash = hashClientAddress(ip);
  const failures = await query<{ count: string }>(
    `select count(*)::text as count from auth_login_attempt where ip_sha256 = $1 and not succeeded and created_at > now() - interval '15 minutes'`,
    [ipHash],
  );
  if (Number(failures[0]?.count ?? 0) >= 5) return Response.json({ error: "登录尝试过多，请 15 分钟后重试" }, { status: 429 });
  let body: { password?: string };
  try { body = await request.json() as { password?: string }; } catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  const password = body.password ?? "";
  const succeeded = password.length <= 1024 && verifyPassword(password, process.env.APP_PASSWORD_HASH!);
  await query("insert into auth_login_attempt (ip_sha256, succeeded) values ($1, $2)", [ipHash, succeeded]);
  if (!succeeded) return Response.json({ error: "密码错误" }, { status: 401 });
  await query("delete from auth_login_attempt where ip_sha256 = $1 and not succeeded", [ipHash]);
  await createSession();
  return Response.json({ authenticated: true });
}
