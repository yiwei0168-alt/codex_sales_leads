import nextEnv from "@next/env";
import { Pool } from "pg";
import { encryptMailboxContent } from "../src/lib/mailbox/crypto";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const pool = new Pool({ connectionString: databaseUrl });
let encrypted = 0;
try {
  while (true) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const rows = await client.query<{
        id: string; user_id: string; subject: string; body_text: string; sender: unknown[]; recipients: unknown[];
      }>(
        `select id, user_id, subject, body_text, sender, recipients
         from mailbox_message where content_ciphertext is null
         order by captured_at limit 100 for update skip locked`,
      );
      if (rows.rows.length === 0) {
        await client.query("rollback");
        break;
      }
      for (const row of rows.rows) {
        const ciphertext = encryptMailboxContent(row.user_id, {
          subject: row.subject, bodyText: row.body_text, sender: row.sender, recipients: row.recipients,
        });
        await client.query(
          `update mailbox_message set content_ciphertext = $2, subject = '', body_text = '',
             sender = '[]', recipients = '[]', updated_at = now() where id = $1`,
          [row.id, ciphertext],
        );
        encrypted += 1;
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  console.log(`Encrypted ${encrypted} mailbox messages; plaintext fields were cleared.`);
} finally {
  await pool.end();
}
