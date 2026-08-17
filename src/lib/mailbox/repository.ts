import { query, transaction } from "@/lib/rag/db";
import { decryptMailboxCredential, encryptMailboxCredential } from "./crypto";
import { ALIMAIL_IMAP_HOST, ALIMAIL_IMAP_PORT, type ImportedMailboxMessage, type MailboxCursor } from "./alimail-imap";
import type { KimiMailboxLearningResult } from "./kimi";

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
  if (!rows[0]) throw new Error("邮箱同步任务未能启动");
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

export async function startMailboxSyncRun(userId: string, connectionId: string, model: string): Promise<string> {
  const rows = await query<{ id: string }>(
    `insert into mailbox_sync_run (user_id, connection_id, phase, model)
     values ($1, $2, 'queued', $3) returning id`,
    [userId, connectionId, model],
  );
  return rows[0].id;
}

export async function updateMailboxSyncProgress(input: {
  runId: string;
  userId: string;
  phase: string;
  folders?: number;
  discovered?: number;
  processed?: number;
  currentSubject?: string;
}): Promise<void> {
  await query(
    `update mailbox_sync_run set phase = $3,
       folder_count = greatest(folder_count, coalesce($4, folder_count)),
       discovered_count = greatest(discovered_count, coalesce($5, discovered_count)),
       processed_count = greatest(processed_count, coalesce($6, processed_count)),
       current_subject = coalesce($7, current_subject), updated_at = now()
     where id = $1 and user_id = $2 and status = 'running'`,
    [input.runId, input.userId, input.phase, input.folders ?? null, input.discovered ?? null,
      input.processed ?? null, input.currentSubject ?? null],
  );
}

export interface StoredMailboxMessage {
  id: string;
  inserted: boolean;
  learningStatus: "pending" | "analyzing" | "completed" | "failed";
  message: ImportedMailboxMessage;
}

export async function persistMailboxImport(input: {
  runId: string;
  userId: string;
  connectionId: string;
  messages: ImportedMailboxMessage[];
  cursors: MailboxCursor[];
  folders: number;
  discovered: number;
}): Promise<{ imported: number; skipped: number; storedMessages: StoredMailboxMessage[] }> {
  return transaction(async (client) => {
    let imported = 0;
    const storedMessages: StoredMailboxMessage[] = [];
    for (const message of input.messages) {
      const result = await client.query<{ id: string; inserted: boolean; learning_status: StoredMailboxMessage["learningStatus"] }>(
        `insert into mailbox_message
           (user_id, connection_id, folder_path, uid_validity, message_uid, internet_message_id,
            direction, sender, recipients, subject, sent_at, body_text, content_sha256, metadata, sync_run_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         on conflict (user_id, connection_id, folder_path, uid_validity, message_uid) do update set
           internet_message_id = excluded.internet_message_id, direction = excluded.direction,
           sender = excluded.sender, recipients = excluded.recipients, subject = excluded.subject,
           sent_at = excluded.sent_at, body_text = excluded.body_text,
           learning_status = case when mailbox_message.content_sha256 <> excluded.content_sha256
             then 'pending' else mailbox_message.learning_status end,
           learning_error = case when mailbox_message.content_sha256 <> excluded.content_sha256
             then null else mailbox_message.learning_error end,
           content_sha256 = excluded.content_sha256, metadata = excluded.metadata,
           sync_run_id = excluded.sync_run_id, updated_at = now()
         returning id, (xmax = 0) as inserted, learning_status`,
        [input.userId, input.connectionId, message.folderPath, message.uidValidity, message.uid,
          message.internetMessageId ?? null, message.direction, JSON.stringify(message.sender),
          JSON.stringify(message.recipients), message.subject, message.sentAt ?? null, message.bodyText,
          message.contentSha256, JSON.stringify(message.metadata), input.runId],
      );
      const stored = result.rows[0];
      if (stored.inserted) imported += 1;
      storedMessages.push({ id: stored.id, inserted: stored.inserted, learningStatus: stored.learning_status, message });
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
      `update mailbox_sync_run set phase = 'learning', folder_count = $2, discovered_count = $3,
       processed_count = $6, imported_count = $4, skipped_count = $5,
       learning_total = $6, current_subject = null, updated_at = now()
       where id = $1 and user_id = $7`,
      [input.runId, input.folders, input.discovered, imported, skipped, storedMessages.length, input.userId],
    );
    return { imported, skipped, storedMessages };
  });
}

