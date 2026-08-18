import type { ContactVerificationDecision } from "./types";

export type ContactSourceStatus = "Public" | "Verified" | "Pattern-guessed" | "Unknown" | "Invalid";

export interface ContactPublicationPlan {
  activeStatus: ContactSourceStatus;
  accepted: boolean;
  needsReview: boolean;
  invalidated: boolean;
}

export function planContactPublication(
  decision: ContactVerificationDecision,
  sourceStatus: ContactSourceStatus,
): ContactPublicationPlan {
  const invalidated = decision.lifecycleStatus === "Invalid";
  const accepted = !invalidated && (decision.category === "Official" || decision.category === "HighConfidence");
  return {
    activeStatus: invalidated ? "Invalid" : accepted ? "Verified" : sourceStatus,
    accepted,
    needsReview: invalidated || decision.category === "NeedsReview",
    invalidated,
  };
}
