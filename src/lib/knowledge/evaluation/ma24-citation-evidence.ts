import { digest } from "../../assistant/main/contracts";
import { goldSourceIsPrecise, type GoldSourceCoordinate } from "../review-types";

export type Ma24EvidenceCall = {
  id: string; user_id: string; run_id: string; tool_id: string; effect: string;
  status: string; input: unknown; input_hash: string; output: unknown;
};

type Evidence = {
  callId: string; assetSha256: string; unitIndex: number; blockId?: string;
  row?: number; version?: string; content: string; sheet: boolean;
};
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const normalized = (value: string) => value.replace(/\s+/g, " ").trim();

function evidenceFromChunk(callId: string, chunk: unknown, vectorless: boolean): Evidence | null {
  const item = object(chunk);
  const metadata = vectorless ? item : object(item.metadata);
  const location = object(vectorless ? item.source_location : metadata.sourceLocation);
  const assetSha256 = vectorless ? item.source_sha256 : metadata.sourceSha256;
  const content = item.content;
  if (typeof assetSha256 !== "string" || !/^[0-9a-f]{64}$/.test(assetSha256) ||
    !Number.isSafeInteger(location.unitIndex) || (location.unitIndex as number) < 1 ||
    typeof content !== "string" || !content.trim()) return null;
  return { callId, assetSha256, unitIndex: location.unitIndex as number,
    ...(typeof location.blockId === "string" ? { blockId: location.blockId } : {}),
    ...(Number.isSafeInteger(location.row) ? { row: location.row as number } : {}),
    ...(typeof metadata.documentVersion === "string" ? { version: metadata.documentVersion } : {}),
    content, sheet: location.unitType === "sheet" };
}

function supportsCitation(evidence: Evidence, citation: GoldSourceCoordinate): boolean {
  if (evidence.assetSha256 !== citation.assetSha256 || evidence.unitIndex !== citation.unitIndex ||
    (citation.blockId !== undefined && evidence.blockId !== citation.blockId) ||
    (citation.version !== undefined && evidence.version !== citation.version)) return false;
  let sourceText = evidence.content;
  if (citation.row !== undefined) {
    if (evidence.sheet) {
      const rowPattern = new RegExp(`^[A-Z]{1,3}${citation.row}:\\s*`, "i");
      sourceText = evidence.content.split(/\r?\n/).filter(line => rowPattern.test(line)).join(" ");
    } else if (evidence.row !== citation.row) return false;
  }
  return normalized(sourceText).includes(normalized(citation.excerpt ?? ""));
}

/** Binds reviewer-entered coordinates to this run's saved source outputs, not to user-visible citation wording. */
export function assertMa24CitationEvidence(input: {
  userId: string; runId: string; citations: GoldSourceCoordinate[];
  receiptIds: string[]; calls: Ma24EvidenceCall[];
}) {
  const { userId, runId, citations, receiptIds, calls } = input;
  const evidence: Evidence[] = [];
  for (const call of calls) {
    const output = object(call.output);
    if (call.user_id !== userId || call.run_id !== runId || call.effect !== "read" ||
      call.status !== "completed" || call.input_hash !== digest(call.input) ||
      !["knowledge_search", "vectorless_read"].includes(call.tool_id) ||
      !["success", "partial"].includes(output.status as string) || output.callId !== call.id)
      throw new Error(`MA24 source receipt mismatch ${call.id}`);
    if (call.tool_id === "knowledge_search") {
      if (!Array.isArray(output.data)) throw new Error(`MA24 source output invalid ${call.id}`);
      evidence.push(...output.data.flatMap(chunk => {
        const found = evidenceFromChunk(call.id, chunk, false);
        return found ? [found] : [];
      }));
    } else {
      const data = object(output.data);
      if (data.status !== "ok") throw new Error(`MA24 source output invalid ${call.id}`);
      const found = evidenceFromChunk(call.id, data.evidence, true);
      if (found) evidence.push(found);
    }
  }
  const citationBindings = citations.map((citation, index) => {
    if (!goldSourceIsPrecise(citation)) throw new Error(`MA24 citation coordinate invalid ${index}`);
    const source = evidence.find(item => receiptIds.includes(item.callId) && supportsCitation(item, citation));
    if (!source) throw new Error(`MA24 citation lacks persisted source ${index}`);
    return { citationIndex: index, callId: source.callId };
  });
  return { citationBindings, evidenceCallIds: calls.map(call => call.id).sort() };
}
