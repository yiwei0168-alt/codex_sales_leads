import { summarizeCostEvents, type ExperimentCostEvent } from "./cost-ledger";
import type { ExperimentMetricReport } from "./evaluation-metrics";
import type { BlindAuditMetrics } from "./blind-audit";
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
    const corrected = product.raw.corrected as { candidates?: Array<{ candidateId: string;
      discoveryOccurrences?: Array<{ provider: string }> }> } | null;
    const finalIds = new Set(product.finalCandidates.map((candidate) => candidate.candidateId));
    for (const candidate of corrected?.candidates ?? []) {
      if (!finalIds.has(candidate.candidateId)) continue;
      const providers = [...new Set((candidate.discoveryOccurrences ?? []).map((item) => item.provider))];
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
      findings.push(`${item.provider}: only ${fixed(downstreamRate * 100, 1)}% of newly unique output received fractional Top-30 credit; review category-specific activation before removing it.`);
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

export function renderFinalReport(options: { metrics: ExperimentMetricReport; blind: BlindAuditMetrics;
  bundles: FrozenCellBundle[]; costs: ExperimentCostEvent[]; generatedAt: string }): string {
  const { metrics, blind, bundles, costs, generatedAt } = options;
  const cost = summarizeCostEvents(costs);
  const contributions = calculateProviderContributions(bundles, costs);
  const totalFinal = bundles.reduce((sum, bundle) => sum + bundle.control.finalCandidates.length
    + bundle.product.finalCandidates.length, 0);
  const totalValid = metrics.byCell.reduce((sum, cell) => sum + cell.arms["gemini-native"].validCount
    + cell.arms["product-e2e"].validCount, 0);
  const totalQualified = metrics.byCell.reduce((sum, cell) => sum + cell.arms["gemini-native"].qualifiedCount
    + cell.arms["product-e2e"].qualifiedCount, 0);
  const totalHigh = metrics.byCell.reduce((sum, cell) => sum + cell.arms["gemini-native"].highValueCount
    + cell.arms["product-e2e"].highValueCount, 0);
  const geminiWallClockMs = bundles.reduce((sum, bundle) => sum + bundle.control.wallClockMs, 0);
  const productWallClockMs = bundles.reduce((sum, bundle) => sum + bundle.product.wallClockMs, 0);
  const conclusion = metrics.passed ? "Product E2E passed every preregistered win gate."
    : blind.passed ? "Product E2E did not pass every preregistered win gate."
      : "Quality conclusion is inconclusive because the independent blind-audit gate failed after the frozen sample rule.";
  const cellRows = metrics.byCell.map((cell) => `| ${cell.cellId} | ${fixed(cell.arms["gemini-native"].cellUtility)} | ${fixed(cell.arms["product-e2e"].cellUtility)} | ${fixed(cell.delta)} | ${cell.arms["gemini-native"].validCount} | ${cell.arms["product-e2e"].validCount} |`).join("\n");
  const gateRows = Object.entries(metrics.gates).map(([name, gate]) => `| ${name} | ${String(gate.actual)} | ${String(gate.threshold)} | ${gate.passed ? "PASS" : "FAIL"} |`).join("\n");
  const providerRows = contributions.map((item) => `| ${item.provider} | ${item.calls} | ${item.rawResults} | ${item.newUniqueCompanies} | ${item.duplicateHits} | ${fixed(item.downstreamFinalCredit)} | ${fixed(item.paidSearchCredits)} | $${fixed(item.costUsd, 4)} |`).join("\n");
  const findings = optimizationFindings(contributions).map((item) => `- ${item}`).join("\n");
  return `# Cudy UK/Mexico end-to-end search evaluation v1.0.9\n\nGenerated: ${generatedAt}\n\n## Outcome\n\n${conclusion}\n\nMacro Slot Utility@30 was ${fixed(metrics.macroUtility["gemini-native"])} for Gemini and ${fixed(metrics.macroUtility["product-e2e"])} for Product E2E, a delta of ${fixed(metrics.macroDelta)}. Product won ${metrics.cellsWonByProduct}/8 cells. The stratified 10,000-iteration bootstrap 95% interval was [${fixed(metrics.bootstrap.lower95)}, ${fixed(metrics.bootstrap.upper95)}]. Runtime is not a win gate: summed cell wall time was ${fixed(geminiWallClockMs / 60_000, 2)} minutes for Gemini and ${fixed(productWallClockMs / 60_000, 2)} minutes for Product.\n\n## Cell results\n\n| Cell | Gemini utility | Product utility | Delta | Gemini valid | Product valid |\n|---|---:|---:|---:|---:|---:|\n${cellRows}\n\n## Frozen win gates\n\n| Gate | Actual | Threshold | Result |\n|---|---:|---:|---|\n${gateRows}\n\nMarket deltas: GB ${fixed(metrics.marketDelta.GB)}, MX ${fixed(metrics.marketDelta.MX)}. Unique 75+ companies: Gemini ${metrics.uniqueHighValue["gemini-native"]}, Product ${metrics.uniqueHighValue["product-e2e"]}.\n\n## Blind-audit calibration\n\nSample ${blind.sampleSize}; primary-role agreement ${fixed(blind.primaryRoleAgreement * 100, 1)}%; qualified-status agreement ${fixed(blind.qualifiedStatusAgreement * 100, 1)}%; Spearman ${fixed(blind.spearman, 3)}; mean bias ${fixed(blind.meanBias)}; MAE ${fixed(blind.meanAbsoluteError)}; citation alignment ${fixed(blind.citationAlignment * 100, 1)}%. Result: ${blind.passed ? "PASS" : "FAIL"}.\n\n## Cost and utilization\n\nTotal budget cost: $${fixed(cost.budgetCostUsd, 4)} across ${cost.eventCount} events. Ledgers: Gemini $${fixed(cost.byLedger["gemini-native-arm"], 4)}, Product $${fixed(cost.byLedger["product-e2e-arm"], 4)}, evaluation overhead $${fixed(cost.byLedger["evaluation-overhead"], 4)}. Unit cost: $${fixed(cost.budgetCostUsd / 480, 4)} per requested slot, $${fixed(cost.budgetCostUsd / Math.max(1, totalFinal), 4)} per returned final candidate, $${fixed(cost.budgetCostUsd / Math.max(1, totalValid), 4)} per valid candidate, $${fixed(cost.budgetCostUsd / Math.max(1, totalQualified), 4)} per 65+ candidate and $${fixed(cost.budgetCostUsd / Math.max(1, totalHigh), 4)} per 75+ candidate.\n\n| Product discovery provider | Requests | Raw | New unique | Duplicate hits | Fractional Top-30 credit | Paid credits | Discovery cost |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${providerRows}\n\n## Hybrid-search optimization analysis\n\n${findings}\n\n## Interpretation boundary\n\nThis is a cold-start comparison in two markets and four categories. Product used its frozen multi-stage workflow; Gemini used one interaction per cell with Google Search and no follow-up. Gemini-only final companies were evaluated with the same evidence/correction/scoring mechanism as product companies, without changing Gemini rank. Independent blind audit calibrated the shared scoring rather than redundantly rescoring every company.\n`;
}
