import { createHash } from "node:crypto";
import { stableJson, RAG_V3_RETRIEVAL_PROFILE, retrievalProfileSha256 } from "../review-types";
import { LOCAL_RETRIEVAL_PROFILE } from "@/lib/rag/embedding-contract";

export function diagnosticSnapshotHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function assertDiagnosticSnapshotUnchanged(before: string, after: string): void {
  if (before !== after) throw new Error("Retrieval diagnostic inputs changed during the run; discard mixed-version results");
}

/** A document-recall probe is never an answer/citation verdict or the full frozen v3 baseline. */
export function localRetrievalDiagnosticIdentity(includeBge: boolean) {
  const evaluatedProfile = {
    key: includeBge ? LOCAL_RETRIEVAL_PROFILE : "fulltext-facts-v1",
    lanes: includeBge ? ["facts", "fulltext", "bge"] : ["facts", "fulltext"],
    candidateLimitPerLane: RAG_V3_RETRIEVAL_PROFILE.candidateLimitPerLane,
    rrfK: RAG_V3_RETRIEVAL_PROFILE.rrfK,
    weights: { facts: 1.4, fulltext: 1, qwen: 0, bge: includeBge ? 1.1 : 0 },
    resultLimit: 8,
    bge: includeBge ? { model: "BAAI/bge-m3", dimensions: 1024,
      revision: "5617a9f61b028005a4858fdac845db406aefb181" } : null,
    queryPreparation: "modelTokensInQuery+buildControlledLexicalQuery",
  };
  return {
    receiptVersion: "local-document-recall-v2",
    scope: "document-candidate-recall-only",
    frozenReferenceProfile: { key: RAG_V3_RETRIEVAL_PROFILE.key, sha256: retrievalProfileSha256() },
    evaluatedProfile: { ...evaluatedProfile, sha256: diagnosticSnapshotHash(evaluatedProfile) },
    fullFrozenBaselineExecuted: false,
    answerQualityValidated: false,
    preciseCitationValidated: false,
    releaseGateSatisfied: false,
  } as const;
}
