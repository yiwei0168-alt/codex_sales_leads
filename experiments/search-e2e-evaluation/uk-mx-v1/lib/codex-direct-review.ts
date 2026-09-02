import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

import { z } from "zod";

import rateCardJson from "../config/official-rate-card.v1.json";
import type { BlindDecision, BlindPacket } from "./blind-audit";
import { priceCostEvent, type ExperimentRateCard } from "./cost-ledger";
import { blindJudgeOutputSchema } from "./runtime-schemas";

const rateCard = rateCardJson as ExperimentRateCard;

export const codexDirectDecisionSchema = z.object({
  schemaVersion: z.literal(1),
  packetId: z.string().min(1),
  reviewer: z.literal("codex-in-session"),
  externalSearchUsed: z.literal(false),
  packetSha256: z.string().regex(/^[a-f0-9]{64}$/),
  reviewStartedAt: z.string().datetime(),
  reviewCompletedAt: z.string().datetime(),
  output: blindJudgeOutputSchema,
}).strict();

export type CodexDirectDecisionArtifact = z.infer<typeof codexDirectDecisionSchema>;

export function codexPacketSha256(packet: BlindPacket): string {
  return createHash("sha256").update(JSON.stringify(packet)).digest("hex");
}

export function validateCodexDirectDecision(packet: BlindPacket,
  value: unknown): CodexDirectDecisionArtifact {
  const decision = codexDirectDecisionSchema.parse(value);
  if (decision.packetId !== packet.packetId) throw new Error(`${packet.packetId}: decision packet ID mismatch`);
  if (decision.output.packetId !== packet.packetId) throw new Error(`${packet.packetId}: output packet ID mismatch`);
  if (decision.packetSha256 !== codexPacketSha256(packet)) {
    throw new Error(`${packet.packetId}: decision packet SHA-256 mismatch`);
  }
  if (Date.parse(decision.reviewCompletedAt) < Date.parse(decision.reviewStartedAt)) {
    throw new Error(`${packet.packetId}: review completion precedes review start`);
  }
  const allowedEvidenceIds = new Set(packet.evidence.map((item) => item.evidenceId));
  for (const reason of decision.output.dimensionReasons) {
    for (const evidenceId of reason.evidenceIds) {
      if (!allowedEvidenceIds.has(evidenceId)) {
        throw new Error(`${packet.packetId}: decision cites unknown evidence ID ${evidenceId}`);
      }
    }
  }
  return decision;
}

export function codexDirectBlindDecision(packet: BlindPacket, artifact: CodexDirectDecisionArtifact,
  runId: string): BlindDecision {
  const output = artifact.output;
  const deterministicTotal = Object.values(output.dimensions).reduce((sum, value) => sum + value, 0);
  const latencyMs = Date.parse(artifact.reviewCompletedAt) - Date.parse(artifact.reviewStartedAt);
  const costEvent = priceCostEvent({ eventId: `${packet.packetId}:blind-judge`, runId,
    ledger: "evaluation-overhead", arm: "shared-evaluation", stage: "blind-judge",
    provider: "codex-in-session", requestedModel: "codex-in-session", actualModel: "codex-in-session",
    startedAt: artifact.reviewStartedAt, completedAt: artifact.reviewCompletedAt, latencyMs,
    attempts: 1, retries: 0, fallbackUsed: true, status: "completed", usage: {}, accountCashCostUsd: 0,
    volume: { inputItems: 1, rawOutputItems: 1, validOutputItems: 1, downstreamUsedItems: 1,
      discardedReasonCounts: {} },
    notes: ["Direct blind review in the current Codex conversation; no API call and no external search.",
      "Incremental API cash cost is zero; conversation token usage is not exposed to the experiment runner."] }, rateCard);
  costEvent.costAnomalies.push("in-session-codex-token-usage-unavailable");
  return { packetId: packet.packetId, requestedModel: "codex-in-session", actualModel: "codex-in-session",
    modelReportedTotal: output.totalScore, deterministicTotal, output: { ...output, totalScore: deterministicTotal },
    costEvent };
}

export function assertCodexDecisionFilesFrozen(relativePaths: string[]): { commit: string; upstream: string } {
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const upstream = execFileSync("git", ["rev-parse", "@{upstream}"], { encoding: "utf8" }).trim();
  if (commit !== upstream) throw new Error("Codex blind decisions must be pushed before deblinding");
  for (const relativePath of relativePaths) {
    const tracked = execFileSync("git", ["ls-files", "--error-unmatch", "--", relativePath],
      { encoding: "utf8" }).trim();
    if (!tracked) throw new Error(`Codex blind decision is not tracked: ${relativePath}`);
    const status = execFileSync("git", ["status", "--porcelain", "--", relativePath],
      { encoding: "utf8" }).trim();
    if (status) throw new Error(`Codex blind decision has uncommitted changes: ${relativePath}`);
  }
  return { commit, upstream };
}
