import { EXPERIMENT_CONFIG, type ExperimentArm, type ExperimentCountryCode } from "./experiment";

export interface MetricCandidateSlot {
  companyKey: string;
  totalScore: number;
  isRealOperatingCompany: boolean;
  operatesInTargetMarket: boolean;
  requestedCategoryMatch: boolean;
}

export interface MetricCellInput {
  cellId: string;
  countryCode: ExperimentCountryCode;
  arms: Record<ExperimentArm, MetricCandidateSlot[]>;
}

export interface ArmCellMetrics {
  slotUtilities: number[];
  cellUtility: number;
  validCount: number;
  qualifiedCount: number;
  highValueCount: number;
  ndcgAt30: number;
  duplicateSlots: number;
  missingSlots: number;
}

export interface ExperimentMetricReport {
  byCell: Array<{ cellId: string; countryCode: ExperimentCountryCode;
    arms: Record<ExperimentArm, ArmCellMetrics>; delta: number }>;
  macroUtility: Record<ExperimentArm, number>;
  macroDelta: number;
  cellsWonByProduct: number;
  marketDelta: Record<ExperimentCountryCode, number>;
  uniqueHighValue: Record<ExperimentArm, number>;
  bootstrap: { iterations: number; seed: number; meanDelta: number; lower95: number; upper95: number };
  gates: Record<string, { passed: boolean; actual: number | boolean; threshold: number | boolean }>;
  passed: boolean;
}

function mean(values: number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function ndcg(values: number[]): number {
  const dcg = values.reduce((sum, value, index) => sum + value / Math.log2(index + 2), 0);
  const ideal = [...values].sort((a, b) => b - a)
    .reduce((sum, value, index) => sum + value / Math.log2(index + 2), 0);
  return ideal > 0 ? dcg / ideal : 0;
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4_294_967_296;
  };
}

function percentile(sorted: number[], probability: number): number {
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const fraction = index - lower;
  return sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * fraction;
}

function stratifiedBootstrap(byCell: ExperimentMetricReport["byCell"], iterations: number, seed: number) {
  const random = mulberry32(seed);
  const deltas: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const cellDeltas = byCell.map((cell) => {
      const product = cell.arms["product-e2e"].slotUtilities;
      const control = cell.arms["gemini-native"].slotUtilities;
      const sampled: number[] = [];
      for (let slot = 0; slot < 30; slot += 1) {
        const index = Math.floor(random() * 30);
        sampled.push(product[index] - control[index]);
      }
      return mean(sampled);
    });
    deltas.push(mean(cellDeltas));
  }
  deltas.sort((a, b) => a - b);
  return { iterations, seed, meanDelta: mean(deltas), lower95: percentile(deltas, 0.025),
    upper95: percentile(deltas, 0.975) };
}

