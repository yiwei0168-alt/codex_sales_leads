import { describe, expect, it } from "vitest";
import { evaluateV3ReleaseGate, type V3ReleaseAssetGateInput } from "./release-v3";

function complete(overrides: Partial<V3ReleaseAssetGateInput> = {}): V3ReleaseAssetGateInput {
  return {
    assetId: "asset-1", sourceNature: "official-datasheet", processingStatus: "success",
    resolutionStatus: "accepted", expectedUnits: 4, actualUnits: 4, expectedChunks: 8, actualChunks: 8,
    qwenEmbeddings: 8, bgeEmbeddings: 8, ...overrides,
  };
}

describe("v3 release completeness gate", () => {
  it("admits only a fully covered dual-embedding release", () => {
    expect(evaluateV3ReleaseGate({ registeredAssetIds: ["asset-1"], assets: [complete()], openReviewItems: 0 }))
      .toEqual({ ready: true, reasons: [] });
  });

  it.each([
    ["missing asset", { registeredAssetIds: ["asset-1", "asset-2"], assets: [complete()], openReviewItems: 0 }, "asset-not-in-manifest"],
    ["missing qwen", { registeredAssetIds: ["asset-1"], assets: [complete({ qwenEmbeddings: 7 })], openReviewItems: 0 }, "qwen-incomplete"],
    ["missing bge", { registeredAssetIds: ["asset-1"], assets: [complete({ bgeEmbeddings: 7 })], openReviewItems: 0 }, "bge-incomplete"],
    ["silent datasheet", { registeredAssetIds: ["asset-1"], assets: [complete({ expectedChunks: 0, actualChunks: 0, qwenEmbeddings: 0, bgeEmbeddings: 0 })], openReviewItems: 0 }, "datasheet-without-chunks"],
    ["unreviewed failure", { registeredAssetIds: ["asset-1"], assets: [complete({ processingStatus: "failed", resolutionStatus: "pending" })], openReviewItems: 0 }, "human-resolution-required"],
    ["open review", { registeredAssetIds: ["asset-1"], assets: [complete()], openReviewItems: 1 }, "open-review-items"],
  ])("rejects %s", (_name, input, code) => {
    expect(evaluateV3ReleaseGate(input as Parameters<typeof evaluateV3ReleaseGate>[0]).reasons)
      .toContainEqual(expect.objectContaining({ code }));
  });
});
