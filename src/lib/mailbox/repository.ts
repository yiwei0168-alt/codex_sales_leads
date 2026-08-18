import { tenantQuery, tenantTransaction } from "@/lib/rag/db";
import { decryptMailboxContent, decryptMailboxCredential, encryptMailboxContent, encryptMailboxCredential } from "./crypto";
import { ALIMAIL_IMAP_HOST, ALIMAIL_IMAP_PORT, type ImportedMailboxMessage, type MailboxCursor } from "./alimail-imap";
import type { KimiMailboxLearningResult } from "./kimi";
import { screenMailboxMessage, type MailboxScreeningBucket } from "./screening";

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
  const rows = await tenantQuery<{ id: string }>(userId,
    `insert into mailbox_connection
       (user_id, provider, email, host, port, credential_ciphertext, status, last_verified_at, last_error)
     values ($1, 'alimail-imap', $2, $3, $4, $5, 'active', now(), null)
     on conflict (user_id, email) do update set credential_ciphertext = excluded.credential_ciphertext,
       host = excluded.host, port = excluded.port, status = 'active', last_verified_at = now(),
       last_error = null, updated_at = now()
     returning id`,
    [userId, email, ALIMAIL_IMAP_HOST, ALIMAIL_IMAP_PORT, encrypted],
  );
  if (!rows[0]) throw new Error("邮箱连接未能保存");
  return rows[0].id;
}

