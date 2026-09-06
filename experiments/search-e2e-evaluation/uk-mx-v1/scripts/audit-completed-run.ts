import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { calculateAuditedProviderContributions, summarizeBlindAuditByCell,
  type AttributionProduct, type BlindAuditDecision, type BlindAuditMapping } from "../lib/post-run-audit";

const experimentRoot = path.resolve("experiments/search-e2e-evaluation/uk-mx-v1");
const runId = "2026-09-06-uk-mx-search-e2e-v1-1-6";
const artifactRoot = path.join(experimentRoot, "artifacts/runs", runId);
const rawRoot = path.join(experimentRoot, "runs/raw");
const sourceRunByCell: Record<string, string> = {
  "GB-distribution": "2026-09-06-uk-mx-search-e2e-v1-1-5",
  "MX-si-msp": "2026-09-06-uk-mx-search-e2e-v1-1-5",
  "MX-retail": "2026-09-05-uk-mx-search-e2e-v1-1-2",
};
const cellIds = ["MX-retail", "GB-distribution", "MX-si-msp", "GB-resale",
  "MX-distribution", "GB-retail", "MX-resale", "GB-si-msp"];

async function json<T>(filename: string): Promise<T> {
  return JSON.parse(await readFile(filename, "utf8")) as T;
}

interface CostEvent {
  stage: string;
  provider: string;
  budgetCostUsd?: number | null;
  usage?: { inputTokens?: number; outputTokens?: number; reasoningTokens?: number; paidSearchCredits?: number };
  costAnomalies?: string[];
}

interface RawProduct {
  discoveryCalls: AttributionProduct["discoveryCalls"];
  finalCandidates: AttributionProduct["finalCandidates"];
  correctedCandidateCount: number;
  completedAssessmentCount: number;
  costEvents: CostEvent[];
  raw?: { corrected?: AttributionProduct["correctedCandidates"] | null };
}

const isModelStage = (stage: string) => stage.startsWith("discovery-gate-")
  || stage.startsWith("evidence-correction-r") || stage.startsWith("qualification-score-only-");
const isCorrectionOrScoreStage = (stage: string) => stage.startsWith("evidence-correction-r")
  || stage.startsWith("qualification-score-only-");

const money = (value: number) => value.toFixed(6);
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