export async function markMailboxMessageAnalyzing(userId: string, messageId: string): Promise<void> {
  await query(
    `update mailbox_message set learning_status = 'analyzing', learning_error = null, updated_at = now()
     where id = $1 and user_id = $2`,
    [messageId, userId],
  );
}

export async function persistMailboxLearning(input: {
  userId: string;
  messageId: string;
  message: ImportedMailboxMessage;
  learning: KimiMailboxLearningResult;
}): Promise<number> {
  return transaction(async (client) => {
    let candidates = 0;
    for (const artifact of input.learning.artifacts) {
      const result = await client.query(
        `insert into mailbox_artifact_candidate
           (user_id, message_id, kind, title, content, structured_data, model, prompt_version, confidence, rationale)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         on conflict (user_id, message_id, kind) do update set title = excluded.title,
           content = excluded.content, structured_data = excluded.structured_data, model = excluded.model,
           prompt_version = excluded.prompt_version, confidence = excluded.confidence,
           rationale = excluded.rationale
         where mailbox_artifact_candidate.review_status = 'pending'`,
        [input.userId, input.messageId, artifact.kind, artifact.title, artifact.content,
          JSON.stringify({ summary: input.learning.summary, sender: input.message.sender,
            recipients: input.message.recipients, sentAt: input.message.sentAt, direction: input.message.direction }),
          input.learning.model, input.learning.promptVersion, artifact.confidence, artifact.rationale],
      );
      candidates += result.rowCount ?? 0;
    }
    await client.query(
      `update mailbox_message set learning_status = 'completed', learning_error = null,
       learned_at = now(), updated_at = now() where id = $1 and user_id = $2`,
      [input.messageId, input.userId],
    );
    return candidates;
  });
}

export async function failMailboxMessageLearning(userId: string, messageId: string, error: string): Promise<void> {
  await query(
    `update mailbox_message set learning_status = 'failed', learning_error = $3,
     learned_at = now(), updated_at = now() where id = $1 and user_id = $2`,
    [messageId, userId, error.slice(0, 1_000)],
  );
}

export async function updateMailboxLearningProgress(input: {
  runId: string;
  userId: string;
  processed: number;
  failed: number;
  candidates: number;
  currentSubject?: string;
}): Promise<void> {
  await query(
    `update mailbox_sync_run set phase = 'learning', learning_processed = $3,
     learning_failed = $4, candidate_count = $5, current_subject = $6, updated_at = now()
     where id = $1 and user_id = $2 and status = 'running'`,
    [input.runId, input.userId, input.processed, input.failed, input.candidates, input.currentSubject ?? null],
  );
}

export async function completeMailboxSyncRun(input: {
  runId: string;
  userId: string;
  processed: number;
  failed: number;
  candidates: number;
}): Promise<void> {
  await query(
    `update mailbox_sync_run set status = 'completed',
     phase = case when $4 > 0 then 'completed-with-errors' else 'completed' end,
     learning_processed = $3, learning_failed = $4, candidate_count = $5,
     current_subject = null, finished_at = now(), updated_at = now()
     where id = $1 and user_id = $2`,
    [input.runId, input.userId, input.processed, input.failed, input.candidates],
  );
}

export async function failMailboxSyncRun(runId: string, userId: string, error: string): Promise<void> {
  await query(
    `update mailbox_sync_run set status = 'failed', phase = 'failed', error_message = $3,
     current_subject = null, finished_at = now(), updated_at = now()
     where id = $1 and user_id = $2`,
    [runId, userId, error.slice(0, 2_000)],
  );
}
