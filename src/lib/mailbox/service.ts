import { readAliMailMessages, verifyAliMailCredentials } from "./alimail-imap";
import {
  connectionPassword, failMailboxSyncRun, getMailboxConnection, getMailboxCursors,
  persistMailboxSync, startMailboxSyncRun, upsertMailboxConnection,
} from "./repository";

export async function connectAliMail(userId: string, email: string, password: string): Promise<string> {
  await verifyAliMailCredentials(email, password);
  return upsertMailboxConnection(userId, email, password);
}

export async function syncAliMail(userId: string, connectionId: string, options: {
  lookbackDays?: number;
  maxMessages?: number;
} = {}): Promise<{ runId: string; imported: number; skipped: number; discovered: number }> {
  const connection = await getMailboxConnection(userId, connectionId);
  if (!connection || connection.status === "disabled") throw new Error("Mailbox connection not found");
  const runId = await startMailboxSyncRun(userId, connectionId);
  try {
    const lookbackDays = Math.min(Math.max(options.lookbackDays ?? 365, 1), 3650);
    const maxMessages = Math.min(Math.max(options.maxMessages ?? 200, 1), 1000);
    const result = await readAliMailMessages({
      email: connection.email,
      password: connectionPassword(connection),
      cursors: await getMailboxCursors(userId, connectionId),
      since: new Date(Date.now() - lookbackDays * 86_400_000),
      maxMessages,
    });
    const persisted = await persistMailboxSync({
      runId, userId, connectionId, mailboxEmail: connection.email,
      messages: result.messages, cursors: result.cursors,
      folders: result.folders, discovered: result.discovered,
    });
    return { runId, ...persisted, discovered: result.discovered };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mailbox sync failed";
    await failMailboxSyncRun(runId, userId, message).catch(() => undefined);
    throw error;
  }
}
