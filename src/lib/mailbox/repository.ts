import { query, transaction } from "@/lib/rag/db";
import { decryptMailboxCredential, encryptMailboxCredential } from "./crypto";
import { ALIMAIL_IMAP_HOST, ALIMAIL_IMAP_PORT, type ImportedMailboxMessage, type MailboxCursor } from "./alimail-imap";

export interface MailboxConnectionRecord {
  id: string;
  userId: string;
  email: string;
  status: "active" | "error" | "disabled";
  credentialCiphertext: string;
  lastVerifiedAt?: string;
  lastError?: string;
}

export async function upsertMailboxConnection(userId: string, email: string, password: string): Promise<string> {
  const encrypted = encryptMailboxCredential(password);
  const rows = await query<{ id: string }>(
    `insert into mailbox_connection
       (user_id, provider, email, host, port, credential_ciphertext, status, last_verified_at, last_error)
     values ($1, 'alimail-imap', $2, $3, $4, $5, 'active', now(), null)
     on conflict (user_id, email) do update set credential_ciphertext = excluded.credential_ciphertext,
       host = excluded.host, port = excluded.port, status = 'active', last_verified_at = now(),
       last_error = null, updated_at = now()
     returning id`,
    [userId, email, ALIMAIL_IMAP_HOST, ALIMAIL_IMAP_PORT, encrypted],
  );
  return rows[0].id;
}

export async function listMailboxConnections(userId: string): Promise<Array<Omit<MailboxConnectionRecord, "credentialCiphertext">>> {
  const rows = await query<{
    id: string; user_id: string; email: string; status: MailboxConnectionRecord["status"];
    last_verified_at: string | null; last_error: string | null;
  }>(
    `select id, user_id, email, status, last_verified_at::text, last_error
     from mailbox_connection where user_id = $1 order by created_at`,
    [userId],
  );
  return rows.map((row) => ({
    id: row.id, userId: row.user_id, email: row.email, status: row.status,
    lastVerifiedAt: row.last_verified_at ?? undefined, lastError: row.last_error ?? undefined,
  }));
}

export async function getMailboxConnection(userId: string, connectionId: string): Promise<MailboxConnectionRecord | null> {
  const rows = await query<{
    id: string; user_id: string; email: string; status: MailboxConnectionRecord["status"];
    credential_ciphertext: string; last_verified_at: string | null; last_error: string | null;
  }>(
    `select id, user_id, email, status, credential_ciphertext, last_verified_at::text, last_error
     from mailbox_connection where user_id = $1 and id = $2 limit 1`,
    [userId, connectionId],
  );
  const row = rows[0];
  return row ? {
    id: row.id, userId: row.user_id, email: row.email, status: row.status,
    credentialCiphertext: row.credential_ciphertext,
    lastVerifiedAt: row.last_verified_at ?? undefined, lastError: row.last_error ?? undefined,
  } : null;
}

export function connectionPassword(connection: MailboxConnectionRecord): string {
  return decryptMailboxCredential(connection.credentialCiphertext);
}

export async function getMailboxCursors(userId: string, connectionId: string): Promise<Map<string, MailboxCursor>> {
  const rows = await query<{ folder_path: string; uid_validity: string; last_uid: string }>(
    `select folder_path, uid_validity, last_uid::text from mailbox_sync_cursor
     where user_id = $1 and connection_id = $2`,
    [userId, connectionId],
  );
  return new Map(rows.map((row) => [row.folder_path, {
    folderPath: row.folder_path, uidValidity: row.uid_validity, lastUid: Number(row.last_uid),
  }]));
}

export async function startMailboxSyncRun(userId: string, connectionId: string): Promise<string> {
  const rows = await query<{ id: string }>(
    `insert into mailbox_sync_run (user_id, connection_id) values ($1, $2) returning id`,
    [userId, connectionId],
  );
  return rows[0].id;
}