export async function listMailboxConnections(userId: string): Promise<Array<Omit<MailboxConnectionRecord, "credentialCiphertext">>> {
  const rows = await tenantQuery<{
    id: string; user_id: string; email: string; status: MailboxConnectionRecord["status"];
    last_verified_at: string | null; last_error: string | null;
  }>(userId,
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
  const rows = await tenantQuery<{
    id: string; user_id: string; email: string; status: MailboxConnectionRecord["status"];
    credential_ciphertext: string; last_verified_at: string | null; last_error: string | null;
  }>(userId,
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
  const rows = await tenantQuery<{ folder_path: string; uid_validity: string; last_uid: string }>(userId,
    `select folder_path, uid_validity, last_uid::text from mailbox_sync_cursor
     where user_id = $1 and connection_id = $2`,
    [userId, connectionId],
  );
  return new Map(rows.map((row) => [row.folder_path, {
    folderPath: row.folder_path, uidValidity: row.uid_validity, lastUid: Number(row.last_uid),
  }]));
}

export async function startMailboxSyncRun(userId: string, connectionId: string, model?: string): Promise<string> {
  const rows = await tenantQuery<{ id: string }>(userId,
    `insert into mailbox_sync_run (user_id, connection_id, phase, model)
     values ($1, $2, 'queued', $3) returning id`,
    [userId, connectionId, model],
  );
  if (!rows[0]) throw new Error("邮箱同步任务未能启动");
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
  await tenantQuery(input.userId,
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
  learningStatus: "pending" | "analyzing" | "completed" | "failed" | "skipped" | "blocked";
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
  return tenantTransaction(input.userId, async (client) => {
    let imported = 0;
    const storedMessages: StoredMailboxMessage[] = [];
    const connection = await client.query<{ email: string }>(
      `select email from mailbox_connection where id = $1 and user_id = $2 limit 1`,
      [input.connectionId, input.userId],
    );
    if (!connection.rows[0]) throw new Error("邮箱连接不存在");
    const products = await client.query<{ model: string; product_name: string }>(
      `select model, product_name from product_catalog order by model limit 5000`,
    );
    const productTerms = products.rows.flatMap((item) => [item.model, item.product_name]);
    for (const message of input.messages) {
      const contentCiphertext = encryptMailboxContent(input.userId, {
        subject: message.subject, bodyText: message.bodyText,
        sender: message.sender, recipients: message.recipients,
      });
      const screening = screenMailboxMessage({
        message, mailboxEmail: connection.rows[0].email, productTerms,
      });
      const result = await client.query<{ id: string; inserted: boolean; learning_status: StoredMailboxMessage["learningStatus"] }>(
        `insert into mailbox_message
           (user_id, connection_id, folder_path, uid_validity, message_uid, internet_message_id,
            direction, sender, recipients, subject, sent_at, body_text, content_sha256, metadata, sync_run_id,
            content_ciphertext, thread_key, screening_score, screening_bucket, screening_reasons, screened_at)
         values ($1, $2, $3, $4, $5, $6, $7, '[]', '[]', '', $8, '', $9, $10, $11, $12,
           $13, $14, $15, $16, now())
         on conflict (user_id, connection_id, folder_path, uid_validity, message_uid) do update set
           internet_message_id = excluded.internet_message_id, direction = excluded.direction,
           sender = excluded.sender, recipients = excluded.recipients, subject = excluded.subject,
           sent_at = excluded.sent_at, body_text = excluded.body_text, content_ciphertext = excluded.content_ciphertext,
           learning_status = case when mailbox_message.content_sha256 <> excluded.content_sha256
             then 'pending' else mailbox_message.learning_status end,
           learning_error = case when mailbox_message.content_sha256 <> excluded.content_sha256
             then null else mailbox_message.learning_error end,
           content_sha256 = excluded.content_sha256, metadata = excluded.metadata,
           thread_key = excluded.thread_key, screening_score = excluded.screening_score,
           screening_bucket = excluded.screening_bucket, screening_reasons = excluded.screening_reasons,
           screened_at = now(),
           sync_run_id = excluded.sync_run_id, updated_at = now()
         returning id, (xmax = 0) as inserted, learning_status`,
        [input.userId, input.connectionId, message.folderPath, message.uidValidity, message.uid,
          message.internetMessageId ?? null, message.direction, message.sentAt ?? null,
          message.contentSha256, JSON.stringify(message.metadata), input.runId, contentCiphertext,
          screening.threadKey, screening.score, screening.bucket, JSON.stringify(screening.reasons)],
      );
      const stored = result.rows[0];
      if (stored.inserted) imported += 1;
      storedMessages.push({ id: stored.id, inserted: stored.inserted, learningStatus: stored.learning_status, message });
    }
    await client.query(
      `update mailbox_message m set
         screening_score = least(200, m.screening_score + 30),
         screening_bucket = case when least(200, m.screening_score + 30) >= 60 then 'recommended' else 'review' end,
         screening_reasons = case when m.screening_reasons @> '["你参与的互动线程"]'::jsonb
           then m.screening_reasons else m.screening_reasons || '["你参与的互动线程"]'::jsonb end,
         screened_at = now(), updated_at = now()
       where m.user_id = $1 and m.direction = 'inbound' and m.thread_key is not null
         and m.screening_score < 60 and exists (
           select 1 from mailbox_message sent
           where sent.user_id = m.user_id and sent.thread_key = m.thread_key and sent.direction = 'outbound'
         )`,
      [input.userId],
    );
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
      `update mailbox_sync_run set phase = 'awaiting-review', folder_count = $2, discovered_count = $3,
       processed_count = $6, imported_count = $4, skipped_count = $5,
       learning_total = $6, current_subject = null, updated_at = now()
       where id = $1 and user_id = $7`,
      [input.runId, input.folders, input.discovered, imported, skipped, storedMessages.length, input.userId],
    );
    return { imported, skipped, storedMessages };
  });
}

export async function markMailboxMessageAnalyzing(userId: string, messageId: string): Promise<void> {
  await tenantQuery(userId,
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
  return tenantTransaction(input.userId, async (client) => {
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
  await tenantQuery(userId,
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
  await tenantQuery(input.userId,
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
  await tenantQuery(input.userId,
    `update mailbox_sync_run set status = 'completed',
     phase = case when $4 > 0 then 'completed-with-errors' else 'completed' end,
     learning_processed = $3, learning_failed = $4, candidate_count = $5,
     current_subject = null, finished_at = now(), updated_at = now()
     where id = $1 and user_id = $2`,
    [input.runId, input.userId, input.processed, input.failed, input.candidates],
  );
}

export async function failMailboxSyncRun(runId: string, userId: string, error: string): Promise<void> {
  await tenantQuery(userId,
    `update mailbox_sync_run set status = 'failed', phase = 'failed', error_message = $3,
     current_subject = null, finished_at = now(), updated_at = now()
     where id = $1 and user_id = $2`,
    [runId, userId, error.slice(0, 2_000)],
  );
}

export async function completeMailboxImport(runId: string, userId: string, pending: number): Promise<void> {
  await tenantQuery(userId,
    `update mailbox_sync_run set status = 'completed', phase = 'awaiting-review',
     learning_total = $3, learning_processed = 0, learning_failed = 0, candidate_count = 0,
     current_subject = null, finished_at = now(), updated_at = now()
     where id = $1 and user_id = $2`,
    [runId, userId, pending],
  );
}

export async function getMailboxMessageForLearning(userId: string, messageId: string): Promise<ImportedMailboxMessage | null> {
  const rows = await tenantQuery<{
    folder_path: string; uid_validity: string; message_uid: string; internet_message_id: string | null;
    direction: ImportedMailboxMessage["direction"]; sender: ImportedMailboxMessage["sender"];
    recipients: ImportedMailboxMessage["recipients"]; subject: string; sent_at: string | null;
    body_text: string; content_ciphertext: string | null; content_sha256: string; metadata: Record<string, unknown>;
  }>(userId,
    `select folder_path, uid_validity, message_uid::text, internet_message_id, direction, sender,
            recipients, subject, sent_at::text, body_text, content_ciphertext, content_sha256, metadata
     from mailbox_message where id = $1 and user_id = $2 and learning_status in ('pending', 'failed') limit 1`,
    [messageId, userId],
  );
  const row = rows[0];
  if (!row) return null;
  const content = row.content_ciphertext ? decryptMailboxContent(userId, row.content_ciphertext) : {
    subject: row.subject, bodyText: row.body_text, sender: row.sender, recipients: row.recipients,
  };
  return {
    folderPath: row.folder_path, uidValidity: row.uid_validity, uid: Number(row.message_uid),
    internetMessageId: row.internet_message_id ?? undefined, direction: row.direction,
    sender: content.sender as ImportedMailboxMessage["sender"], recipients: content.recipients as ImportedMailboxMessage["recipients"], subject: content.subject,
    sentAt: row.sent_at ?? undefined, bodyText: content.bodyText,
    contentSha256: row.content_sha256, metadata: row.metadata,
  };
}

export interface MailboxMessageReviewItem {
  id: string;
  subject: string;
  excerpt: string;
  direction: ImportedMailboxMessage["direction"];
  learning_status: StoredMailboxMessage["learningStatus"];
  learning_error: string | null;
  updated_at: string;
  thread_key: string | null;
  screening_score: number;
  screening_bucket: MailboxScreeningBucket;
  screening_reasons: string[];
}

export async function listMailboxMessagesForReview(userId: string, runId: string, limit = 16): Promise<MailboxMessageReviewItem[]> {
  const rows = await tenantQuery<{
    id: string; subject: string; body_text: string; content_ciphertext: string | null;
    direction: ImportedMailboxMessage["direction"]; learning_status: StoredMailboxMessage["learningStatus"];
    learning_error: string | null; updated_at: string; thread_key: string | null;
    screening_score: number; screening_bucket: MailboxScreeningBucket; screening_reasons: string[];
  }>(userId,
    `select id, subject, body_text, content_ciphertext, direction, learning_status, learning_error,
            updated_at::text, thread_key, screening_score, screening_bucket, screening_reasons
     from mailbox_message where user_id = $1 and sync_run_id = $2
     order by screening_score desc, updated_at desc limit $3`,
    [userId, runId, Math.min(Math.max(limit, 1), 50)],
  );
  return rows.map((row) => {
    const content = row.content_ciphertext ? decryptMailboxContent(userId, row.content_ciphertext) : { subject: row.subject, bodyText: row.body_text };
    return { id: row.id, subject: content.subject, excerpt: content.bodyText.slice(0, 600), direction: row.direction,
      learning_status: row.learning_status, learning_error: row.learning_error, updated_at: row.updated_at,
      thread_key: row.thread_key, screening_score: row.screening_score,
      screening_bucket: row.screening_bucket, screening_reasons: row.screening_reasons };
  });
}

export async function screenStoredMailboxMessages(userId: string): Promise<{
  total: number; recommended: number; review: number; ignored: number;
}> {
  return tenantTransaction(userId, async (client) => {
    const products = await client.query<{ model: string; product_name: string }>(
      `select model, product_name from product_catalog order by model limit 5000`,
    );
    const productTerms = products.rows.flatMap((item) => [item.model, item.product_name]);
    const rows = await client.query<{
      id: string; email: string; folder_path: string; uid_validity: string; message_uid: string;
      internet_message_id: string | null; direction: ImportedMailboxMessage["direction"];
      sent_at: string | null; content_ciphertext: string; content_sha256: string; metadata: Record<string, unknown>;
    }>(
      `select m.id, c.email, m.folder_path, m.uid_validity, m.message_uid::text,
              m.internet_message_id, m.direction, m.sent_at::text, m.content_ciphertext,
              m.content_sha256, m.metadata
       from mailbox_message m join mailbox_connection c on c.id = m.connection_id and c.user_id = m.user_id
       where m.user_id = $1 and m.learning_status in ('pending', 'failed')
       order by m.sent_at desc nulls last limit 1000`,
      [userId],
    );
    const total = rows.rows.length;
    for (const row of rows.rows) {
      const content = decryptMailboxContent(userId, row.content_ciphertext);
      const message: ImportedMailboxMessage = {
        folderPath: row.folder_path, uidValidity: row.uid_validity, uid: Number(row.message_uid),
        internetMessageId: row.internet_message_id ?? undefined, direction: row.direction,
        sender: content.sender as ImportedMailboxMessage["sender"],
        recipients: content.recipients as ImportedMailboxMessage["recipients"],
        subject: content.subject, bodyText: content.bodyText, sentAt: row.sent_at ?? undefined,
        contentSha256: row.content_sha256, metadata: row.metadata,
      };
      const screening = screenMailboxMessage({ message, mailboxEmail: row.email, productTerms });
      await client.query(
        `update mailbox_message set thread_key = $3, screening_score = $4,
           screening_bucket = $5, screening_reasons = $6, screened_at = now(), updated_at = now()
         where id = $1 and user_id = $2`,
        [row.id, userId, screening.threadKey, screening.score, screening.bucket, JSON.stringify(screening.reasons)],
      );
    }
    await client.query(
      `update mailbox_message m set
         screening_score = least(200, m.screening_score + 30),
         screening_bucket = case when least(200, m.screening_score + 30) >= 60 then 'recommended' else 'review' end,
         screening_reasons = case when m.screening_reasons @> '["你参与的互动线程"]'::jsonb
           then m.screening_reasons else m.screening_reasons || '["你参与的互动线程"]'::jsonb end,
         screened_at = now(), updated_at = now()
       where m.user_id = $1 and m.direction = 'inbound' and m.thread_key is not null
         and m.screening_score < 60 and exists (
           select 1 from mailbox_message sent
           where sent.user_id = m.user_id and sent.thread_key = m.thread_key and sent.direction = 'outbound'
         )`,
      [userId],
    );
    const summary = await client.query<{ bucket: MailboxScreeningBucket; count: number }>(
      `select screening_bucket as bucket, count(*)::int as count from mailbox_message
       where user_id = $1 and learning_status in ('pending', 'failed') group by screening_bucket`,
      [userId],
    );
    const counts = { total, recommended: 0, review: 0, ignored: 0 };
    for (const item of summary.rows) counts[item.bucket] = item.count;
    return counts;
  });
}

export async function deleteMailboxConnectionData(userId: string, connectionId: string): Promise<boolean> {
  return tenantTransaction(userId, async (client) => {
    await client.query(
      `delete from knowledge_document where owner_id = $1 and external_id in (
         select 'mailbox-artifact:' || c.id::text from mailbox_artifact_candidate c
         join mailbox_message m on m.id = c.message_id and m.user_id = c.user_id
         where c.user_id = $1 and m.connection_id = $2
       )`,
      [userId, connectionId],
    );
    const result = await client.query(
      `delete from mailbox_connection where id = $1 and user_id = $2`,
      [connectionId, userId],
    );
    return (result.rowCount ?? 0) > 0;
  });
}

export async function purgeExpiredMailboxContent(userId: string, connectionId: string, retentionDays: number): Promise<number> {
  return tenantTransaction(userId, async (client) => {
    const rows = await client.query<{ id: string }>(
      `select id from mailbox_message
       where user_id = $1 and connection_id = $2
         and coalesce(sent_at, captured_at) < now() - ($3::text || ' days')::interval
         and coalesce((metadata->>'rawContentPurged')::boolean, false) = false`,
      [userId, connectionId, retentionDays],
    );
    for (const row of rows.rows) {
      const ciphertext = encryptMailboxContent(userId, {
        subject: "[已按保留策略删除]", bodyText: "", sender: [], recipients: [],
      });
      await client.query(
        `update mailbox_message set content_ciphertext = $3,
           metadata = metadata || '{"rawContentPurged":true}'::jsonb,
           learning_status = case when learning_status in ('pending', 'failed') then 'skipped' else learning_status end,
           learning_error = case when learning_status in ('pending', 'failed') then '原始内容已按保留策略删除' else learning_error end,
           updated_at = now() where id = $1 and user_id = $2`,
        [row.id, userId, ciphertext],
      );
    }
    return rows.rows.length;
  });
}

export async function recordMailboxOutboundStart(input: {
  userId: string; messageId: string; model: string; inputSha256?: string;
  originalCharCount: number; disclosedCharCount: number; redactionCounts: Record<string, number>;
  decision: "authorized" | "skipped" | "blocked"; status: "started" | "not-sent";
}): Promise<string> {
  const rows = await tenantQuery<{ id: string }>(input.userId,
    `insert into mailbox_outbound_audit
       (user_id, message_id, provider, model, decision, status, input_sha256,
        original_char_count, disclosed_char_count, redaction_counts, finished_at)
     values ($1, $2, 'kimi', $3, $4, $5, $6, $7, $8, $9,
       case when $5 = 'not-sent' then now() else null end) returning id`,
    [input.userId, input.messageId, input.model, input.decision, input.status,
      input.inputSha256 ?? null, input.originalCharCount, input.disclosedCharCount,
      JSON.stringify(input.redactionCounts)],
  );
  if (!rows[0]) throw new Error("邮件外发审计未能创建");
  return rows[0].id;
}

export async function finishMailboxOutboundAudit(auditId: string, userId: string, input: {
  status: "completed" | "failed"; error?: string;
}): Promise<void> {
  await tenantQuery(userId,
    `update mailbox_outbound_audit set status = $3, error_message = $4, finished_at = now()
     where id = $1 and user_id = $2`,
    [auditId, userId, input.status, input.error?.slice(0, 1_000) ?? null],
  );
}

export async function skipMailboxMessageLearning(userId: string, messageId: string): Promise<boolean> {
  const rows = await tenantQuery<{ id: string }>(userId,
    `update mailbox_message set learning_status = 'skipped', learning_error = null, learned_at = now(), updated_at = now()
     where id = $1 and user_id = $2 and learning_status in ('pending', 'failed') returning id`,
    [messageId, userId],
  );
  return Boolean(rows[0]);
}

export async function blockMailboxMessageLearning(userId: string, messageId: string, reason: string): Promise<void> {
  await tenantQuery(userId,
    `update mailbox_message set learning_status = 'blocked', learning_error = $3, learned_at = now(), updated_at = now()
     where id = $1 and user_id = $2`,
    [messageId, userId, reason.slice(0, 1_000)],
  );
}
