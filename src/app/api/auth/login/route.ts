import { verifyPassword } from "@/lib/auth/password";
import { createSession, hashClientAddress } from "@/lib/auth/session";
import { query } from "@/lib/rag/db";
import { findLoginUser, isValidEmail, normalizeEmail } from "@/lib/auth/users";
import {z} from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const ipHash = hashClientAddress(ip);
  const failures = await query<{ count: string }>(
    `select count(*)::text as count from auth_login_attempt where ip_sha256 = $1 and not succeeded and created_at > now() - interval '15 minutes'`,
    [ipHash],
  );
  if (Number(failures[0]?.count ?? 0) >= 5) return Response.json({ error: "登录尝试过多，请 15 分钟后重试" }, { status: 429 });
  const parsed=z.object({email:z.string().max(320),password:z.string().max(1024)}).strict().safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return Response.json({error:"请提供有效的邮箱和密码"},{status:400});
  const email = normalizeEmail(parsed.data.email);
  if (!isValidEmail(email)) return Response.json({ error: "请输入有效的登录邮箱" }, { status: 400 });
  const password = parsed.data.password;
  const user = await findLoginUser(email);
  const succeeded = Boolean(user) && password.length <= 1024 && verifyPassword(password, user!.passwordHash);
  await query("insert into auth_login_attempt (ip_sha256, succeeded) values ($1, $2)", [ipHash, succeeded]);
  if (!succeeded) return Response.json({ error: "密码错误" }, { status: 401 });
  await query("delete from auth_login_attempt where ip_sha256 = $1 and not succeeded", [ipHash]);
  await createSession(user!.id);
  return Response.json({ authenticated: true });
}
