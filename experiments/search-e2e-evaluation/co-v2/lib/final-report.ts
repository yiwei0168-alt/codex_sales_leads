import type { ExperimentCostEvent } from "./cost-ledger";
import type { FrozenCellBundle } from "./unified-evaluation";

interface ProviderContribution {
  provider: string;
  calls: number;
  rawResults: number;
  normalizedCompanies: number;
  newUniqueCompanies: number;
  duplicateHits: number;
  paidSearchCredits: number;
  downstreamFinalCredit: number;
  costUsd: number;
}

function fixed(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "n/a";
}

export function calculateProviderContributions(bundles: FrozenCellBundle[], costs: ExperimentCostEvent[]): ProviderContribution[] {
  const rows = new Map<string, ProviderContribution>();
  const get = (provider: string) => {
    const existing = rows.get(provider);
    if (existing) return existing;
    const created = { provider, calls: 0, rawResults: 0, normalizedCompanies: 0, newUniqueCompanies: 0,
      duplicateHits: 0, paidSearchCredits: 0, downstreamFinalCredit: 0, costUsd: 0 };
    rows.set(provider, created);
    return created;
  };
  for (const { product } of bundles) {
    for (const call of product.discoveryCalls) {
      const row = get(call.route.provider);
      row.calls += call.requestCount;
      row.rawResults += call.rawResults;
      row.normalizedCompanies += call.normalizedCompanies;
      row.newUniqueCompanies += call.newUniqueCompanies;
      row.duplicateHits += call.existingCompanyHits;
      row.paidSearchCredits += call.paidSearchCredits;
    }
    const legacyCorrected = Array.isArray(product.raw.corrected) ? product.raw.corrected as Array<{
      candidateId: string; discoveryOccurrences?: Array<{ provider: string }> }> : [];
    const corrected = product.attributionCandidates ?? legacyCorrected;
    const correctedById = new Map(corrected.map((candidate) => [candidate.candidateId, candidate]));
    for (const finalCandidate of product.finalCandidates) {
      const candidate = correctedById.get(finalCandidate.candidateId);
      if (!candidate) throw new Error(`Missing provider attribution for final candidate ${finalCandidate.candidateId}`);
      const providers = [...new Set((candidate.discoveryOccurrences ?? []).map((item) => item.provider)
        .filter((provider) => provider.trim().length > 0))];
      if (providers.length === 0) throw new Error(`Empty provider attribution for final candidate ${finalCandidate.candidateId}`);
      for (const provider of providers) get(provider).downstreamFinalCredit += 1 / Math.max(1, providers.length);
    }
  }
  for (const cost of costs.filter((item) => item.stage === "hybrid-discovery")) {
    get(cost.provider).costUsd += cost.budgetCostUsd ?? 0;
  }
  return [...rows.values()].sort((a, b) => b.downstreamFinalCredit - a.downstreamFinalCredit
    || b.newUniqueCompanies - a.newUniqueCompanies || a.provider.localeCompare(b.provider));
}

export function optimizationFindings(contributions: ProviderContribution[]): string[] {
  const findings: string[] = [];
  for (const item of contributions) {
    const duplicateRate = item.normalizedCompanies > 0 ? item.duplicateHits / item.normalizedCompanies : 0;
    const downstreamRate = item.newUniqueCompanies > 0 ? item.downstreamFinalCredit / item.newUniqueCompanies : 0;
    if (item.newUniqueCompanies > 0 && downstreamRate < 0.05) {
      findings.push(`${item.provider}: only ${fixed(downstreamRate * 100, 1)}% of newly unique output received fractional Top-50 credit; review category-specific activation before removing it.`);
    }
    if (duplicateRate > 0.5) {
      findings.push(`${item.provider}: duplicate/normalized ratio was ${fixed(duplicateRate * 100, 1)}%; tighten real-time stopping or start this route after cheaper core routes.`);
    }
    if (item.calls > 0 && item.newUniqueCompanies === 0) {
      findings.push(`${item.provider}: produced no new unique company in this run; keep disabled by default for the affected category unless it supplies a distinct capability.`);
    }
  }
  if (findings.length === 0) findings.push("No provider crossed the frozen low-utilization heuristics; retain the current route until more markets accumulate.");
  findings.push("Do not optimize from Top-N alone in production; use accumulated unique yield, final downstream use, quality and cost by market/category.");
  findings.push("Any route change remains a future versioned product decision and does not alter this frozen experiment.");
  return findings;
}
