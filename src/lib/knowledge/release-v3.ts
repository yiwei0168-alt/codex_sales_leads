export type V3ProcessingStatus = "pending" | "success" | "blank" | "review-required" | "failed";

export interface V3ReleaseAssetGateInput {
  assetId: string;
  sourceNature: string;
  processingStatus: V3ProcessingStatus;
  resolutionStatus: "pending" | "accepted" | "replace-source";
  humanDecisionAt?: string;
  expectedUnits: number;
  actualUnits: number;
  expectedChunks: number;
  actualChunks: number;
  qwenEmbeddings: number;
  bgeEmbeddings: number;
}

export interface V3ReleaseGateResult {
  ready: boolean;
  reasons: Array<{ assetId?: string; code: string }>;
}

export function evaluateV3ReleaseGate(input: {
  registeredAssetIds: string[];
  assets: V3ReleaseAssetGateInput[];
  openReviewItems: number;
  goldReviewed: number;
  goldTotal: number;
  holdoutReviewed: number;
  holdoutTotal: number;
  holdoutUnlocked: boolean;
}): V3ReleaseGateResult {
  const reasons: V3ReleaseGateResult["reasons"] = [];
  const byAsset = new Map(input.assets.map((asset) => [asset.assetId, asset]));
  for (const assetId of input.registeredAssetIds) {
    if (!byAsset.has(assetId)) reasons.push({ assetId, code: "asset-not-in-manifest" });
  }
  for (const asset of input.assets) {
    if (asset.processingStatus === "pending") reasons.push({ assetId: asset.assetId, code: "asset-pending" });
    if (asset.expectedUnits !== asset.actualUnits) reasons.push({ assetId: asset.assetId, code: "unit-count-mismatch" });
    if (asset.expectedChunks !== asset.actualChunks) reasons.push({ assetId: asset.assetId, code: "chunk-count-mismatch" });
    if (asset.qwenEmbeddings !== asset.actualChunks) reasons.push({ assetId: asset.assetId, code: "qwen-incomplete" });
    if (asset.bgeEmbeddings !== asset.actualChunks) reasons.push({ assetId: asset.assetId, code: "bge-incomplete" });
    if (/datasheet/i.test(asset.sourceNature) && asset.processingStatus === "success" && asset.actualChunks === 0) {
      reasons.push({ assetId: asset.assetId, code: "datasheet-without-chunks" });
    }
    if (["blank", "review-required", "failed"].includes(asset.processingStatus)
      && (asset.resolutionStatus === "pending" || !asset.humanDecisionAt)) {
      reasons.push({ assetId: asset.assetId, code: "human-resolution-required" });
    }
  }
  if (input.openReviewItems > 0) reasons.push({ code: "open-review-items" });
  if (input.goldReviewed !== input.goldTotal) reasons.push({ code: "gold-review-incomplete" });
  if (!input.holdoutUnlocked) reasons.push({ code: "holdout-locked" });
  if (input.holdoutReviewed !== input.holdoutTotal) reasons.push({ code: "holdout-review-incomplete" });
  return { ready: reasons.length === 0, reasons };
}
