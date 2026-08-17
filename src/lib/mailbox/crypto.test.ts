import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { decryptMailboxContent, decryptMailboxCredential, encryptMailboxContent, encryptMailboxCredential } from "./crypto";

const previousKey = process.env.MAILBOX_CREDENTIAL_KEY;

afterEach(() => {
  if (previousKey === undefined) delete process.env.MAILBOX_CREDENTIAL_KEY;
  else process.env.MAILBOX_CREDENTIAL_KEY = previousKey;
});

describe("mailbox credential encryption", () => {
  it("round-trips a credential with authenticated encryption", () => {
    process.env.MAILBOX_CREDENTIAL_KEY = randomBytes(32).toString("base64url");
    const sealed = encryptMailboxCredential("third-party-security-password");
    expect(sealed).not.toContain("third-party-security-password");
    expect(decryptMailboxCredential(sealed)).toBe("third-party-security-password");
  });

  it("rejects tampered ciphertext", () => {
    process.env.MAILBOX_CREDENTIAL_KEY = randomBytes(32).toString("base64url");
    const sealed = encryptMailboxCredential("secret");
    expect(() => decryptMailboxCredential(`${sealed.slice(0, -1)}A`)).toThrow();
  });

  it("derives isolated authenticated content keys per user", () => {
    process.env.MAILBOX_CREDENTIAL_KEY = randomBytes(32).toString("base64url");
    const sealed = encryptMailboxContent("user-a", { subject: "Private", bodyText: "Policy", sender: [], recipients: [] });
    expect(sealed).not.toContain("Private");
    expect(decryptMailboxContent("user-a", sealed).bodyText).toBe("Policy");
    expect(() => decryptMailboxContent("user-b", sealed)).toThrow();
  });
});
