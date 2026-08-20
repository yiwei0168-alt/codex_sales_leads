export type TargetMarketPresence =
  | "direct_german_entity"
  | "german_storefront"
  | "cross_border_sales"
  | "pan_europe_distribution"
  | "manufacturer_market_access"
  | "unclear";

export type CudyRelationshipEvidence = "confirmed_current" | "not_found" | "self_operated" | "unclear";

export type VerifiedContactClaim = {
  value: string;
  sourceUrl: string;
};

export type VerifiedNamedContactClaim = {
  name: string;
  role: string;
  sourceUrl: string;
};

export type CandidateVerification = {
  blindCandidateId: string;
  verifiedAt: string;
  companyExists: boolean | null;
  operatesInCountry: boolean | null;
  targetMarketPresence: TargetMarketPresence;
  channelRelevant: boolean | null;
  evidenceSufficient: boolean | null;
  cudyRelationshipEvidence: CudyRelationshipEvidence;
  independentEvidenceUrls: string[];
  verifiedNamedContactClaims: VerifiedNamedContactClaim[];
  verifiedPublicContactMethodClaims: VerifiedContactClaim[];
  unverifiedOrContradictedClaims: string[];
  notes: string[];
};

export function validateCandidateVerification(verification: CandidateVerification): void {
  if (!/^C-[A-F0-9]{12}$/.test(verification.blindCandidateId)) throw new Error("Invalid verification candidate ID");
  if (Number.isNaN(Date.parse(verification.verifiedAt))) throw new Error("Invalid verification date-time");
  if (verification.independentEvidenceUrls.length === 0) throw new Error("Independent verification evidence is required");
  for (const url of [
    ...verification.independentEvidenceUrls,
    ...verification.verifiedNamedContactClaims.map((claim) => claim.sourceUrl),
    ...verification.verifiedPublicContactMethodClaims.map((claim) => claim.sourceUrl),
  ]) {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error("Verification URL must be HTTP(S)");
  }
}
