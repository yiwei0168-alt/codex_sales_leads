export type ExperimentLedgerId = "gemini-native-arm" | "product-e2e-arm" | "evaluation-overhead";

export interface ExperimentUsage {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  searchRequests?: number;
  groundingQueries?: number;
  searchResults?: number;
  extractedPages?: number;
  paidSearchCredits?: number;
}

export interface ExperimentVolume {
  inputItems: number;
  rawOutputItems: number;
  validOutputItems: number;
  downstreamUsedItems: number;
  discardedReasonCounts: Record<string, number>;
}

export interface ExperimentCostEventInput {
  eventId: string;
  runId: string;
  cellId?: string;
  arm?: "gemini-native" | "product-e2e" | "shared-evaluation";
  ledger: ExperimentLedgerId;
  stage: string;
  provider: string;
  requestedModel?: string;
  actualModel?: string;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  attempts: number;
  retries: number;
  fallbackUsed: boolean;
  status: "completed" | "failed" | "skipped";
  usage: ExperimentUsage;
  volume: ExperimentVolume;
  accountCashCostUsd?: number;
  notes?: string[];
}

export interface ExperimentCostEvent extends ExperimentCostEventInput {
  officialListPriceUsd: number | null;
  budgetCostUsd: number | null;
  cashCostBasis: "account-observed" | "official-conservative" | "unknown";
  costAnomalies: string[];
}

interface ModelRate {
  currency: "USD" | "CNY";
  perMillionTokens: Record<string, number>;
  googleSearchGrounding?: { usdPerThousandQueriesAfterFree: number };
}

interface SearchRate {
  currency: "USD" | "CNY";
  payAsYouGoUsdPerCredit?: number;
  autoSearchUpToTenResultsUsd?: number;
  additionalResultAboveTenUsd?: number;
  contentTextPerPageUsd?: number;
  searchUsdPerThousandRequests?: number;
  developerPlanUsdPerThousandSuccessfulSearches?: number;
  usdPerThousandRequestsAfterFree?: number;
}

export interface ExperimentRateCard {
  models: Record<string, ModelRate>;
  searchAndExtraction: Record<string, SearchRate>;
  currencyConversion: { usdCny: number | null };
}

function nonNegative(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
}

function toUsd(value: number, currency: "USD" | "CNY", rateCard: ExperimentRateCard,
  anomalies: string[]): number | null {
  if (currency === "USD") return value;
  const usdCny = rateCard.currencyConversion.usdCny;
  if (!usdCny || usdCny <= 0) {
    anomalies.push("missing-usd-cny-conversion");
    return null;
  }
  return value / usdCny;
}

function modelCost(model: string, usage: ExperimentUsage, rateCard: ExperimentRateCard,
  anomalies: string[]): number | null {
  const rateKey = Object.keys(rateCard.models).find((key) => model === key || model.startsWith(`${key}-`));
  const rate = rateKey ? rateCard.models[rateKey] : undefined;
  if (!rate) {
    anomalies.push(`unknown-model-rate:${model}`);
    return null;
  }
  const rates = rate.perMillionTokens;
  const input = nonNegative(usage.inputTokens);
  const cached = Math.min(input, nonNegative(usage.cachedInputTokens));
  const uncached = input - cached;
  const output = nonNegative(usage.outputTokens);
  const inputRate = rates.input ?? rates.cacheMissInput;
  const cachedRate = rates.cachedInput ?? rates.cacheRead ?? rates.cacheHitInput ?? inputRate;
  const outputRate = rates.outputIncludingThinking ?? rates.outputIncludingReasoning ?? rates.output;
  if (inputRate === undefined || outputRate === undefined) {
    anomalies.push(`incomplete-model-rate:${model}`);
    return null;
  }
  let amount = (uncached * inputRate + cached * (cachedRate ?? inputRate) + output * outputRate) / 1_000_000;
  if (rate.googleSearchGrounding) {
    if (usage.groundingQueries === undefined) {
      anomalies.push(`missing-grounding-query-count:${model}`);
      return null;
    }
    amount += nonNegative(usage.groundingQueries)
      * rate.googleSearchGrounding.usdPerThousandQueriesAfterFree / 1_000;
  }
  return toUsd(amount, rate.currency, rateCard, anomalies);
}

