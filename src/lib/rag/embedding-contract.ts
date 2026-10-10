/** MODESEL-16: retain historical vectors, never generate new remote Qwen vectors. */
export const LOCAL_RETRIEVAL_PROFILE = "bge-m3-fulltext-facts-v1";
/** Generated research questions are long sentences; all-word AND would hide useful local sources. */
export function localKeywordQuery(question: string): string {
  const stopwords = new Set(["the", "and", "or", "for", "with", "from", "which", "what", "are", "in", "of", "to", "is", "a", "an"]);
  return [...new Set((question.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]+/gu) ?? [])
    .filter(word => !stopwords.has(word)))].slice(0, 64).map(word => `"${word}"`).join(" OR ");
}
export class RemoteEmbeddingRetiredError extends Error {
  constructor() { super("Remote Qwen embedding is retired; use local BGE, full-text and verified facts"); }
}
