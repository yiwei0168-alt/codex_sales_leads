import { createHash } from "node:crypto";

export type CandidateClass = "confirmed_current_cudy" | "qualified_tier1" | "important_downstream" | "invalid";
export type ReviewReason = "accepted" | "industry_mismatch" | "country_mismatch" | "insufficient_evidence" | "duplicate" | "not_a_company" | "not_independent_sales_lead";

export type NormalizedContact = {
  fullName: string | null;
  jobTitle: string | null;
  publicBusinessEmail: string | null;
  publicBusinessPhone: string | null;
  publicProfileUrl: string | null;
  evidenceUrls: string[];
  answerExcerpt: string;
};

export type NormalizedCandidate = {
  blindCandidateId: string;
  blindRunId: string;
  answerRank: number;
  companyName: string;
  legalName: string | null;
  domain: string | null;
  countryCode: string;
  claimedChannelClass: Exclude<CandidateClass, "invalid"> | "unclear";
  claimedCudyRelationship: "confirmed" | "not_confirmed" | "unclear";
  answerExcerpt: string;
  sourceUrls: string[];
  contacts: NormalizedContact[];
  codexPreVerification: {
    companyExists: boolean | null;
    operatesInCountry: boolean | null;
    channelRelevant: boolean | null;
    evidenceSufficient: boolean | null;
    notes: string[];
  };
};

export type HumanReviewDecision = {
  blindCandidateId: string;
  candidateClass: CandidateClass;
  reason: ReviewReason;
  companyExists: boolean;
  operatesInCountry: boolean;
  channelRelevant: boolean;
  evidenceSufficient: boolean;
  contactsVerified: number;
  publicContactMethodsVerified: number;
  duplicateOfBlindCandidateId: string | null;
  reviewerNotes: string | null;
  reviewedAt: string;
};

export function validateNormalizedCandidate(candidate: NormalizedCandidate): void {
  if (!/^C-[A-F0-9]{12}$/.test(candidate.blindCandidateId)) throw new Error("Invalid blind candidate ID");
  if (!/^R-[A-F0-9]{12}$/.test(candidate.blindRunId)) throw new Error("Invalid blind run ID");
  if (!Number.isInteger(candidate.answerRank) || candidate.answerRank < 1) throw new Error("Candidate answerRank must be a positive integer");
  if (!candidate.companyName.trim()) throw new Error("Candidate companyName is required");
  if (!/^[A-Z]{2}$/.test(candidate.countryCode)) throw new Error("Candidate countryCode must be ISO alpha-2");
  if (!candidate.answerExcerpt.trim()) throw new Error("Candidate must retain an answer excerpt");
  if (!Array.isArray(candidate.sourceUrls)) throw new Error("Candidate sourceUrls must be an array");
  for (const url of candidate.sourceUrls) {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error("Candidate source URL must be HTTP(S)");
  }
  for (const contact of candidate.contacts) {
    if (!contact.answerExcerpt.trim()) throw new Error("Contact must retain an answer excerpt");
    if (!contact.fullName && !contact.publicBusinessEmail && !contact.publicBusinessPhone && !contact.publicProfileUrl) {
      throw new Error("Contact must retain at least one public identifier or method");
    }
    if (contact.fullName !== null && !contact.fullName.trim()) throw new Error("Contact name cannot be blank");
    if (contact.publicBusinessEmail && !contact.publicBusinessEmail.includes("@")) throw new Error("Contact email is malformed");
  }
}

export function validateHumanDecision(decision: HumanReviewDecision): void {
  if (!/^C-[A-F0-9]{12}$/.test(decision.blindCandidateId)) throw new Error("Invalid reviewed candidate ID");
  if (decision.candidateClass === "invalid" && decision.reason === "accepted") throw new Error("Invalid candidate cannot have accepted reason");
  if (decision.candidateClass !== "invalid" && decision.reason !== "accepted") throw new Error("Accepted candidate must use accepted reason");
  if (decision.reason === "duplicate" && !decision.duplicateOfBlindCandidateId) throw new Error("Duplicate decision must reference the retained candidate");
  if (decision.reason !== "duplicate" && decision.duplicateOfBlindCandidateId) throw new Error("Only duplicate decisions may reference another candidate");
  if (!Number.isInteger(decision.contactsVerified) || decision.contactsVerified < 0) throw new Error("contactsVerified must be a non-negative integer");
  if (!Number.isInteger(decision.publicContactMethodsVerified) || decision.publicContactMethodsVerified < 0) throw new Error("publicContactMethodsVerified must be a non-negative integer");
  if (Number.isNaN(Date.parse(decision.reviewedAt))) throw new Error("reviewedAt must be an ISO date-time");
}

export function relevanceGrade(candidateClass: CandidateClass): number {
  if (candidateClass === "confirmed_current_cudy") return 3;
  if (candidateClass === "qualified_tier1") return 2;
  if (candidateClass === "important_downstream") return 1;
  return 0;
}

function validateCutoff(cutoff: number): void {
  if (!Number.isInteger(cutoff) || cutoff < 1) throw new Error("Metric cutoff must be a positive integer");
}

export function discountedCumulativeGain(grades: number[], cutoff: number): number {
  validateCutoff(cutoff);
  return grades.slice(0, cutoff).reduce((total, grade, index) => {
    if (!Number.isFinite(grade) || grade < 0) throw new Error("Relevance grades must be finite and non-negative");
    return total + (2 ** grade - 1) / Math.log2(index + 2);
  }, 0);
}

export function normalizedDiscountedCumulativeGain(
  grades: number[],
  idealPoolGrades: number[],
  cutoff: number,
): number {
  const ideal = discountedCumulativeGain([...idealPoolGrades].sort((a, b) => b - a), cutoff);
  return ideal === 0 ? 0 : discountedCumulativeGain(grades, cutoff) / ideal;
}

export function precisionAt(relevance: boolean[], cutoff: number): number {
  validateCutoff(cutoff);
  return relevance.slice(0, cutoff).filter(Boolean).length / cutoff;
}

export function validatedLeadsAt(grades: number[], cutoff: number): number {
  validateCutoff(cutoff);
  return grades.slice(0, cutoff).filter((grade) => grade > 0).length;
}

export function pooledRecall(retrievedCandidateIds: string[], acceptedPoolCandidateIds: string[]): number {
  const pool = new Set(acceptedPoolCandidateIds);
  if (pool.size === 0) return 0;
  const retrieved = new Set(retrievedCandidateIds.filter((id) => pool.has(id)));
  return retrieved.size / pool.size;
}

export function deterministicBlindId(prefix: "R" | "C", secretSalt: string, stableValue: string): string {
  const digest = createHash("sha256").update(`${secretSalt}:${stableValue}`).digest("hex").slice(0, 12).toUpperCase();
  return `${prefix}-${digest}`;
}

export function selectBlindedReReviewIds(
  decisions: HumanReviewDecision[],
  percent: number,
  seed: string,
): string[] {
  if (percent < 0 || percent > 100) throw new Error("Re-review percent must be between 0 and 100");
  const count = decisions.length === 0 || percent === 0 ? 0 : Math.max(1, Math.ceil(decisions.length * percent / 100));
  return [...decisions]
    .sort((left, right) => {
      const a = createHash("sha256").update(`${seed}:${left.blindCandidateId}`).digest("hex");
      const b = createHash("sha256").update(`${seed}:${right.blindCandidateId}`).digest("hex");
      return a.localeCompare(b);
    })
    .slice(0, count)
    .map((item) => item.blindCandidateId);
}
