import { createHash } from "node:crypto";
import type { ImportedMailboxMessage } from "./alimail-imap";

export type MailboxScreeningBucket = "recommended" | "review" | "ignored";

export interface MailboxScreeningResult {
  score: number;
  bucket: MailboxScreeningBucket;
  reasons: string[];
  threadKey: string;
}

const CERTIFICATION_TERMS = [
  "ce", "fcc", "rohs", "reach compliance", "reach certificate", "reach report", "reach regulation",
  "ul", "etl", "iso", "iec", "en 301", "en 55032",
  "anatel", "icasa", "nom", "subtel", "certification", "certificate", "compliance",
  "认证", "证书", "合规", "测试报告", "型式认证", "准入",
];
const BUSINESS_TERMS = [
  "quotation", "quote", "price", "sample", "project", "lead time", "moq", "forecast",
  "datasheet", "specification", "distributor", "customer", "purchase order", "invoice",
  "报价", "价格", "样品", "项目", "交期", "规格", "参数", "客户", "经销商", "订单",
];
const BULK_TERMS = [
  "unsubscribe", "newsletter", "marketing preferences", "view in browser", "mailing list",
  "取消订阅", "退订", "电子报", "营销邮件",
];
const SHORT_REPLY = /^(?:hi|hello|dear|thanks?|thank you|ok|okay|noted|received|regards|谢谢|好的|收到|知悉)[\s,.!，。！]*$/i;

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizedSubject(subject: string): string {
  return normalize(subject)
    .replace(/^(?:(?:re|fw|fwd|答复|回复|转发)\s*[:：]\s*)+/i, "")
    .slice(0, 500);
}

function metadataStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(metadataStrings);
  return [];
}

function containsTerm(text: string, terms: string[]): string | undefined {
  return terms.find((rawTerm) => {
    const term = normalize(rawTerm);
    if (!term) return false;
    if (/[^\x00-\x7f]/.test(term)) return text.includes(term);
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(text);
  });
}

export function mailboxThreadKey(message: ImportedMailboxMessage): string {
  const references = metadataStrings(message.metadata.references);
  const inReplyTo = metadataStrings(message.metadata.inReplyTo);
  const seed = references[0] || inReplyTo[0] || normalizedSubject(message.subject) || message.internetMessageId || `${message.folderPath}:${message.uid}`;
  return createHash("sha256").update(normalize(seed)).digest("hex");
}

export function screenMailboxMessage(input: {
  message: ImportedMailboxMessage;
  mailboxEmail: string;
  productTerms?: string[];
}): MailboxScreeningResult {
  const { message } = input;
  const reasons: string[] = [];
  const text = normalize(`${message.subject}\n${message.bodyText}`);
  const metadata = message.metadata;
  let score = 0;

  if (message.direction === "outbound") {
    score += 60;
    reasons.push("你发出的邮件");
  }

  const replyEvidence = metadataStrings(metadata.inReplyTo).length > 0
    || metadataStrings(metadata.references).length > 0
    || /^(?:re|答复|回复)\s*[:：]/i.test(message.subject.trim());
  if (replyEvidence) {
    score += message.direction === "outbound" ? 10 : 25;
    reasons.push("互动邮件流");
  }

  const mailbox = normalize(input.mailboxEmail);
  if (message.direction === "inbound" && message.recipients.some((item) => normalize(item.address) === mailbox)) {
    score += 20;
    reasons.push("直接发送给你");
  }

  const productTerms = (input.productTerms ?? []).map(normalize).filter((term) => term.length >= 2);
  const product = containsTerm(text, productTerms);
  if (product) {
    score += 30;
    reasons.push(`命中产品：${product.slice(0, 80)}`);
  }

  const certification = containsTerm(text, CERTIFICATION_TERMS);
  if (certification) {
    score += 30;
    reasons.push(`命中认证：${certification}`);
  }

  const business = containsTerm(text, BUSINESS_TERMS);
  if (business) {
    score += 15;
    reasons.push(`业务信号：${business}`);
  }

  const automated = metadata.autoSubmitted === true || metadata.precedence === "bulk" || Boolean(metadata.listId)
    || message.sender.some((item) => /(?:^|[._-])no-?reply(?:@|[._-])/i.test(item.address))
    || Boolean(containsTerm(text, BULK_TERMS));
  if (automated) {
    score -= 60;
    reasons.push("自动通知或群发");
  }

  const currentBody = message.bodyText.replace(/^>.*$/gm, "").trim();
  if (currentBody.length < 40 || SHORT_REPLY.test(currentBody)) {
    score -= 30;
    reasons.push("内容过短");
  }

  const boundedScore = Math.max(-200, Math.min(200, score));
  const bucket: MailboxScreeningBucket = boundedScore >= 60 ? "recommended" : boundedScore >= 35 ? "review" : "ignored";
  return { score: boundedScore, bucket, reasons, threadKey: mailboxThreadKey(message) };
}