export function calculateExperimentMetrics(inputs: MetricCellInput[], blindAuditPassed: boolean): ExperimentMetricReport {
  const seenByArmAndMarket = new Map<string, Set<string>>();
  const highValueByArm = new Map<ExperimentArm, Set<string>>([
    ["gemini-native", new Set()], ["product-e2e", new Set()],
  ]);
  const byCell = inputs.map((input) => {
    const arms = Object.fromEntries((["gemini-native", "product-e2e"] as const).map((arm) => {
      const seenKey = `${arm}:${input.countryCode}`;
      const seen = seenByArmAndMarket.get(seenKey) ?? new Set<string>();
      seenByArmAndMarket.set(seenKey, seen);
      let duplicateSlots = 0;
      const values = input.arms[arm].slice(0, 30).map((slot) => {
        const valid = slot.isRealOperatingCompany && slot.operatesInTargetMarket && slot.requestedCategoryMatch;
        if (!valid) return 0;
        if (seen.has(slot.companyKey)) {
          duplicateSlots += 1;
          return 0;
        }
        seen.add(slot.companyKey);
        const utility = Math.max(0, Math.min(100, slot.totalScore));
        if (utility >= 75) highValueByArm.get(arm)!.add(`${input.countryCode}:${slot.companyKey}`);
        return utility;
      });
      const missingSlots = Math.max(0, 30 - values.length);
      const slotUtilities = [...values, ...Array.from({ length: missingSlots }, () => 0)];
      const metrics: ArmCellMetrics = { slotUtilities, cellUtility: mean(slotUtilities),
        validCount: slotUtilities.filter((value) => value > 0).length,
        qualifiedCount: slotUtilities.filter((value) => value >= 65).length,
        highValueCount: slotUtilities.filter((value) => value >= 75).length,
        ndcgAt30: ndcg(slotUtilities), duplicateSlots, missingSlots };
      return [arm, metrics];
    })) as Record<ExperimentArm, ArmCellMetrics>;
    return { cellId: input.cellId, countryCode: input.countryCode, arms,
      delta: arms["product-e2e"].cellUtility - arms["gemini-native"].cellUtility };
  });
  const macroUtility = Object.fromEntries((["gemini-native", "product-e2e"] as const)
    .map((arm) => [arm, mean(byCell.map((cell) => cell.arms[arm].cellUtility))])) as Record<ExperimentArm, number>;
  const macroDelta = macroUtility["product-e2e"] - macroUtility["gemini-native"];
  const marketDelta = Object.fromEntries((["GB", "MX"] as const).map((countryCode) => [countryCode,
    mean(byCell.filter((cell) => cell.countryCode === countryCode).map((cell) => cell.delta))])) as Record<ExperimentCountryCode, number>;
  const bootstrap = stratifiedBootstrap(byCell, EXPERIMENT_CONFIG.bootstrap.iterations,
    EXPERIMENT_CONFIG.bootstrap.seed);
  const uniqueHighValue = Object.fromEntries((["gemini-native", "product-e2e"] as const)
    .map((arm) => [arm, highValueByArm.get(arm)!.size])) as Record<ExperimentArm, number>;
  const cellsWonByProduct = byCell.filter((cell) => cell.delta > 0).length;
  const gates = {
    macroGain: { passed: macroDelta >= EXPERIMENT_CONFIG.winGate.minimumMacroUtilityGain,
      actual: macroDelta, threshold: EXPERIMENT_CONFIG.winGate.minimumMacroUtilityGain },
    cellsWon: { passed: cellsWonByProduct >= EXPERIMENT_CONFIG.winGate.minimumCellsWon,
      actual: cellsWonByProduct, threshold: EXPERIMENT_CONFIG.winGate.minimumCellsWon },
    worstMarket: { passed: Math.min(...Object.values(marketDelta)) >= EXPERIMENT_CONFIG.winGate.minimumMarketDelta,
      actual: Math.min(...Object.values(marketDelta)), threshold: EXPERIMENT_CONFIG.winGate.minimumMarketDelta },
    worstCell: { passed: Math.min(...byCell.map((cell) => cell.delta)) >= EXPERIMENT_CONFIG.winGate.minimumCellDelta,
      actual: Math.min(...byCell.map((cell) => cell.delta)), threshold: EXPERIMENT_CONFIG.winGate.minimumCellDelta },
    uniqueHighValue: { passed: uniqueHighValue["product-e2e"] > uniqueHighValue["gemini-native"],
      actual: uniqueHighValue["product-e2e"] - uniqueHighValue["gemini-native"], threshold: 1 },
    bootstrapLowerBound: { passed: bootstrap.lower95 > 0, actual: bootstrap.lower95, threshold: 0 },
    blindAudit: { passed: blindAuditPassed, actual: blindAuditPassed, threshold: true },
  };
  return { byCell, macroUtility, macroDelta, cellsWonByProduct, marketDelta, uniqueHighValue, bootstrap,
    gates, passed: Object.values(gates).every((gate) => gate.passed) };
}

export function rankValues(values: number[]): number[] {
  const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(values.length);
  for (let start = 0; start < sorted.length;) {
    let end = start + 1;
    while (end < sorted.length && sorted[end].value === sorted[start].value) end += 1;
    const rank = (start + 1 + end) / 2;
    for (let index = start; index < end; index += 1) ranks[sorted[index].index] = rank;
    start = end;
  }
  return ranks;
}

export function spearmanCorrelation(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length < 2) return 0;
  const a = rankValues(left);
  const b = rankValues(right);
  const meanA = mean(a);
  const meanB = mean(b);
  const covariance = a.reduce((sum, value, index) => sum + (value - meanA) * (b[index] - meanB), 0);
  const denominator = Math.sqrt(a.reduce((sum, value) => sum + (value - meanA) ** 2, 0)
    * b.reduce((sum, value) => sum + (value - meanB) ** 2, 0));
  return denominator > 0 ? covariance / denominator : 0;
}