function searchCost(provider: string, usage: ExperimentUsage, rateCard: ExperimentRateCard,
  anomalies: string[]): number | null {
  const alias: Record<string, string> = {
    brave: "brave-search",
    "google-places": "google-places-text-search-enterprise",
  };
  const key = alias[provider] ?? provider;
  const rate = rateCard.searchAndExtraction[key];
  if (!rate) return 0;
  const requests = nonNegative(usage.searchRequests);
  let amount = 0;
  if (rate.payAsYouGoUsdPerCredit !== undefined) {
    if (usage.paidSearchCredits === undefined) {
      anomalies.push(`missing-paid-search-credits:${provider}`);
      return null;
    }
    amount = nonNegative(usage.paidSearchCredits) * rate.payAsYouGoUsdPerCredit;
  } else if (rate.autoSearchUpToTenResultsUsd !== undefined) {
    if (usage.searchRequests === undefined) {
      anomalies.push(`missing-search-request-count:${provider}`);
      return null;
    }
    const results = nonNegative(usage.searchResults);
    const extraResults = Math.max(0, results - requests * 10);
    amount = requests * rate.autoSearchUpToTenResultsUsd
      + extraResults * nonNegative(rate.additionalResultAboveTenUsd)
      + nonNegative(usage.extractedPages) * nonNegative(rate.contentTextPerPageUsd);
  } else {
    if (usage.searchRequests === undefined) {
      anomalies.push(`missing-search-request-count:${provider}`);
      return null;
    }
    const perThousand = rate.searchUsdPerThousandRequests
      ?? rate.developerPlanUsdPerThousandSuccessfulSearches
      ?? rate.usdPerThousandRequestsAfterFree;
    if (perThousand === undefined) {
      anomalies.push(`incomplete-search-rate:${provider}`);
      return null;
    }
    amount = requests * perThousand / 1_000;
  }
  return toUsd(amount, rate.currency, rateCard, anomalies);
}

export function priceCostEvent(input: ExperimentCostEventInput,
  rateCard: ExperimentRateCard): ExperimentCostEvent {
  const anomalies: string[] = [];
  if (input.status === "completed" && input.latencyMs < 0) anomalies.push("negative-latency");
  if (input.retries > Math.max(0, input.attempts - 1)) anomalies.push("retry-count-exceeds-attempts");
  if (input.volume.validOutputItems > input.volume.rawOutputItems) anomalies.push("valid-output-exceeds-raw-output");
  if (input.volume.downstreamUsedItems > input.volume.validOutputItems) anomalies.push("downstream-use-exceeds-valid-output");

  const resolvedModel = input.actualModel || input.requestedModel;
  const hasModelUsage = nonNegative(input.usage.inputTokens) > 0 || nonNegative(input.usage.outputTokens) > 0;
  const modelUsd = resolvedModel && hasModelUsage ? modelCost(resolvedModel, input.usage, rateCard, anomalies) : 0;
  const searchUsd = searchCost(input.provider, input.usage, rateCard, anomalies);
  const officialListPriceUsd = modelUsd === null || searchUsd === null ? null : modelUsd + searchUsd;
  const accountCashCostUsd = input.accountCashCostUsd;
  const budgetCostUsd = accountCashCostUsd !== undefined ? Math.max(0, accountCashCostUsd) : officialListPriceUsd;
  return {
    ...input,
    officialListPriceUsd,
    budgetCostUsd,
    cashCostBasis: accountCashCostUsd !== undefined ? "account-observed"
      : officialListPriceUsd === null ? "unknown" : "official-conservative",
    costAnomalies: anomalies,
  };
}

export interface CostForecast {
  completedCells: number;
  totalCells: number;
  incurredUsd: number;
  expectedCompletionUsd: number;
  lowerUsd: number;
  upperUsd: number;
  method: "cell-run-rate" | "initial-estimate";
}

