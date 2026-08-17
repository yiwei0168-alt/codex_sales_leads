import nextEnv from "@next/env";
import { query, tenantQuery } from "../src/lib/rag/db";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const users = await query<{ id: string }>("select id::text from app_user where status = 'active' order by created_at limit 1");
if (!users[0]) throw new Error("No active application user exists");
const [own] = await tenantQuery<{
  total: number; encrypted: number; plaintext: number;
}>(users[0].id,
  `select count(*)::int as total, count(content_ciphertext)::int as encrypted,
          count(*) filter (where not (subject = '' and body_text = '' and sender = '[]'::jsonb and recipients = '[]'::jsonb))::int as plaintext
   from mailbox_message`,
);
const [unknown] = await tenantQuery<{ total: number }>(
  "ffffffff-ffff-4fff-8fff-ffffffffffff",
  "select count(*)::int as total from mailbox_message",
);
const [role] = await query<{ current_user: string }>("select current_user");
console.log(JSON.stringify({
  total: own.total,
  encrypted: own.encrypted,
  plaintextFieldsPresent: own.plaintext,
  unknownTenantVisible: unknown.total,
  effectiveRole: role.current_user,
}));
process.exit(0);
