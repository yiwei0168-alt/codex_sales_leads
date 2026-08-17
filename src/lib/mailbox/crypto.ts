import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

function credentialKey(): Buffer {
  const encoded = process.env.MAILBOX_CREDENTIAL_KEY?.trim();
  if (!encoded) throw new Error("MAILBOX_CREDENTIAL_KEY is not configured");
  const key = Buffer.from(encoded, "base64url");
  if (key.length !== 32) throw new Error("MAILBOX_CREDENTIAL_KEY must be a 32-byte base64url value");
  return key;
}

export function encryptMailboxCredential(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", credentialKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptMailboxCredential(sealed: string): string {
  const [version, ivText, tagText, encryptedText] = sealed.split(".");
  if (version !== VERSION || !ivText || !tagText || !encryptedText) throw new Error("Mailbox credential is malformed");
  const decipher = createDecipheriv("aes-256-gcm", credentialKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
}
