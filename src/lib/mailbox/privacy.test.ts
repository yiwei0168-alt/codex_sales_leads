import { describe, expect, it } from "vitest";
import type { ImportedMailboxMessage } from "./alimail-imap";
import { prepareMailboxDisclosure } from "./privacy";

function message(bodyText: string): ImportedMailboxMessage {
  return {
    folderPath: "INBOX", uidValidity: "1", uid: 1, direction: "inbound",
    sender: [{ address: "buyer@example.com" }], recipients: [{ address: "sales@example.cn" }],
    subject: "Contact buyer@example.com", bodyText, contentSha256: "hash", metadata: {},
  };
}

describe("prepareMailboxDisclosure", () => {
  it("removes identities, links and quoted history before disclosure", () => {
    const result = prepareMailboxDisclosure(message("Call 13800138000 or visit https://example.com\n> old private thread"));
    expect(result.message.sender).toEqual([]);
    expect(result.message.recipients).toEqual([]);
    expect(result.message.subject).not.toContain("buyer@example.com");
    expect(result.message.bodyText).not.toContain("13800138000");
    expect(result.message.bodyText).not.toContain("https://example.com");
    expect(result.message.bodyText).not.toContain("old private thread");
    expect(result.redactionCounts).toMatchObject({ email: 1, phone: 1, url: 1 });
  });

  it("blocks credentials instead of disclosing them", () => {
    const result = prepareMailboxDisclosure(message("API key: super-secret-value"));
    expect(result.blockedReasons).toContain("credential");
  });
});
