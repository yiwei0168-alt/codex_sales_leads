import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { blindAuditV2DecisionCacheKey, createInSessionCodexArbitrationDecisionV2,
  resolveBlindConsensusV2, type BlindAuditV2Packet, type BlindJudgeV2Decision } from "../lib/blind-audit-v2";
import { EXPERIMENT_CONFIG } from "../lib/experiment";
import { artifactRunRoot, loadRunState, rawRunRoot, saveRunState, writeJsonAtomic } from "../lib/run-store";
import { blindJudgeV2OutputSchema } from "../lib/runtime-schemas";

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
  if (!state.costEvents.some((event) => event.eventId === decision.costEvent.eventId)) {
    state.costEvents.push(decision.costEvent);
    await saveRunState(state);
  }
  const publicDecision = { ...decision, raw: undefined };
  await writeJsonAtomic(path.join(artifactRunRoot(), `blind-audit/in-session-fallback/${packet.packetId}.json`), {
    schemaVersion: 1, runId: state.runId, arbitrationReasons: initial.arbitrationReasons,
    decision: publicDecision,
  });
  console.log(JSON.stringify({ status: "imported", packetId: packet.packetId,
    arbitrationReasons: initial.arbitrationReasons, cacheFile, eventId: decision.costEvent.eventId }, null, 2));
}

await main();
