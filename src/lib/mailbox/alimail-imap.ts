import { ImapFlow, type FetchMessageObject, type ListResponse } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import { createHash } from "node:crypto";

export const ALIMAIL_IMAP_HOST = "imap.qiye.aliyun.com";
export const ALIMAIL_IMAP_PORT = 993;
const MAX_SOURCE_BYTES = 2_000_000;
const MAX_BODY_CHARACTERS = 200_000;

export interface MailboxCursor {
  folderPath: string;
  uidValidity: string;
  lastUid: number;
}

export interface ImportedMailboxMessage {
  folderPath: string;
  uidValidity: string;
  uid: number;
  internetMessageId?: string;
  direction: "inbound" | "outbound";
  sender: Array<{ name?: string; address: string }>;
  recipients: Array<{ name?: string; address: string }>;
  subject: string;
  sentAt?: string;
  bodyText: string;
  contentSha256: string;
  metadata: Record<string, unknown>;
}

function clientFor(email: string, password: string, verifyOnly = false): ImapFlow {
  return new ImapFlow({
    host: ALIMAIL_IMAP_HOST,
    port: ALIMAIL_IMAP_PORT,
    secure: true,
    auth: { user: email, pass: password },
    verifyOnly,
    includeMailboxes: verifyOnly,
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
    maxLiteralSize: MAX_SOURCE_BYTES,
    maxResponseSize: MAX_SOURCE_BYTES + 256_000,
  });
}

export async function verifyAliMailCredentials(email: string, password: string): Promise<void> {
  const client = clientFor(email, password, true);
  client.on("error", () => undefined);
  try {
    await client.connect();
  } finally {
    client.close();
  }
}

function addresses(value?: AddressObject | AddressObject[]): Array<{ name?: string; address: string }> {
  const objects = value ? (Array.isArray(value) ? value : [value]) : [];
  return objects.flatMap((item) => item.value ?? []).flatMap((item) => {
    const address = item.address?.trim().toLowerCase();
    return address ? [{ name: item.name?.trim() || undefined, address }] : [];
  });
}

function isSentFolder(folder: ListResponse): boolean {
  return folder.specialUse === "\\Sent" || /(^|\/)(sent|sent messages|已发送|发件箱)$/i.test(folder.path);
}

function selectedFolders(folders: ListResponse[]): ListResponse[] {
  const selected = folders.filter((folder) => folder.path.toUpperCase() === "INBOX" || isSentFolder(folder));
  return selected.length > 0 ? selected : [{ path: "INBOX" } as ListResponse];
}

async function parseMessage(message: FetchMessageObject, folder: ListResponse, uidValidity: string): Promise<ImportedMailboxMessage | null> {
  if (!message.source || message.source.length === 0) return null;
  const parsed = await simpleParser(message.source, {
    skipImageLinks: true,
    skipTextToHtml: true,
    maxHtmlLengthToParse: 500_000,
  });
  const bodyText = (parsed.text ?? "").replace(/\u0000/g, "").trim().slice(0, MAX_BODY_CHARACTERS);
  const sender = addresses(parsed.from);
  const recipients = [...addresses(parsed.to), ...addresses(parsed.cc), ...addresses(parsed.bcc)];
  return {
    folderPath: folder.path,
    uidValidity,
    uid: message.uid,
    internetMessageId: parsed.messageId || undefined,
    direction: isSentFolder(folder) ? "outbound" : "inbound",
    sender,
    recipients,
    subject: (parsed.subject ?? "").trim().slice(0, 2_000),
    sentAt: (parsed.date ?? (message.internalDate ? new Date(message.internalDate) : undefined))?.toISOString(),
    bodyText,
    contentSha256: createHash("sha256").update(bodyText).digest("hex"),
    metadata: {
      sourceSize: message.size ?? message.source.length,
      sourceTruncated: (message.size ?? 0) > message.source.length,
      attachmentsExcluded: true,
    },
  };
}

export async function readAliMailMessages(input: {
  email: string;
  password: string;
  cursors: Map<string, MailboxCursor>;
  since: Date;
  maxMessages: number;
}): Promise<{ messages: ImportedMailboxMessage[]; cursors: MailboxCursor[]; folders: number; discovered: number }> {
  const client = clientFor(input.email, input.password);
  client.on("error", () => undefined);
  const messages: ImportedMailboxMessage[] = [];
  const cursors: MailboxCursor[] = [];
  let discovered = 0;
  try {
    await client.connect();
    const folders = selectedFolders(await client.list());
    for (const folder of folders) {
      if (messages.length >= input.maxMessages) break;
      const lock = await client.getMailboxLock(folder.path, { readOnly: true, acquireTimeout: 15_000 });
      try {
        if (!client.mailbox) continue;
        const uidValidity = client.mailbox.uidValidity.toString();
        const previous = input.cursors.get(folder.path);
        const lastUid = previous?.uidValidity === uidValidity ? previous.lastUid : 0;
        const found = await client.search({ since: input.since, ...(lastUid > 0 ? { uid: `${lastUid + 1}:*` } : {}) }, { uid: true });
        const allUids = Array.isArray(found) ? found.filter((uid) => uid > lastUid).sort((a, b) => a - b) : [];
        discovered += allUids.length;
        const remaining = input.maxMessages - messages.length;
        const selected = lastUid === 0 ? allUids.slice(-remaining) : allUids.slice(0, remaining);
        let highestUid = lastUid;
        if (selected.length > 0) {
          for await (const message of client.fetch(selected, {
            uid: true,
            internalDate: true,
            size: true,
            source: { maxLength: MAX_SOURCE_BYTES },
          }, { uid: true })) {
            const parsed = await parseMessage(message, folder, uidValidity).catch(() => null);
            if (parsed) messages.push(parsed);
            highestUid = Math.max(highestUid, message.uid);
          }
        }
        cursors.push({ folderPath: folder.path, uidValidity, lastUid: highestUid });
      } finally {
        lock.release();
      }
    }
    return { messages, cursors, folders: cursors.length, discovered };
  } finally {
    try { await client.logout(); } catch { client.close(); }
  }
}
