import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { blindAuditV2DecisionCacheKey, createInSessionCodexArbitrationDecisionV2,
  resolveBlindConsensusV2, type BlindAuditV2Packet, type BlindJudgeV2Decision } from "../lib/blind-audit-v2";
import { priceCostEvent, type ExperimentRateCard } from "../lib/cost-ledger";
import { EXPERIMENT_CONFIG } from "../lib/experiment";
import { artifactRunRoot, loadRunState, rawRunRoot, saveRunState, writeJsonAtomic } from "../lib/run-store";
import { blindJudgeV2OutputSchema } from "../lib/runtime-schemas";
import rateCardJson from "../config/official-rate-card.v1.json";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function main(): Promise<void> {
  const decisionArg = process.argv.find((value) => value.startsWith("--decision="))?.slice("--decision=".length);
  if (!decisionArg) throw new Error("Usage: --decision=<raw blind-judge-v2 output JSON>");
  const output = blindJudgeV2OutputSchema.parse(JSON.parse(await readFile(path.resolve(decisionArg), "utf8")));
  const packetSet = JSON.parse(await readFile(path.join(artifactRunRoot(), "blind-audit/packets-v2.1.json"), "utf8")) as
    { packets: BlindAuditV2Packet[] };
  const packet = packetSet.packets.find((item) => item.packetId === output.packetId);
  if (!packet) throw new Error(`${output.packetId} is not in the frozen blind packet set`);

  const cacheDir = path.join(rawRunRoot(), "blind-audit/cache");
  const cached = await Promise.all((await readdir(cacheDir)).filter((name) => name.endsWith(".json"))
    .map(async (name) => JSON.parse(await readFile(path.join(cacheDir, name), "utf8")) as BlindJudgeV2Decision));
  const judges = ["judge-a", "judge-b"].map((judgeId) => cached.find((item) =>
    item.packetId === packet.packetId && item.judgeId === judgeId));
  if (!judges[0] || !judges[1]) throw new Error(`${packet.packetId} is missing an independent judge decision`);
  const judgePair = judges as [BlindJudgeV2Decision, BlindJudgeV2Decision];
  const initial = resolveBlindConsensusV2(packet, judgePair);
  if (initial.status !== "arbitration-required") throw new Error(`${packet.packetId} does not require arbitration`);

  const requestedModel = EXPERIMENT_CONFIG.blindAudit.arbitratorModel;
  const decision = createInSessionCodexArbitrationDecisionV2(packet, output, requestedModel);
  const resolved = resolveBlindConsensusV2(packet, judgePair, decision);
  if (resolved.status !== "resolved") throw new Error(`${packet.packetId} fallback did not resolve arbitration`);
  const cacheKey = blindAuditV2DecisionCacheKey(packet, "arbitrator", requestedModel, judgePair);
  const cacheFile = path.join(cacheDir, `${sha256(cacheKey)}.json`);
  await writeJsonAtomic(cacheFile, decision);

  const state = await loadRunState();
  let unobservedTimeoutEvent = undefined;
  if (process.argv.includes("--record-unobserved-timeout")) {
    const prior = [...state.costEvents].reverse().find((event) => event.eventId.startsWith(packet.packetId)
      && event.stage === "blind-arbitrator-v2");
    const startedAt = prior?.completedAt ?? new Date().toISOString();
    const completedAt = new Date(new Date(startedAt).getTime() + 180_000).toISOString();
    const rubric = await readFile(path.resolve("experiments/search-e2e-evaluation/co-v2/config/blind-judge-arbitration-rubric-v2.md"), "utf8");
    const arbitrationInput = { packet, arbitrationReasons: initial.arbitrationReasons,
      judgeOutputs: judgePair.map((judge) => ({ judgeId: judge.judgeId, output: judge.output })) };
    const estimatedInputTokens = Math.ceil((rubric.length + JSON.stringify(arbitrationInput).length) / 3);
    unobservedTimeoutEvent = priceCostEvent({
      eventId: `${packet.packetId}:blind-arbitrator-v2:arbitrator-schema-repair-unobserved-timeout`,
      runId: state.runId, ledger: "evaluation-overhead", arm: "shared-evaluation",
      stage: "blind-arbitrator-v2", provider: "openrouter", requestedModel,
      actualModel: "deepseek/deepseek-v4-pro", startedAt, completedAt, latencyMs: 180_000,
      attempts: 1, retries: 0, fallbackUsed: true, status: "failed",
      usage: { inputTokens: estimatedInputTokens, outputTokens: 8_192 },
      volume: { inputItems: 1, rawOutputItems: 0, validOutputItems: 0, downstreamUsedItems: 0,
        discardedReasonCounts: { timeout: 1 } },
      notes: ["response body timed out before usage telemetry", "token usage is a conservative upper-bound estimate",
        "account cash cost remains unavailable; budget uses official list-price estimate"],
    }, rateCardJson as ExperimentRateCard);
    if (!state.costEvents.some((event) => event.eventId === unobservedTimeoutEvent!.eventId)) {
      state.costEvents.push(unobservedTimeoutEvent);
    }
  }
  if (!state.costEvents.some((event) => event.eventId === decision.costEvent.eventId)) {
    state.costEvents.push(decision.costEvent);
    await saveRunState(state);
  }
  const publicDecision = { ...decision, raw: undefined };
  await writeJsonAtomic(path.join(artifactRunRoot(), `blind-audit/in-session-fallback/${packet.packetId}.json`), {
    schemaVersion: 1, runId: state.runId, arbitrationReasons: initial.arbitrationReasons,
    decision: publicDecision, ...(unobservedTimeoutEvent ? { precedingUnobservedTimeout: unobservedTimeoutEvent } : {}),
  });
  console.log(JSON.stringify({ status: "imported", packetId: packet.packetId,
    arbitrationReasons: initial.arbitrationReasons, cacheFile, eventId: decision.costEvent.eventId }, null, 2));
}

await main();
