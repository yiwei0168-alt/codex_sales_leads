import { query } from "@/lib/rag/db";
import { OWNER_USER_ID, isAuthConfigured } from "./config";

export interface LoginUser {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 320;
}

export async function findLoginUser(email: string): Promise<LoginUser | null> {
  const normalized = normalizeEmail(email);
  const rows = await query<{
    id: string; email: string; display_name: string; password_hash: string | null;
  }>(
    `select id, email, display_name, password_hash
     from app_user where lower(email) = $1 and status = 'active' limit 1`,
    [normalized],
  );
  const row = rows[0];
  if (!row) return null;
  const legacyHash = row.id === OWNER_USER_ID ? process.env.APP_PASSWORD_HASH?.trim() : undefined;
  const passwordHash = row.password_hash?.trim() || legacyHash;
  return passwordHash ? {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    passwordHash,
  } : null;
}

export async function hasConfiguredUsers(): Promise<boolean> {
  const rows = await query<{ configured: boolean }>(
    `select exists(select 1 from app_user where status = 'active' and password_hash is not null) as configured`,
  );
  return Boolean(rows[0]?.configured) || isAuthConfigured();
}
