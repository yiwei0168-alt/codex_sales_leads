import rateCardJson from "../config/official-rate-card.v1.json";
import { priceCostEvent, type ExperimentCostEvent, type ExperimentRateCard } from "./cost-ledger";
import { EXPERIMENT_CONFIG, type ExperimentCell } from "./experiment";
import { callGeminiControl, renderGeminiControlPrompt } from "./provider-clients";

const rateCard = rateCardJson as ExperimentRateCard;

export interface ControlFinalCandidate {
  rank: number;
  companyName: string;
  officialWebsite: string;
  marketSignal: string;
  roleSignal: string;
  relevanceSignal: string;
  evidenceUrls: string[];
}

export interface ControlCellResult {
  schemaVersion: 1;
  runId: string;
  cellId: string;
  arm: "gemini-native";
  startedAt: string;
  completedAt: string;
  wallClockMs: number;
  requestedModel: string;
  actualModel: string;
  promptSha256?: string;
  searchQueries: number;
  finalCandidates: ControlFinalCandidate[];
  missingSlots: number;
  parseError?: string;
  warnings: string[];
  costEvents: ExperimentCostEvent[];
  raw: unknown;
}

export async function runControlCell(cell: ExperimentCell, options: {
  onCostEvents?: (events: ExperimentCostEvent[]) => Promise<void> | void;
} = {}): Promise<ControlCellResult> {
  const prompt = await renderGeminiControlPrompt(cell);
  const call = await callGeminiControl(cell, { prompt });
  const candidates = (call.output?.candidates ?? []).slice(0, 30).map((candidate, index) => ({
    ...candidate,
    rank: index + 1,
    evidenceUrls: [...new Set(candidate.evidenceUrls)],
  }));
  let cost = priceCostEvent({ eventId: `${cell.cellId}:gemini-control`, runId: EXPERIMENT_CONFIG.runId,
    cellId: cell.cellId, arm: "gemini-native", ledger: "gemini-native-arm", stage: "native-search",
    provider: "gemini-full", requestedModel: call.requestedModel, actualModel: call.actualModel,
    startedAt: call.startedAt, completedAt: call.completedAt, latencyMs: call.latencyMs,
    attempts: call.attempts, retries: call.retries, fallbackUsed: call.actualModel !== call.requestedModel,
    status: call.parseError ? "failed" : "completed", usage: call.usage,
    volume: { inputItems: 1, rawOutputItems: call.parseError ? 1 : candidates.length,
      validOutputItems: call.parseError ? 0 : candidates.length,
      downstreamUsedItems: call.parseError ? 0 : candidates.length,
      discardedReasonCounts: call.parseError ? { parseFailure: 1 } : {} },
    notes: ["one interaction", "no follow-up", "provider order preserved"] }, rateCard);
  const extraAnomalies = [
    ...((call.usage.inputTokens ?? 0) === 0 && (call.usage.outputTokens ?? 0) === 0 ? ["missing-model-token-usage"] : []),
    ...((call.usage.groundingQueries ?? 0) < 1 ? ["no-google-search-query-observed"] : []),
  ];
  if (extraAnomalies.length > 0) cost = { ...cost, costAnomalies: [...cost.costAnomalies, ...extraAnomalies] };
  if (cost.budgetCostUsd === null) throw new Error(`${cell.cellId} Gemini control cost is unpriced`);
  await options.onCostEvents?.([cost]);
  return { schemaVersion: 1, runId: EXPERIMENT_CONFIG.runId, cellId: cell.cellId, arm: "gemini-native",
    startedAt: call.startedAt, completedAt: call.completedAt, wallClockMs: call.latencyMs,
    requestedModel: call.requestedModel, actualModel: call.actualModel,
    searchQueries: call.usage.groundingQueries ?? 0, finalCandidates: candidates,
    missingSlots: Math.max(0, 30 - candidates.length), ...(call.parseError ? { parseError: call.parseError } : {}),
    warnings: extraAnomalies, costEvents: [cost], raw: call.raw };
}
