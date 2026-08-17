import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const VERSION = "v1";

function credentialKey(): Buffer {
  const encoded = process.env.MAILBOX_CREDENTIAL_KEY?.trim();
  if (!encoded) throw new Error("MAILBOX_CREDENTIAL_KEY is not configured");
  const key = Buffer.from(encoded, "base64url");
  if (key.length !== 32) throw new Error("MAILBOX_CREDENTIAL_KEY must be a 32-byte base64url value");
  return key;
}

function contentKey(userId: string): Buffer {
  return Buffer.from(hkdfSync("sha256", credentialKey(), Buffer.from(userId, "utf8"), Buffer.from("mailbox-content:v1", "utf8"), 32));
}

function seal(value: string, key: Buffer, aad?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

function open(sealed: string, key: Buffer, aad?: string): string {
  const [version, ivText, tagText, encryptedText] = sealed.split(".");
  if (version !== VERSION || !ivText || !tagText || !encryptedText) throw new Error("Mailbox encrypted value is malformed");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
  if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
}

export function encryptMailboxCredential(value: string): string {
  return seal(value, credentialKey());
}

export function decryptMailboxCredential(sealed: string): string {
  return open(sealed, credentialKey());
}

export interface MailboxContentPayload {
  subject: string;
  bodyText: string;
  sender: unknown[];
  recipients: unknown[];
}

export function encryptMailboxContent(userId: string, value: MailboxContentPayload): string {
  return seal(JSON.stringify(value), contentKey(userId), `mailbox-content:v1:${userId}`);
}

export function decryptMailboxContent(userId: string, sealed: string): MailboxContentPayload {
  const parsed = JSON.parse(open(sealed, contentKey(userId), `mailbox-content:v1:${userId}`)) as MailboxContentPayload;
  if (!parsed || typeof parsed.subject !== "string" || typeof parsed.bodyText !== "string" || !Array.isArray(parsed.sender) || !Array.isArray(parsed.recipients)) {
    throw new Error("Mailbox content payload is malformed");
  }
  return parsed;
}
