import { createHash } from "node:crypto";
import type { ImportedMailboxMessage } from "./alimail-imap";

export interface MailboxDisclosure {
  message: ImportedMailboxMessage;
  inputSha256: string;
  originalCharCount: number;
  disclosedCharCount: number;
  redactionCounts: Record<string, number>;
  blockedReasons: string[];
}

const HIGH_RISK_PATTERNS: Array<[string, RegExp]> = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i],
  ["credential", /(?:password|passwd|密码|口令|api[_ -]?key|access[_ -]?token|secret)\s*[:=：]\s*\S+/i],
];

const REDACTIONS: Array<[string, RegExp, string]> = [
  ["email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[邮箱已脱敏]"],
  ["url", /https?:\/\/[^\s<>()]+/gi, "[链接已脱敏]"],
  ["phone", /(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/g, "[手机号已脱敏]"],
  ["id-number", /(?<!\d)\d{17}[\dXx](?!\d)/g, "[证件号已脱敏]"],
  ["payment-card", /(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g, "[卡号已脱敏]"],
];

function removeQuotedHistory(value: string): string {
  const marker = /\n(?:-{2,}\s*Original Message\s*-{2,}|From:\s|发件人[:：]|在.+写道[:：])/i;
  const markerIndex = value.search(marker);
  const current = markerIndex >= 0 ? value.slice(0, markerIndex) : value;
  return current.split("\n").filter((line) => !/^\s*>/.test(line)).join("\n");
}

function redact(value: string, counts: Record<string, number>): string {
  let output = value.replace(/\u0000/g, "");
  for (const [name, pattern, replacement] of REDACTIONS) {
    output = output.replace(pattern, () => {
      counts[name] = (counts[name] ?? 0) + 1;
      return replacement;
    });
  }
  return output.trim();
}

export function prepareMailboxDisclosure(message: ImportedMailboxMessage): MailboxDisclosure {
  const original = `${message.subject}\n${message.bodyText}`;
  const blockedReasons = HIGH_RISK_PATTERNS.flatMap(([name, pattern]) => pattern.test(original) ? [name] : []);
  const redactionCounts: Record<string, number> = {};
  const subject = redact(message.subject, redactionCounts).slice(0, 500);
  const bodyText = redact(removeQuotedHistory(message.bodyText), redactionCounts).slice(0, 12_000);
  const disclosed = `${subject}\n${bodyText}`;
  return {
    message: { ...message, subject, bodyText, sender: [], recipients: [] },
    inputSha256: createHash("sha256").update(disclosed).digest("hex"),
    originalCharCount: original.length,
    disclosedCharCount: disclosed.length,
    redactionCounts,
    blockedReasons,
  };
}
