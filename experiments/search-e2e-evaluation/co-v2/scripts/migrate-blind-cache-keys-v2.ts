import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { blindAuditRoleFamily, blindAuditV2DecisionCacheKey, type BlindAuditV2Packet,
  type BlindJudgeV2Decision } from "../lib/blind-audit-v2";
import { priceCostEvent, type ExperimentRateCard } from "../lib/cost-ledger";
import { EXPERIMENT_CONFIG } from "../lib/experiment";
import { artifactRunRoot, loadRunState, rawRunRoot, saveRunState, writeJsonAtomic } from "../lib/run-store";
import rateCardJson from "../config/official-rate-card.v1.json";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const startedAt = new Date().toISOString();
const started = Date.now();
const packetSet = JSON.parse(await readFile(path.join(artifactRunRoot(), "blind-audit/packets-v2.1.json"), "utf8")) as
  { packets: BlindAuditV2Packet[] };
const cacheDir = path.join(rawRunRoot(), "blind-audit/cache");
const entries = await Promise.all((await readdir(cacheDir)).filter((name) => name.endsWith(".json"))
  .map(async (name) => ({ name, decision: JSON.parse(await readFile(path.join(cacheDir, name), "utf8")) as BlindJudgeV2Decision })));
let written = 0;
let reused = 0;
for (const packet of packetSet.packets) {
  const judges = ["judge-a", "judge-b"].map((judgeId) => entries.find(({ decision }) =>
    decision.packetId === packet.packetId && decision.judgeId === judgeId)?.decision);
  const arbitrator = entries.find(({ decision }) => decision.packetId === packet.packetId
    && decision.judgeId === "arbitrator")?.decision;
  if (!arbitrator) continue;
  if (!judges[0] || !judges[1]) throw new Error(`${packet.packetId} arbitrator has missing judge dependencies`);
  const normalizedJudges = judges.map((decision) => {
    const roleFamily = blindAuditRoleFamily(decision!.output.primaryRole);
    return { ...decision!, roleFamily, requestedCategoryFamilyMatch: roleFamily === packet.requestedRoleFamily };
  }) as [BlindJudgeV2Decision, BlindJudgeV2Decision];
  const key = blindAuditV2DecisionCacheKey(packet, "arbitrator", EXPERIMENT_CONFIG.blindAudit.arbitratorModel,
    normalizedJudges);
  const target = path.join(cacheDir, `${sha256(key)}.json`);
  if (entries.some(({ name }) => path.join(cacheDir, name) === target)) reused += 1;
  else {
    const roleFamily = blindAuditRoleFamily(arbitrator.output.primaryRole);
    await writeJsonAtomic(target, { ...arbitrator, roleFamily,
      requestedCategoryFamilyMatch: roleFamily === packet.requestedRoleFamily });
    written += 1;
  }
}

const state = await loadRunState();
const completedAt = new Date().toISOString();
const event = priceCostEvent({ eventId: "blind-cache-key-migration-v2.0.22", runId: state.runId,
  ledger: "evaluation-overhead", arm: "shared-evaluation", stage: "blind-cache-key-migration-v2",
  provider: "deterministic-local", startedAt, completedAt, latencyMs: Date.now() - started,
  attempts: 1, retries: 0, fallbackUsed: false, status: "completed", usage: {},
  volume: { inputItems: entries.length, rawOutputItems: written + reused, validOutputItems: written + reused,
    downstreamUsedItems: written + reused, discardedReasonCounts: {} }, accountCashCostUsd: 0,
  notes: ["cache keys depend on immutable judge output, not derived role-family fields",
    "semantic outputs, scores, evidence and prior cost events are unchanged"],
}, rateCardJson as ExperimentRateCard);
if (!state.costEvents.some((item) => item.eventId === event.eventId)) {
  state.costEvents.push(event);
  await saveRunState(state);
}
const artifact = { schemaVersion: 1, runId: state.runId, generatedAt: completedAt,
  inputCacheEntries: entries.length, arbitratorKeysWritten: written, arbitratorKeysReused: reused, costEvent: event };
await writeJsonAtomic(path.join(artifactRunRoot(), "blind-audit/cache-key-migration-v2.0.22.json"), artifact);
console.log(JSON.stringify(artifact, null, 2));