export function forecastCompletionCost(events: ExperimentCostEvent[], options: {
  completedCellIds: string[];
  totalCells: number;
  fixedRemainingUsd: number;
  initialEstimateUsd: number;
}): CostForecast {
  const unknown = events.filter((event) => event.budgetCostUsd === null);
  if (unknown.length > 0) throw new Error(`Cannot forecast with ${unknown.length} unpriced cost event(s)`);
  const incurredUsd = events.reduce((sum, event) => sum + (event.budgetCostUsd ?? 0), 0);
  const completed = [...new Set(options.completedCellIds)];
  if (completed.length === 0) {
    return { completedCells: 0, totalCells: options.totalCells, incurredUsd,
      expectedCompletionUsd: Math.max(incurredUsd, options.initialEstimateUsd),
      lowerUsd: incurredUsd, upperUsd: Math.max(incurredUsd, options.initialEstimateUsd * 1.35),
      method: "initial-estimate" };
  }
  const costs = completed.map((cellId) => events.filter((event) => event.cellId === cellId)
    .reduce((sum, event) => sum + (event.budgetCostUsd ?? 0), 0));
  const mean = costs.reduce((sum, cost) => sum + cost, 0) / costs.length;
  const variance = costs.length > 1
    ? costs.reduce((sum, cost) => sum + (cost - mean) ** 2, 0) / (costs.length - 1) : (mean * 0.25) ** 2;
  const standardError = Math.sqrt(variance / costs.length);
  const remainingCells = Math.max(0, options.totalCells - completed.length);
  const expected = incurredUsd + remainingCells * mean + Math.max(0, options.fixedRemainingUsd);
  const uncertainty = Math.max(expected * 0.15, 1.96 * standardError * remainingCells);
  return { completedCells: completed.length, totalCells: options.totalCells, incurredUsd,
    expectedCompletionUsd: expected, lowerUsd: Math.max(incurredUsd, expected - uncertainty),
    upperUsd: expected + uncertainty, method: "cell-run-rate" };
}

export interface BudgetDecision {
  totalBudgetUsd: number;
  spentUsd: number;
  budgetFraction: number;
  newlyCrossedThresholdsUsd: number[];
  forecast: CostForecast;
  warning: boolean;
  hardStop: boolean;
  requiresUserDecision: boolean;
  reasons: string[];
}

export function evaluateBudget(events: ExperimentCostEvent[], forecast: CostForecast, options: {
  totalBudgetUsd: number;
  thresholdsUsd: number[];
  previouslyReportedThresholdsUsd?: number[];
  nextRequiredCallEstimateUsd?: number;
}): BudgetDecision {
  if (events.some((event) => event.budgetCostUsd === null)) {
    return { totalBudgetUsd: options.totalBudgetUsd, spentUsd: forecast.incurredUsd,
      budgetFraction: forecast.incurredUsd / options.totalBudgetUsd, newlyCrossedThresholdsUsd: [], forecast,
      warning: true, hardStop: true, requiresUserDecision: true, reasons: ["unpriced-cost-event"] };
  }
  const spent = forecast.incurredUsd;
  const prior = new Set(options.previouslyReportedThresholdsUsd ?? []);
  const crossed = options.thresholdsUsd.filter((threshold) => spent >= threshold && !prior.has(threshold));
  const nextWouldExceed = spent + Math.max(0, options.nextRequiredCallEstimateUsd ?? 0) > options.totalBudgetUsd;
  const forecastExceeds = forecast.expectedCompletionUsd > options.totalBudgetUsd || forecast.upperUsd > options.totalBudgetUsd;
  const hardStop = spent >= options.totalBudgetUsd || nextWouldExceed;
  const reasons = [
    ...(forecastExceeds ? ["forecast-may-exceed-budget"] : []),
    ...(nextWouldExceed ? ["next-required-call-may-exceed-budget"] : []),
    ...(spent >= options.totalBudgetUsd ? ["hard-budget-reached"] : []),
  ];
  return { totalBudgetUsd: options.totalBudgetUsd, spentUsd: spent,
    budgetFraction: spent / options.totalBudgetUsd, newlyCrossedThresholdsUsd: crossed, forecast,
    warning: reasons.length > 0, hardStop, requiresUserDecision: forecastExceeds || hardStop, reasons };
}

export function summarizeCostEvents(events: ExperimentCostEvent[]) {
  const sum = (items: ExperimentCostEvent[]) => items.reduce((total, item) => total + (item.budgetCostUsd ?? 0), 0);
  return {
    eventCount: events.length,
    officialListPriceUsd: events.reduce((total, event) => total + (event.officialListPriceUsd ?? 0), 0),
    budgetCostUsd: sum(events),
    unpricedEvents: events.filter((event) => event.budgetCostUsd === null).map((event) => event.eventId),
    byLedger: Object.fromEntries((["gemini-native-arm", "product-e2e-arm", "evaluation-overhead"] as const)
      .map((ledger) => [ledger, sum(events.filter((event) => event.ledger === ledger))])),
    byStage: Object.fromEntries([...new Set(events.map((event) => event.stage))]
      .sort().map((stage) => [stage, sum(events.filter((event) => event.stage === stage))])),
    anomalies: events.flatMap((event) => event.costAnomalies.map((anomaly) => `${event.eventId}:${anomaly}`)),
  };
}