async function main() {
  const products: AttributionProduct[] = [];
  const productiveEvents: CostEvent[] = [];
  let finalCount = 0;
  let correctedCount = 0;
  let assessedCount = 0;
  for (const cellId of cellIds) {
    const current = await json<RawProduct>(path.join(rawRoot, runId, "cells", cellId, "product-e2e.json"));
    const productiveRunId = sourceRunByCell[cellId] ?? runId;
    const productive = productiveRunId === runId ? current
      : await json<RawProduct>(path.join(rawRoot, productiveRunId, "cells", cellId, "product-e2e.json"));
    if (!Array.isArray(productive.raw?.corrected)) throw new Error(`${cellId} has no raw corrected provenance`);
    const discoveryCostByProvider: Record<string, number> = {};
    for (const event of productive.costEvents) {
      productiveEvents.push(event);
      if (event.stage === "hybrid-discovery") {
        discoveryCostByProvider[event.provider] = (discoveryCostByProvider[event.provider] ?? 0)
          + (event.budgetCostUsd ?? 0);
      }
    }
    products.push({ discoveryCalls: current.discoveryCalls, finalCandidates: current.finalCandidates,
      correctedCandidates: productive.raw.corrected, discoveryCostByProvider });
    finalCount += current.finalCandidates.length;
    correctedCount += current.correctedCandidateCount;
    assessedCount += current.completedAssessmentCount;
  }

  const contributions = calculateAuditedProviderContributions(products);
  const calibration = await json<{ mappings: BlindAuditMapping[]; decisions: BlindAuditDecision[];
    metrics: Record<string, unknown> }>(path.join(artifactRoot, "blind-audit/calibration-64.json"));
  const blindByCell = summarizeBlindAuditByCell(calibration.mappings, calibration.decisions);
  const finalMetrics = await json<{ generatedAt: string; metrics: Record<string, unknown>;
    blindAudit: Record<string, unknown>; cost: { budgetCostUsd: number; eventCount: number;
      anomalies: string[] }; runtime: { geminiWallClockMs: number; productWallClockMs: number } }>(
    path.join(artifactRoot, "final/metrics.json"));

  const sumCost = (predicate: (event: CostEvent) => boolean) => productiveEvents
    .filter(predicate).reduce((sum, event) => sum + (event.budgetCostUsd ?? 0), 0);
  const sumTokens = (predicate: (event: CostEvent) => boolean) => productiveEvents.filter(predicate)
    .reduce((sum, event) => sum + (event.usage?.inputTokens ?? 0) + (event.usage?.outputTokens ?? 0)
      + (event.usage?.reasoningTokens ?? 0), 0);
  const productiveProductCostUsd = sumCost(() => true);
  const productiveTavilyCostUsd = sumCost((event) => event.stage === "fresh-evidence"
    || event.stage === "evidence-correction-search");
  const productiveModelCostUsd = sumCost((event) => isModelStage(event.stage));
  const productiveCorrectionAndScoreCostUsd = sumCost((event) => isCorrectionOrScoreStage(event.stage));
  const productiveModelTokens = sumTokens((event) => isModelStage(event.stage));
  const productiveCorrectionAndScoreTokens = sumTokens((event) => isCorrectionOrScoreStage(event.stage));
  const productiveTavilyCredits = productiveEvents.filter((event) => event.stage === "fresh-evidence"
    || event.stage === "evidence-correction-search")
    .reduce((sum, event) => sum + (event.usage?.paidSearchCredits ?? 0), 0);

  const v2Usage = await json<{ modelUsage: Array<{ promptTokens: number; completionTokens: number }> }>(
    path.resolve("experiments/multi-source-lead-discovery/artifacts/runs/2026-08-30-de-v2-tools-full/role-aware-v2/model-usage-checkpoint.json"));
  const v2InputTokens = v2Usage.modelUsage.reduce((sum, item) => sum + item.promptTokens, 0);
  const v2OutputTokens = v2Usage.modelUsage.reduce((sum, item) => sum + item.completionTokens, 0);
  const v2ModelCostUsd = v2InputTokens * 0.435 / 1_000_000 + v2OutputTokens * 0.87 / 1_000_000;
  const v2TavilyCredits = 696;
  const v2TavilyCostUsd = v2TavilyCredits * 0.008;
  const v2CandidateCount = 207;
  const v2ComparableCostUsd = v2ModelCostUsd + v2TavilyCostUsd;
  const currentComparableCostUsd = productiveModelCostUsd + productiveTavilyCostUsd;

  const audit = {
    schemaVersion: 1,
    auditVersion: "1.0.16",
    runId,
    sourceFinalGeneratedAt: finalMetrics.generatedAt,
    frozenOutcomeUnchanged: true,
    experimentOutcome: { metrics: finalMetrics.metrics, blindAudit: finalMetrics.blindAudit },
    correctedProviderAttribution: {
      contributions,
      finalCandidateCount: finalCount,
      fractionalCreditTotal: contributions.reduce((sum, row) => sum + row.fractionalFinalCredit, 0),
      supersedesZeroCreditTableIn: "final/SEARCH_E2E_EVALUATION_REPORT.v1.0.15.md",
      cause: "The frozen reporter expected raw.corrected.candidates, while ProductCell stores raw.corrected as an array and reused cells intentionally omit raw payloads.",
    },
    blindCalibrationDiagnostics: { byCell: blindByCell,
      overallRoleFamilyAgreement: blindByCell.reduce((sum, row) => sum + row.roleFamilyAgreement * row.sampleSize, 0)
        / blindByCell.reduce((sum, row) => sum + row.sampleSize, 0) },
    cost: {
      allExperimentSpendUsd: finalMetrics.cost.budgetCostUsd,
      allExperimentEvents: finalMetrics.cost.eventCount,
      productiveProductRunCostUsd: productiveProductCostUsd,
      productFinalCandidates: finalCount,
      productCorrectedCandidates: correctedCount,
      productCompletedAssessments: assessedCount,
      productCostPerFinalCandidateUsd: productiveProductCostUsd / finalCount,
      productCostPerCompletedAssessmentUsd: productiveProductCostUsd / assessedCount,
      productiveModelCostUsd,
      productiveModelTokens,
      productiveCorrectionAndScoreCostUsd,
      productiveCorrectionAndScoreTokens,
      productiveTavilyCredits,
      productiveTavilyCostUsd,
      v2Baseline: { candidateCount: v2CandidateCount, inputTokens: v2InputTokens, outputTokens: v2OutputTokens,
        modelCostUsd: v2ModelCostUsd, tavilyCredits: v2TavilyCredits, tavilyCostUsd: v2TavilyCostUsd,
        comparableCostUsd: v2ComparableCostUsd, comparableCostPerCandidateUsd: v2ComparableCostUsd / v2CandidateCount },
      comparison: {
        modelCostPerOutputLeadChange: productiveModelCostUsd / finalCount / (v2ModelCostUsd / v2CandidateCount) - 1,
        tavilyCreditsPerCorrectedCandidateChange: productiveTavilyCredits / correctedCount
          / (v2TavilyCredits / v2CandidateCount) - 1,
        comparableCostPerOutputLeadChange: currentComparableCostUsd / finalCount
          / (v2ComparableCostUsd / v2CandidateCount) - 1,
        boundary: "V2 starts from a preselected candidate pool; the current figure is cold-start end-to-end and includes spend on rejected candidates. Only stage-specific ratios are directly comparable.",
      },
    },
    telemetryErrata: {
      evaluationCorrectionVolumeAnomalyCount: finalMetrics.cost.anomalies
        .filter((item) => item.includes("evaluation-control-correction")
          && item.includes("downstream-use-exceeds-valid-output")).length,
      blindJudgeUsageUnavailableCount: finalMetrics.cost.anomalies
        .filter((item) => item.includes("blind-judge") || item.includes("in-session-codex-token-usage-unavailable")).length,
    },
  };

  const providerRows = contributions.map((row) => `| ${row.provider} | ${row.requests} | ${row.rawResults} | ${row.newUniqueCompanies} | ${row.duplicateHits} | ${row.fractionalFinalCredit.toFixed(2)} | ${pct(row.fractionalFinalCredit / Math.max(1, row.newUniqueCompanies))} | $${money(row.productiveDiscoveryCostUsd)} |`).join("\n");
  const blindRows = blindByCell.map((row) => `| ${row.cellId} | ${row.sampleSize} | ${pct(row.exactRoleAgreement)} | ${pct(row.roleFamilyAgreement)} | ${pct(row.qualifiedStatusAgreement)} | ${row.meanAbsoluteError.toFixed(1)} | ${row.meanBias.toFixed(1)} |`).join("\n");
  const report = `# Cudy UK/Mexico search E2E post-run audit v1.0.16\n\n`+
    `This is a deterministic, read-only audit of the completed v1.1.6 run. It does not alter frozen candidates, scores, blind decisions or win gates.\n\n`+
    `## Final conclusion\n\nThe product scoring pipeline reported a +22.69 Macro Slot Utility@30 advantage and won 7/8 cells, but the formal outcome remains **inconclusive** because the independent 64-company blind calibration failed. Exact primary-role agreement was 60.9%, qualified-status agreement 70.3%, Spearman 0.691, MAE 10.75 and citation alignment 100%. The product therefore has a strong discovery signal, but the current scoring output is not calibrated well enough to prove superiority over Gemini.\n\n`+
    `## Corrected discovery-provider attribution\n\nThe v1.0.15 generated report's zero-credit table is invalid. Its reporter read \`raw.corrected.candidates\`, while the actual value is an array; three reused cells also intentionally omit raw payloads. This audit resolves those three cells to their frozen source runs and requires all ${finalCount} final product companies to have provenance. Fractional credit sums to ${audit.correctedProviderAttribution.fractionalCreditTotal}.\n\n`+
    `| Provider | Requests | Raw | New unique | Duplicate hits | Fractional final credit | Credit/new unique | Productive discovery cost |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${providerRows}\n\n`+
    `No provider should be removed from the zero-credit output. Brave contributed the most final candidates, while Gemini Full had the highest final-credit/new-unique rate among the national/semantic routes. SearchAPI had material final contribution despite repeated timeout waste.\n\n`+
    `## Blind-calibration diagnosis\n\n`+
    `| Cell | N | Exact role | Role family | Qualified status | MAE | Bias |\n|---|---:|---:|---:|---:|---:|---:|\n${blindRows}\n\n`+
    `Role-family agreement was ${pct(audit.blindCalibrationDiagnostics.overallRoleFamilyAgreement)}, higher than exact-role agreement because seven Retailer→E-tailer and four Distributor→VAD differences are subtype disagreements inside the requested category. Future experiments should keep exact subtype accuracy as a diagnostic, but use role-family/category agreement as the primary search-quality gate. This does not excuse true family errors such as brand-owned stores, ISPs, directories and overused Hybrid labels. GB Retail and MX Retail are the priority calibration cells.\n\n`+
    `## Cost and v2.0 comparison\n\nThe total experiment spend was $${money(finalMetrics.cost.budgetCostUsd)}, including failed/invalidated attempts and shared evaluation. The eight productive product cell executions cost $${money(productiveProductCostUsd)} for ${finalCount} final outputs: **$${money(productiveProductCostUsd / finalCount)} per final product lead**. Because blind calibration failed, this is an output-unit cost rather than a verified-good-lead cost.\n\n`+
    `Using the frozen official rate card, the v2.0 207-company evidence+correction+scoring baseline cost is estimated at $${money(v2ComparableCostUsd)}: $${money(v2ModelCostUsd)} DeepSeek plus $${money(v2TavilyCostUsd)} for ${v2TavilyCredits} Tavily credits, or $${money(v2ComparableCostUsd / v2CandidateCount)} per preselected company. In the current productive runs, model cost per final output fell ${pct(-audit.cost.comparison.modelCostPerOutputLeadChange)}, and Tavily credits per corrected candidate fell ${pct(-audit.cost.comparison.tavilyCreditsPerCorrectedCandidateChange)}. However, model+Tavily cost per final output was ${pct(audit.cost.comparison.comparableCostPerOutputLeadChange)} higher than v2.0 because cold-start search sent many wrong-role or weak candidates into evidence collection. The optimization is therefore successful at the model and per-corrected-candidate levels, but not yet at end-to-end cost per accepted output.\n\n`+
    `## Required product actions\n\n1. Fix domain sanitation and reject public-suffix-only identities before any paid stage.\n2. Tighten the light gate for directories, direct brand stores, ISPs and unrelated retailers, and require requested-category business action before paid evidence.\n3. Reduce Hybrid use: multiple supported roles do not prove co-primary business families; subtype definitions must explicitly distinguish Distributor/VAD, Reseller/VAR and Retailer/E-tailer.\n4. Treat product assortment and target-market operating status as evidence gates; stale insolvency or administration evidence should trigger a current-status warning and user-selectable revalidation, not silent acceptance.\n5. Keep SearchAPI because it contributed 24.5 final credits, but move repeated timeout routes to an every-other-round bounded recovery probe.\n6. Fix stage-volume attribution so aggregate output is assigned once rather than copied to every model usage event.\n7. Persist first-pass evidence gaps, supplementation and role-correction provenance in the evidence/role caches so downstream agents do not repeat work.\n\n`+
    `## Runtime boundary\n\nGemini summed wall time was ${(finalMetrics.runtime.geminiWallClockMs / 60_000).toFixed(2)} minutes and Product E2E ${(finalMetrics.runtime.productWallClockMs / 60_000).toFixed(2)} minutes. Runtime was recorded but was not a win gate, as preregistered.\n`;

  await writeFile(path.join(artifactRoot, "final/POST_RUN_AUDIT.v1.0.16.json"), `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  await writeFile(path.join(artifactRoot, "final/POST_RUN_AUDIT.v1.0.16.md"), report, "utf8");
  console.log(JSON.stringify({ runId, finalCount, productiveProductCostUsd,
    correctedProviderCredit: contributions.map((row) => [row.provider, row.fractionalFinalCredit]),
    blindRoleFamilyAgreement: audit.blindCalibrationDiagnostics.overallRoleFamilyAgreement }, null, 2));
}

await main();
