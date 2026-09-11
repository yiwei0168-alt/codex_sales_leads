import { readAliMailMessages, verifyAliMailCredentials } from "./alimail-imap";
import { kimiMailboxModel, learnMailboxMessageWithKimi } from "./kimi";
import { prepareMailboxDisclosure } from "./privacy";
import { tenantQuery } from "@/lib/rag/db";
import { mailboxRange } from "./sync-options";
import {
  blockMailboxMessageLearning, completeMailboxImport, connectionPassword, failMailboxMessageLearning,
  failMailboxSyncRun, finishMailboxOutboundAudit, getMailboxConnection, getMailboxCursors,
  getMailboxMessageForLearning, markMailboxMessageAnalyzing, persistMailboxImport,
  persistMailboxLearning, purgeExpiredMailboxContent, recordMailboxOutboundStart, skipMailboxMessageLearning, startMailboxSyncRun,
  updateMailboxSyncProgress, upsertMailboxConnection,
} from "./repository";

export async function connectAliMail(userId: string, email: string, password: string): Promise<string> {
  await verifyAliMailCredentials(email, password);
  return upsertMailboxConnection(userId, email, password);
}

export async function syncAliMail(userId: string, connectionId: string, options: {
  lookbackDays?: number;
  maxMessages?: number;
  folderScope?:"both"|"inbox"|"sent";
  from?:string;
  through?:string;
} = {}): Promise<{ runId: string; imported: number; skipped: number; discovered: number; awaitingReview: number }> {
  const connection = await getMailboxConnection(userId, connectionId);
  if (!connection || connection.status === "disabled") throw new Error("Mailbox connection not found");
  const runId = await startMailboxSyncRun(userId, connectionId);
  try {
    const retentionDays = Math.min(Math.max(Number(process.env.MAILBOX_RAW_RETENTION_DAYS ?? 365) || 365, 30), 3650);
    await purgeExpiredMailboxContent(userId, connectionId, retentionDays);
    const lookbackDays = Math.min(Math.max(options.lookbackDays ?? 365, 1), 3650);
    const maxMessages = Math.min(Math.max(options.maxMessages ?? 200, 1), 1000);
    const range=mailboxRange({...options,lookbackDays});
    const existing=options.from?await tenantQuery<{folder_path:string;uid_validity:string;message_uid:string}>(userId,
      "select folder_path,uid_validity,message_uid::text from mailbox_message where user_id=$1 and connection_id=$2",[userId,connectionId]):[];
    const result = await readAliMailMessages({
      email: connection.email,
      password: connectionPassword(connection),
      cursors: options.from?new Map():await getMailboxCursors(userId, connectionId),
      ...range,folderScope:options.folderScope,
      knownMessages:new Set(existing.map(item=>`${item.folder_path}:${item.uid_validity}:${item.message_uid}`)),
      maxMessages,
      onProgress: (progress) => updateMailboxSyncProgress({
        runId, userId, phase: progress.phase, folders: progress.folders,
        discovered: progress.discovered, processed: progress.processed,
        currentSubject: progress.currentSubject,
      }),
    });
    const persisted = await persistMailboxImport({
      runId, userId, connectionId,
      messages: result.messages, cursors: options.from?[]:result.cursors,
      folders: result.folders, discovered: result.discovered,
    });
    const awaitingReview = persisted.storedMessages.filter((item) => item.learningStatus === "pending").length;
    await completeMailboxImport(runId, userId, awaitingReview);
    return {
      runId,
      imported: persisted.imported,
      skipped: persisted.skipped,
      discovered: result.discovered,
      awaitingReview,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mailbox sync failed";
    await failMailboxSyncRun(runId, userId, message).catch(() => undefined);
    throw error;
  }
}

export async function reviewMailboxMessageForLearning(userId: string, messageId: string, action: "authorize" | "skip") {
  const message = await getMailboxMessageForLearning(userId, messageId);
  if (!message) throw new Error("待处理邮件不存在或已完成处理");
  if (action === "skip") {
    await skipMailboxMessageLearning(userId, messageId);
    await recordMailboxOutboundStart({
      userId, messageId, model: kimiMailboxModel(), decision: "skipped", status: "not-sent",
      originalCharCount: 0, disclosedCharCount: 0, redactionCounts: {},
    });
    return { status: "skipped" as const, candidates: 0 };
  }
  const disclosure = prepareMailboxDisclosure(message);
  if (disclosure.blockedReasons.length > 0) {
    const reason = `检测到高风险敏感信息：${disclosure.blockedReasons.join(", ")}，未发送给 Kimi`;
    await blockMailboxMessageLearning(userId, messageId, reason);
    await recordMailboxOutboundStart({
      userId, messageId, model: kimiMailboxModel(), decision: "blocked", status: "not-sent",
      inputSha256: disclosure.inputSha256, originalCharCount: disclosure.originalCharCount,
      disclosedCharCount: 0, redactionCounts: disclosure.redactionCounts,
    });
    return { status: "blocked" as const, candidates: 0, reason };
  }
  const auditId = await recordMailboxOutboundStart({
    userId, messageId, model: kimiMailboxModel(), decision: "authorized", status: "started",
    inputSha256: disclosure.inputSha256, originalCharCount: disclosure.originalCharCount,
    disclosedCharCount: disclosure.disclosedCharCount, redactionCounts: disclosure.redactionCounts,
  });
  await markMailboxMessageAnalyzing(userId, messageId);
  try {
    const learning = await learnMailboxMessageWithKimi(disclosure.message);
    const candidates = await persistMailboxLearning({ userId, messageId, message: disclosure.message, learning });
    await finishMailboxOutboundAudit(auditId, userId, { status: "completed" });
    return { status: "completed" as const, candidates, redactions: disclosure.redactionCounts };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Kimi mailbox learning failed";
    await failMailboxMessageLearning(userId, messageId, detail);
    await finishMailboxOutboundAudit(auditId, userId, { status: "failed", error: detail });
    throw error;
  }
}