function artifactKinds(message: ImportedMailboxMessage, mailboxEmail: string): Array<"company-policy" | "customer-signal" | "email-template"> {
  const text = `${message.subject}\n${message.bodyText}`;
  const kinds: Array<"company-policy" | "customer-signal" | "email-template"> = [];
  if (/(政策|规定|流程|审批|价格体系|保修|退换|policy|procedure|approval|warranty)/i.test(text)) kinds.push("company-policy");
  const ownDomain = mailboxEmail.split("@")[1]?.toLowerCase();
  const participants = [...message.sender, ...message.recipients];
  if (participants.some((item) => item.address.split("@")[1]?.toLowerCase() !== ownDomain)) kinds.push("customer-signal");
  if (message.direction === "outbound" && message.bodyText.length >= 80) kinds.push("email-template");
  return kinds;
}

export async function persistMailboxSync(input: {
  runId: string;
  userId: string;
  connectionId: string;
  mailboxEmail: string;
  messages: ImportedMailboxMessage[];
  cursors: MailboxCursor[];
  folders: number;
  discovered: number;
}): Promise<{ imported: number; skipped: number }> {
  return transaction(async (client) => {
    let imported = 0;
    for (const message of input.messages) {
      const result = await client.query<{ id: string; inserted: boolean }>(
        `insert into mailbox_message
           (user_id, connection_id, folder_path, uid_validity, message_uid, internet_message_id,
            direction, sender, recipients, subject, sent_at, body_text, content_sha256, metadata)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         on conflict (user_id, connection_id, folder_path, uid_validity, message_uid) do update set
           internet_message_id = excluded.internet_message_id, direction = excluded.direction,
           sender = excluded.sender, recipients = excluded.recipients, subject = excluded.subject,
           sent_at = excluded.sent_at, body_text = excluded.body_text,
           content_sha256 = excluded.content_sha256, metadata = excluded.metadata, updated_at = now()
         returning id, (xmax = 0) as inserted`,
        [input.userId, input.connectionId, message.folderPath, message.uidValidity, message.uid,
          message.internetMessageId ?? null, message.direction, JSON.stringify(message.sender),
          JSON.stringify(message.recipients), message.subject, message.sentAt ?? null, message.bodyText,
          message.contentSha256, JSON.stringify(message.metadata)],
      );
      const stored = result.rows[0];
      if (stored.inserted) imported += 1;
      for (const kind of artifactKinds(message, input.mailboxEmail)) {
        await client.query(
          `insert into mailbox_artifact_candidate (user_id, message_id, kind, title, content, structured_data)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (user_id, message_id, kind) do update set title = excluded.title,
             content = excluded.content, structured_data = excluded.structured_data`,
          [input.userId, stored.id, kind, message.subject || `Email ${message.uid}`,
            message.bodyText, JSON.stringify({ sender: message.sender, recipients: message.recipients,
              sentAt: message.sentAt, direction: message.direction })],
        );
      }
    }
    for (const cursor of input.cursors) {
      await client.query(
        `insert into mailbox_sync_cursor (user_id, connection_id, folder_path, uid_validity, last_uid)
         values ($1, $2, $3, $4, $5)
         on conflict (user_id, connection_id, folder_path) do update set
           uid_validity = excluded.uid_validity, last_uid = excluded.last_uid, updated_at = now()`,
        [input.userId, input.connectionId, cursor.folderPath, cursor.uidValidity, cursor.lastUid],
      );
    }
    const skipped = input.messages.length - imported;
    await client.query(
      `update mailbox_sync_run set status = 'completed', folder_count = $2, discovered_count = $3,
       imported_count = $4, skipped_count = $5, finished_at = now()
       where id = $1 and user_id = $6`,
      [input.runId, input.folders, input.discovered, imported, skipped, input.userId],
    );
    return { imported, skipped };
  });
}

export async function failMailboxSyncRun(runId: string, userId: string, error: string): Promise<void> {
  await query(
    `update mailbox_sync_run set status = 'failed', error_message = $3, finished_at = now()
     where id = $1 and user_id = $2`,
    [runId, userId, error.slice(0, 2_000)],
  );
}
