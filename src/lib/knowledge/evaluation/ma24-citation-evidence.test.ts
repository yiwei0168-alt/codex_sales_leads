import { describe, expect, it } from "vitest";
import { digest } from "../../assistant/main/contracts";
import { assertMa24CitationEvidence, type Ma24EvidenceCall } from "./ma24-citation-evidence";

const userId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const callId = "33333333-3333-4333-8333-333333333333";
const assetSha256 = "a".repeat(64);
const input = { sessionId: "44444444-4444-4444-8444-444444444444", nodeId: "55555555-5555-4555-8555-555555555555" };
const vectorless: Ma24EvidenceCall = { id: callId, user_id: userId, run_id: runId,
  tool_id: "vectorless_read", effect: "read", status: "completed", input, input_hash: digest(input),
  output: { status: "success", callId, data: { status: "ok", evidence: {
    source_sha256: assetSha256, source_location: { unitType: "sheet", unitIndex: 3,
      blockId: "sheet-3-table" }, content: "A369: Other area\nA370: Highland\nB370: 73.2" } } } };
const citation = { assetSha256, unitIndex: 3, blockId: "sheet-3-table", row: 370,
  excerpt: "Highland" };
const check = (overrides: Partial<Parameters<typeof assertMa24CitationEvidence>[0]> = {}) =>
  assertMa24CitationEvidence({ userId, runId, calls: [vectorless], receiptIds: [callId],
    citations: [citation], ...overrides });

describe("MA24 persisted citation evidence", () => {
  it("binds spreadsheet citations to a saved original read and the cited row", () => {
    expect(check().citationBindings).toEqual([{ citationIndex: 0, callId }]);
    expect(() => check({ citations: [{ ...citation, row: 369 }] }))
      .toThrow("citation lacks persisted source");
    expect(() => check({ citations: [{ ...citation, excerpt: "Invented value" }] }))
      .toThrow("citation lacks persisted source");
    expect(() => check({ receiptIds: [] })).toThrow("citation lacks persisted source");
  });
  it("rejects other-account, changed or fabricated tool receipts", () => {
    expect(() => check({ calls: [{ ...vectorless, user_id: runId }] }))
      .toThrow("source receipt mismatch");
    expect(() => check({ calls: [{ ...vectorless, input_hash: "0".repeat(64) }] }))
      .toThrow("source receipt mismatch");
    expect(() => check({ calls: [{ ...vectorless, output: {
      ...vectorless.output as object, callId: runId } }] })).toThrow("source receipt mismatch");
    expect(() => check({ calls: [] })).toThrow("citation lacks persisted source");
  });
  it("accepts a persisted v3 search excerpt with a physical-page coordinate", () => {
    const searchId = "66666666-6666-4666-8666-666666666666";
    const searchInput = { query: "ZOD", limit: 8, collections: ["industry"] };
    const search: Ma24EvidenceCall = { id: searchId, user_id: userId, run_id: runId,
      tool_id: "knowledge_search", effect: "read", status: "completed",
      input: searchInput, input_hash: digest(searchInput), output: { status: "success",
        callId: searchId, data: [{ content: "The table reference was corrected in the later release.",
          metadata: { sourceSha256: assetSha256,
            sourceLocation: { unitType: "page", unitIndex: 49, blockId: "page-49-block-4" } } }] } };
    expect(check({ calls: [search], receiptIds: [searchId], citations: [{ assetSha256,
      unitIndex: 49, blockId: "page-49-block-4", excerpt: "table reference was corrected" }] })
      .citationBindings).toEqual([{ citationIndex: 0, callId: searchId }]);
    expect(() => check({ calls: [search], receiptIds: [searchId], citations: [{ assetSha256,
      unitIndex: 50, excerpt: "table reference was corrected" }] }))
      .toThrow("citation lacks persisted source");
  });
});
