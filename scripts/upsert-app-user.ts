import nextEnv from "@next/env";
import { hashPassword } from "../src/lib/auth/password";
import { getPool, transaction } from "../src/lib/rag/db";
import { isValidEmail, normalizeEmail } from "../src/lib/auth/users";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const email = normalizeEmail(process.env.APP_USER_EMAIL ?? "");
const displayName = process.env.APP_USER_DISPLAY_NAME?.trim() ?? "";
const password = process.env.APP_PASSWORD_SETUP ?? "";
const role = process.env.APP_USER_ROLE === "admin" ? "admin" : "member";

if (!isValidEmail(email)) throw new Error("Set APP_USER_EMAIL to a valid email address for this command only.");
if (!displayName || displayName.length > 200) throw new Error("Set APP_USER_DISPLAY_NAME (1-200 characters) for this command only.");
if (!password) throw new Error("Set APP_PASSWORD_SETUP for this command only; it will not be written to disk.");

const passwordHash = hashPassword(password);
try {
  const userId = await transaction(async (client) => {
    const result = await client.query<{ id: string }>(
      `insert into app_user (email, display_name, password_hash, role, status)
       values ($1, $2, $3, $4, 'active')
       on conflict (email) do update set display_name = excluded.display_name,
         password_hash = excluded.password_hash, role = excluded.role, status = 'active', updated_at = now()
       returning id`,
      [email, displayName, passwordHash, role],
    );
    const id = result.rows[0].id;
    await client.query(
      `insert into market_workspace (owner_id, slug, name, market, country_code, objective)
       values ($1, 'mexico-pilot', 'Mexico Market Pilot', 'Mexico', 'MX',
         'Discover and develop qualified sales leads in Mexico.')
       on conflict (owner_id, slug) do nothing`,
      [id],
    );
    return id;
  });
  console.log(`User ready: ${email} (${userId})`);
} finally {
  await getPool().end();
}
