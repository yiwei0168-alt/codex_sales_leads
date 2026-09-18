import { describe, expect, it } from "vitest";
import { evaluateV3ReleaseGate, type V3ReleaseAssetGateInput } from "./release-v3";

function complete(overrides: Partial<V3ReleaseAssetGateInput> = {}): V3ReleaseAssetGateInput {
  return {
    assetId: "asset-1", sourceNature: "official-datasheet", processingStatus: "success",
    resolutionStatus: "accepted", expectedUnits: 4, actualUnits: 4, expectedChunks: 8, actualChunks: 8,
    qwenEmbeddings: 8, bgeEmbeddings: 8, ...overrides,
  };
}
const gold={goldReviewed:300,goldTotal:300,holdoutReviewed:50,holdoutTotal:50,holdoutUnlocked:true};

describe("v3 release completeness gate", () => {
  it("admits only a fully covered dual-embedding release", () => {
    expect(evaluateV3ReleaseGate({ registeredAssetIds: ["asset-1"], assets: [complete()], openReviewItems: 0,...gold }))
      .toEqual({ ready: true, reasons: [] });
  });

  it.each([
    ["missing asset", { registeredAssetIds: ["asset-1", "asset-2"], assets: [complete()], openReviewItems: 0,...gold }, "asset-not-in-manifest"],
    ["missing qwen", { registeredAssetIds: ["asset-1"], assets: [complete({ qwenEmbeddings: 7 })], openReviewItems: 0,...gold }, "qwen-incomplete"],
    ["missing bge", { registeredAssetIds: ["asset-1"], assets: [complete({ bgeEmbeddings: 7 })], openReviewItems: 0,...gold }, "bge-incomplete"],
    ["silent datasheet", { registeredAssetIds: ["asset-1"], assets: [complete({ expectedChunks: 0, actualChunks: 0, qwenEmbeddings: 0, bgeEmbeddings: 0 })], openReviewItems: 0,...gold }, "datasheet-without-chunks"],
    ["unreviewed failure", { registeredAssetIds: ["asset-1"], assets: [complete({ processingStatus: "failed", resolutionStatus: "pending" })], openReviewItems: 0,...gold }, "human-resolution-required"],
    ["open review", { registeredAssetIds: ["asset-1"], assets: [complete()], openReviewItems: 1,...gold }, "open-review-items"],
    ["gold incomplete", { registeredAssetIds: ["asset-1"], assets: [complete()], openReviewItems: 0,...gold,goldReviewed:299 }, "gold-review-incomplete"],
    ["holdout locked", { registeredAssetIds: ["asset-1"], assets: [complete()], openReviewItems: 0,...gold,holdoutUnlocked:false }, "holdout-locked"],
  ])("rejects %s", (_name, input, code) => {
    expect(evaluateV3ReleaseGate(input as Parameters<typeof evaluateV3ReleaseGate>[0]).reasons)
      .toContainEqual(expect.objectContaining({ code }));
  });
});
