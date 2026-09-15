import { correctionCompletion } from "./correction-completion";
import type { LeadWorkflowCandidate, LeadWorkflowState } from "./types";

export class WorkflowProcessingIncompleteError extends Error {
  constructor() {
    super("校正、评分或独立复核未完成；证据、已完成单项和费用已保留。可从检查点恢复；未知付费请求须先核验费用，不能自动重放。");
    this.name = "WorkflowProcessingIncompleteError";
  }
}

/** Uses checkpoint evidence; recovery never starts with discovery or evidence collection. */
export function processingRecoveryWork(state: Pick<LeadWorkflowState, "candidates" | "correctedCandidates" | "assessments">) {
  const candidates = new Map<string, LeadWorkflowCandidate>();
  for (const candidate of state.correctedCandidates) {
    if (correctionCompletion(candidate.correction) === "retry-required") candidates.set(candidate.candidateId, candidate);
  }
  for (const candidate of state.candidates) {
    if (!state.correctedCandidates.some(corrected => corrected.candidateId === candidate.candidateId
      || corrected.domain === candidate.domain || corrected.correction.originalDomain === candidate.domain)) {
      candidates.set(candidate.candidateId, candidate);
    }
  }
  return { candidates: [...candidates.values()],
    assessments: state.assessments.filter(assessment => assessment.scoringStatus === "completed") };
}
