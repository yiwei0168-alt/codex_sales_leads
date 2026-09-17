import { normalizeKnowledgeText } from "./query-normalizer";

export function selectEvidenceWindow(content: string, question: string, limit: number): string {
  if (content.length <= limit) return content;
  const normalizedQuestion = normalizeKnowledgeText(question);
  const terms = normalizedQuestion.split(/[^\p{L}\p{N}+.:-]+/u).filter((term) => term.length >= 3)
    .sort((a, b) => b.length - a.length);
  const normalizedContent = normalizeKnowledgeText(content);
  const match = terms.map((term) => normalizedContent.indexOf(term)).find((index) => index >= 0) ?? -1;
  if (match < 0) return `${content.slice(0, Math.floor(limit * 0.7))}\n…\n${content.slice(-(limit - Math.floor(limit * 0.7) - 3))}`;
  const start = Math.max(0, match - Math.floor(limit * 0.35));
  const end = Math.min(content.length, start + limit);
  return `${start > 0 ? "…\n" : ""}${content.slice(start, end)}${end < content.length ? "\n…" : ""}`;
}
