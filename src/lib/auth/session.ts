import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { query } from "@/lib/rag/db";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "./config";

export interface AppSession {
  userId: string;
  displayName: string;
  role: "admin" | "member";
  developmentBypass?: boolean;
}

function tokenHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await query(
    `insert into app_session (user_id, token_sha256, expires_at) values ($1, $2, $3)`,
    [userId, tokenHash(token), expiresAt.toISOString()],
  );
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await query("delete from app_session where token_sha256 = $1", [tokenHash(token)]);
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<AppSession | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const sessions = await query<{ user_id: string; display_name: string; role: "admin" | "member" }>(
    `update app_session s set last_seen_at = now()
     from app_user u
     where s.user_id = u.id and s.token_sha256 = $1 and s.expires_at > now()
     returning s.user_id, u.display_name, u.role`,
    [tokenHash(token)],
  );
  return sessions[0] ? { userId: sessions[0].user_id, displayName: sessions[0].display_name, role: sessions[0].role } : null;
}

export async function requireApiSession(): Promise<AppSession | Response> {
  const session = await getSession();
  return session ?? Response.json({ error: "Unauthorized" }, { status: 401 });
}

export function hashClientAddress(value: string): string {
  return tokenHash(value || "unknown");
}
