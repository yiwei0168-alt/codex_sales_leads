import type { LeadAssessmentReview } from "./types";

const COMPLETED_REVIEW_STATUSES = new Set<LeadAssessmentReview["status"]>([
  "not-required",
  "secondary-confirmed",
  "judge-resolved",
]);

export function hasCompletedAssessmentReview(review: LeadAssessmentReview | undefined): boolean {
  if (review?.status === "owner-evidence-resolved") return Boolean(review.ownerEvidence
    && /^[0-9a-f-]{36}$/i.test(review.ownerEvidence.answerId)
    && /^[a-f0-9]{64}$/.test(review.ownerEvidence.questionHash)
    && Number.isFinite(Date.parse(review.ownerEvidence.receivedAt))
    && review.ownerEvidence.scope === "current-cudy-relationship"
    && review.ownerEvidence.originalDecision === "targeted-research");
  return Boolean(review && COMPLETED_REVIEW_STATUSES.has(review.status));
}
