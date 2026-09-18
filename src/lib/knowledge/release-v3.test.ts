import { describe, expect, it } from "vitest";
import { evaluateV3ReleaseGate, type V3ReleaseAssetGateInput } from "./release-v3";

function complete(overrides: Partial<V3ReleaseAssetGateInput> = {}): V3ReleaseAssetGateInput {
  return {
    assetId: "asset-1", sourceNature: "official-datasheet", processingStatus: "success",
    resolutionStatus: "accepted", expectedUnits: 4, actualUnits: 4, expectedChunks: 8, actualChunks: 8,
    qwenEmbeddings: 8, bgeEmbeddings: 8, ...overrides,
  };
}
const reviewState={openDocumentReviewItems:0,quarantinedFactReviewItems:0,goldReviewed:300,goldTotal:300,holdoutReviewed:50,holdoutTotal:50,holdoutUnlocked:true};

describe("v3 release completeness gate", () => {
  it("admits only a fully covered dual-embedding release", () => {
    expect(evaluateV3ReleaseGate({ registeredAssetIds: ["asset-1"], assets: [complete()],...reviewState }))
      .toEqual({ ready: true, reasons: [] });
  });

  it.each([
    ["missing asset", { registeredAssetIds: ["asset-1", "asset-2"], assets: [complete()],...reviewState }, "asset-not-in-manifest"],
    ["missing qwen", { registeredAssetIds: ["asset-1"], assets: [complete({ qwenEmbeddings: 7 })],...reviewState }, "qwen-incomplete"],
    ["missing bge", { registeredAssetIds: ["asset-1"], assets: [complete({ bgeEmbeddings: 7 })],...reviewState }, "bge-incomplete"],
    ["silent datasheet", { registeredAssetIds: ["asset-1"], assets: [complete({ expectedChunks: 0, actualChunks: 0, qwenEmbeddings: 0, bgeEmbeddings: 0 })],...reviewState }, "datasheet-without-chunks"],
    ["unreviewed failure", { registeredAssetIds: ["asset-1"], assets: [complete({ processingStatus: "failed", resolutionStatus: "pending" })],...reviewState }, "human-resolution-required"],
    ["open document review", { registeredAssetIds: ["asset-1"], assets: [complete()],...reviewState,openDocumentReviewItems:1 }, "open-document-review-items"],
  ])("rejects %s", (_name, input, code) => {
    expect(evaluateV3ReleaseGate(input as Parameters<typeof evaluateV3ReleaseGate>[0]).reasons)
      .toContainEqual(expect.objectContaining({ code }));
  });

  it("allows incomplete gold and quarantined fact reviews without weakening document gates",()=>{
    expect(evaluateV3ReleaseGate({registeredAssetIds:["asset-1"],assets:[complete()],...reviewState,
      quarantinedFactReviewItems:1029,goldReviewed:11,holdoutReviewed:0,holdoutUnlocked:false})).toEqual({ready:true,reasons:[]});
  });
});
