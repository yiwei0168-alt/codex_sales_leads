export interface AttributionDiscoveryCall {
  route: { provider: string };
  requestCount: number;
  rawResults: number;
  normalizedCompanies: number;
  newUniqueCompanies: number;
  existingCompanyHits: number;
  paidSearchCredits: number;
}

export interface AttributionCandidate {
  candidateId: string;
  discoveryOccurrences?: Array<{ provider: string }>;
}

export interface AttributionProduct {
  discoveryCalls: AttributionDiscoveryCall[];
  finalCandidates: Array<{ candidateId: string }>;
  correctedCandidates: AttributionCandidate[];
  discoveryCostByProvider: Record<string, number>;
}

export interface AuditedProviderContribution {
  provider: string;
  requests: number;
  rawResults: number;
  normalizedCompanies: number;
  newUniqueCompanies: number;
  duplicateHits: number;
  paidSearchCredits: number;
  fractionalFinalCredit: number;
  productiveDiscoveryCostUsd: number;
}

export function calculateAuditedProviderContributions(products: AttributionProduct[]): AuditedProviderContribution[] {
  const rows = new Map<string, AuditedProviderContribution>();
  const get = (provider: string) => {
    const existing = rows.get(provider);
    if (existing) return existing;
    const created: AuditedProviderContribution = { provider, requests: 0, rawResults: 0,
      normalizedCompanies: 0, newUniqueCompanies: 0, duplicateHits: 0, paidSearchCredits: 0,
      fractionalFinalCredit: 0, productiveDiscoveryCostUsd: 0 };
    rows.set(provider, created);
    return created;
  };

  for (const product of products) {
    for (const call of product.discoveryCalls) {
      const row = get(call.route.provider);
      row.requests += call.requestCount;
      row.rawResults += call.rawResults;
      row.normalizedCompanies += call.normalizedCompanies;
      row.newUniqueCompanies += call.newUniqueCompanies;
      row.duplicateHits += call.existingCompanyHits;
      row.paidSearchCredits += call.paidSearchCredits;
    }
    for (const [provider, cost] of Object.entries(product.discoveryCostByProvider)) {
      get(provider).productiveDiscoveryCostUsd += cost;
    }
    const correctedById = new Map(product.correctedCandidates.map((candidate) => [candidate.candidateId, candidate]));
    for (const finalCandidate of product.finalCandidates) {
      const corrected = correctedById.get(finalCandidate.candidateId);
      if (!corrected) throw new Error(`Missing corrected provenance for final candidate ${finalCandidate.candidateId}`);
      const providers = [...new Set((corrected.discoveryOccurrences ?? []).map((item) => item.provider)
        .filter((provider) => provider.trim().length > 0))];
      if (providers.length === 0) throw new Error(`Missing provider provenance for final candidate ${finalCandidate.candidateId}`);
      for (const provider of providers) get(provider).fractionalFinalCredit += 1 / providers.length;
    }
  }
  return [...rows.values()].sort((left, right) => right.fractionalFinalCredit - left.fractionalFinalCredit
    || right.newUniqueCompanies - left.newUniqueCompanies || left.provider.localeCompare(right.provider));
}

export interface BlindAuditMapping {
  packetId: string;
  cellId: string;
  unifiedPrimaryRole: string;
  unifiedScore: number;
  unifiedQualified: boolean;
}

export interface BlindAuditDecision {
  packetId: string;
  output: { primaryRole: string; totalScore: number; eligibility: string };
}

const roleFamily = (role: string): string => {
  if (["Distributor", "VAD"].includes(role)) return "distribution";
  if (["Reseller", "VAR", "Dealer"].includes(role)) return "resale";
  if (["Retailer", "E-tailer"].includes(role)) return "retail";
  if (["SI", "MSP", "Installer"].includes(role)) return "services";
  return role;
};

export function summarizeBlindAuditByCell(mappings: BlindAuditMapping[], decisions: BlindAuditDecision[]) {
  const decisionById = new Map(decisions.map((decision) => [decision.packetId, decision.output]));
  const rows = new Map<string, { cellId: string; sampleSize: number; exactRoleMatches: number;
    roleFamilyMatches: number; qualifiedMatches: number; absoluteError: number; signedError: number }>();
  for (const mapping of mappings) {
    const decision = decisionById.get(mapping.packetId);
    if (!decision) throw new Error(`Missing blind decision ${mapping.packetId}`);
    const row = rows.get(mapping.cellId) ?? { cellId: mapping.cellId, sampleSize: 0, exactRoleMatches: 0,
      roleFamilyMatches: 0, qualifiedMatches: 0, absoluteError: 0, signedError: 0 };
    const error = decision.totalScore - mapping.unifiedScore;
    row.sampleSize += 1;
    row.exactRoleMatches += Number(decision.primaryRole === mapping.unifiedPrimaryRole);
    row.roleFamilyMatches += Number(roleFamily(decision.primaryRole) === roleFamily(mapping.unifiedPrimaryRole));
    row.qualifiedMatches += Number((decision.eligibility === "eligible") === mapping.unifiedQualified);
    row.absoluteError += Math.abs(error);
    row.signedError += error;
    rows.set(mapping.cellId, row);
  }
  return [...rows.values()].map((row) => ({ cellId: row.cellId, sampleSize: row.sampleSize,
    exactRoleAgreement: row.exactRoleMatches / row.sampleSize,
    roleFamilyAgreement: row.roleFamilyMatches / row.sampleSize,
    qualifiedStatusAgreement: row.qualifiedMatches / row.sampleSize,
    meanAbsoluteError: row.absoluteError / row.sampleSize,
    meanBias: row.signedError / row.sampleSize }));
}
