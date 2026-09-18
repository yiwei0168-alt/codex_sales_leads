export type CandidateGateUnit = {
  unitType: string;
  unitIndex: number;
  humanReviewDecision?: "accept-candidate" | "decorative-no-body";
};

export type CandidateGateChunk = {
  unitType: string;
  unitIndex: number;
  evidenceStatus?: "parsed" | "candidate";
};

export function filterAcceptedCandidateChunks<T extends CandidateGateChunk>(
  units: CandidateGateUnit[],
  chunks: T[],
): T[] {
  const accepted = new Set(units
    .filter((unit) => unit.humanReviewDecision === "accept-candidate")
    .map((unit) => `${unit.unitType}:${unit.unitIndex}`));
  return chunks.filter((chunk) => chunk.evidenceStatus !== "candidate"
    || accepted.has(`${chunk.unitType}:${chunk.unitIndex}`));
}
