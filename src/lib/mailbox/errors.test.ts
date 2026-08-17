import { describe, expect, it } from "vitest";
import { mailboxConnectionErrorMessage } from "./errors";

describe("mailboxConnectionErrorMessage", () => {
  it("explains authentication failures without exposing the executed command arguments", () => {
    const error = Object.assign(new Error("Command failed"), {
      executedCommand: "A1 LOGIN user@example.com super-secret",
      responseStatus: "NO",
      responseText: "LOGIN failed",
    });

    const message = mailboxConnectionErrorMessage(error);

    expect(message).toBe("阿里邮箱拒绝登录：LOGIN failed");
    expect(message).not.toContain("user@example.com");
    expect(message).not.toContain("super-secret");
  });

  it("reports the failed IMAP command and sanitized server response", () => {
    const error = Object.assign(new Error("Command failed"), {
      executedCommand: "A2 NAMESPACE",
      responseStatus: "BAD",
      responseText: " unsupported\r\ncommand ",
    });

    expect(mailboxConnectionErrorMessage(error)).toBe("阿里邮箱拒绝 IMAP 请求（命令 NAMESPACE / BAD）：unsupported command");
  });
});
