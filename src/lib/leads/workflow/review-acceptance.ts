import type { LeadAssessmentReview } from "./types";

const COMPLETED_REVIEW_STATUSES = new Set<LeadAssessmentReview["status"]>([
  "not-required",
  "secondary-confirmed",
  "judge-resolved",
]);

export function hasCompletedAssessmentReview(review: LeadAssessmentReview | undefined): boolean {
  return Boolean(review && COMPLETED_REVIEW_STATUSES.has(review.status));
}
