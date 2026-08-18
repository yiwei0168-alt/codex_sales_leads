import { describe, expect, it } from "vitest";
import type { ImportedMailboxMessage } from "./alimail-imap";
import { mailboxThreadKey, screenMailboxMessage } from "./screening";

function message(overrides: Partial<ImportedMailboxMessage> = {}): ImportedMailboxMessage {
  return {
    folderPath: "INBOX", uidValidity: "1", uid: 1, direction: "inbound",
    sender: [{ address: "buyer@example.com" }], recipients: [{ address: "me@example.com" }],
    subject: "Project quotation for WR3000", bodyText: "Please share the CE certificate and product quotation for this customer project.",
    contentSha256: "hash", metadata: {}, ...overrides,
  };
}

describe("local mailbox screening", () => {
  it("recommends outbound product and certification mail", () => {
    const result = screenMailboxMessage({ message: message({ direction: "outbound", folderPath: "Sent" }), mailboxEmail: "me@example.com", productTerms: ["WR3000"] });
    expect(result.bucket).toBe("recommended");
    expect(result.score).toBeGreaterThanOrEqual(100);
    expect(result.reasons).toContain("你发出的邮件");
  });

  it("ignores bulk newsletter messages", () => {
    const result = screenMailboxMessage({ message: message({ subject: "Weekly newsletter", bodyText: "View in browser or unsubscribe", metadata: { precedence: "bulk" } }), mailboxEmail: "me@example.com" });
    expect(result.bucket).toBe("ignored");
    expect(result.reasons).toContain("自动通知或群发");
  });

  it("groups reply subjects into the same fallback thread", () => {
    expect(mailboxThreadKey(message({ subject: "Re: Product roadmap" })))
      .toBe(mailboxThreadKey(message({ subject: "Product roadmap" })));
  });

  it("does not match CE inside ordinary words", () => {
    const result = screenMailboxMessage({
      message: message({ subject: "Service price", bodyText: "Please confirm the service price." }),
      mailboxEmail: "me@example.com", productTerms: [],
    });
    expect(result.reasons.some((reason) => reason.startsWith("命中认证"))).toBe(false);
  });
});
