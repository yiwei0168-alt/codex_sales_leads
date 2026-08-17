import { readAliMailMessages, verifyAliMailCredentials } from "./alimail-imap";
import { kimiMailboxModel, learnMailboxMessagesWithKimi } from "./kimi";
import {
  completeMailboxSyncRun, connectionPassword, failMailboxMessageLearning, failMailboxSyncRun,
  getMailboxConnection, getMailboxCursors, markMailboxMessageAnalyzing, persistMailboxImport,
  persistMailboxLearning, startMailboxSyncRun, updateMailboxLearningProgress,
  updateMailboxSyncProgress, upsertMailboxConnection,
} from "./repository";

export async function connectAliMail(userId: string, email: string, password: string): Promise<string> {
  await verifyAliMailCredentials(email, password);
  return upsertMailboxConnection(userId, email, password);
}

export async function syncAliMail(userId: string, connectionId: string, options: {
  lookbackDays?: number;
  maxMessages?: number;
} = {}): Promise<{ runId: string; imported: number; skipped: number; discovered: number; candidates: number; learningFailed: number }> {
  const connection = await getMailboxConnection(userId, connectionId);
  if (!connection || connection.status === "disabled") throw new Error("Mailbox connection not found");
  const runId = await startMailboxSyncRun(userId, connectionId, kimiMailboxModel());
  try {
    const lookbackDays = Math.min(Math.max(options.lookbackDays ?? 365, 1), 3650);
    const maxMessages = Math.min(Math.max(options.maxMessages ?? 200, 1), 1000);
    const result = await readAliMailMessages({
      email: connection.email,
      password: connectionPassword(connection),
      cursors: await getMailboxCursors(userId, connectionId),
      since: new Date(Date.now() - lookbackDays * 86_400_000),
      maxMessages,
      onProgress: (progress) => updateMailboxSyncProgress({
        runId, userId, phase: progress.phase, folders: progress.folders,
        discovered: progress.discovered, processed: progress.processed,
        currentSubject: progress.currentSubject,
      }),
    });
    const persisted = await persistMailboxImport({
      runId, userId, connectionId,
      messages: result.messages, cursors: result.cursors,
      folders: result.folders, discovered: result.discovered,
    });
    let processed = 0;
    let learningFailed = 0;
    let candidates = 0;
    for (let offset = 0; offset < persisted.storedMessages.length; offset += 5) {
      const batch = persisted.storedMessages.slice(offset, offset + 5);
      await Promise.all(batch.map((stored) => markMailboxMessageAnalyzing(userId, stored.id)));
      await updateMailboxLearningProgress({
        runId, userId, processed, failed: learningFailed, candidates,
        currentSubject: batch[0].message.subject || `Email ${batch[0].message.uid}`,
      });
      try {
        const results = await learnMailboxMessagesWithKimi(batch.map((stored) => stored.message));
        for (const [index, stored] of batch.entries()) {
          candidates += await persistMailboxLearning({
            userId, messageId: stored.id, message: stored.message, learning: results[index],
          });
          processed += 1;
          await updateMailboxLearningProgress({ runId, userId, processed, failed: learningFailed, candidates });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Kimi mailbox learning failed";
        for (const stored of batch) {
          learningFailed += 1;
          processed += 1;
          await failMailboxMessageLearning(userId, stored.id, message);
          await updateMailboxLearningProgress({ runId, userId, processed, failed: learningFailed, candidates });
        }
      }
    }
    await completeMailboxSyncRun({ runId, userId, processed, failed: learningFailed, candidates });
    return {
      runId,
      imported: persisted.imported,
      skipped: persisted.skipped,
      discovered: result.discovered,
      candidates,
      learningFailed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mailbox sync failed";
    await failMailboxSyncRun(runId, userId, message).catch(() => undefined);
    throw error;
  }
}
