import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { getPool } from "../src/lib/rag/db";
import { buildLeadWorkflowGraph, type LeadWorkflowDependencies } from "../src/lib/leads/workflow/graph";
import { checkpointInvocation } from "../src/lib/leads/workflow/pause";
import { plan, playbook, candidate, correctedCandidate, assessment } from "./workflow-recovery-fixtures";

// No provider adapters are reachable. Only generated verification threads are written/deleted.
const mode = process.argv[2];
const threadId = process.argv[3] ?? `verify-processing:${randomUUID()}`;
if (!/^verify-processing:[a-f0-9-]{36}$/.test(threadId)) throw new Error("Invalid isolated verification thread");
const saver = new PostgresSaver(getPool(), undefined, { schema: "langgraph" });
const config = { configurable: { thread_id: threadId } };
const counters = { correction: 0, scoring: 0, persisted: 0 };
const forbidden = async (): Promise<never> => { throw new Error("Completed stage was replayed"); };
const deps: LeadWorkflowDependencies = {
  retrieveRagContext: forbidden, buildPlaybook: forbidden, discover: forbidden, collectEvidence: forbidden,
  updatePhase: async () => undefined,
  correctionAgent: { correct: async items => {
    counters.correction++;
    assert.deepEqual(items.map(item => item.candidateId), [candidate.candidateId]);
    assert.deepEqual(items[0].evidence, candidate.evidence);
    return { candidates: [{ ...correctedCandidate, correction: { ...correctedCandidate.correction,
      model: mode === "seed" ? "deterministic-fallback" : "fixture" } }], creditsUsed: 0, warnings: [] };
  } },
  qualificationAgent: { evaluate: async items => {
    counters.scoring++; assert.equal(mode, "resume");
    assert.deepEqual(items.map(item => item.candidateId), [candidate.candidateId]);
    return [assessment];
  } },
  assessmentReviewAgent: { review: async (_candidates, assessments) => ({ assessments, reviews: [], warnings: [] }) },
  handoffAssembler: { assemble: () => [] },
  persist: async input => {
    counters.persisted++; assert.equal(input.assessments.length, 1);
    return { runId: threadId, countryCode: plan.countryCode, countryName: plan.countryName, requested: 1,
      discovered: 1, assessed: 1, qualified: 1, accepted: 1, creditsUsed: input.creditsUsed,
      ragCitationCount: 0, graphThreadId: threadId, warnings: [] };
  },
};
try {
  if (!mode) {
    for (const phase of ["seed", "resume"]) {
      const child = spawnSync(process.execPath, ["scripts/run-tsx.cjs", "scripts/verify-processing-recovery.ts", phase, threadId],
        { encoding: "utf8", windowsHide: true, timeout: 60000, env: process.env });
      if (child.status !== 0) throw new Error(`Recovery ${phase} verification failed: ${child.stderr}`);
      process.stdout.write(child.stdout);
    }
    console.log(JSON.stringify({ postgresCrossProcessRecovery: true, completedStagesReplayed: 0,
      ownerAndActionChecked: true, creditsPreserved: true, realProviderCalls: 0,
      businessPersistence: "synthetic-adapter-only" }));
  } else {
    const graph = buildLeadWorkflowGraph(deps, saver);
    if (mode === "seed") {
      await graph.updateState(config, { userId: "synthetic-owner", actionId: "synthetic-action", graphThreadId: threadId,
        workspaceId: "synthetic-workspace", plan: { ...plan, targetCount: 1 }, phase: "collecting-evidence",
        runId: threadId, playbook, ragContext: [], candidates: [candidate], correctedCandidates: [], assessments: [],
        assessmentReviews: [], handoffs: [], creditsUsed: 13, modelUsage: [], stageMetrics: [], warnings: [] }, "collect_evidence");
      await assert.rejects(graph.invoke(null, config), /校正或评分未完成/);
      assert.deepEqual(counters, { correction: 1, scoring: 0, persisted: 0 });
    } else if (mode === "resume") {
      const snapshot = await graph.getState(config);
      assert.equal(checkpointInvocation(snapshot, "synthetic-owner", "synthetic-action"), "resume");
      assert.throws(() => checkpointInvocation(snapshot, "other-owner", "synthetic-action"), /ownership/);
      assert.throws(() => checkpointInvocation(snapshot, "synthetic-owner", "other-action"), /ownership/);
      assert.deepEqual(snapshot.next, ["recover_incomplete_processing"]);
      assert.equal(snapshot.values.creditsUsed, 13);
      await assert.rejects(graph.invoke(null, config), /校正或评分未完成/);
      await graph.updateState(config, { processingRecoveryAuthorized: true }, "score_candidates");
      const result = await graph.invoke(null, config);
      assert.equal(result.result?.accepted, 1); assert.equal(result.creditsUsed, 13);
      assert.deepEqual(counters, { correction: 1, scoring: 1, persisted: 1 });
      assert.equal(checkpointInvocation(await graph.getState(config), "synthetic-owner", "synthetic-action"), "complete");
    } else throw new Error("Unknown verification phase");
    console.log(JSON.stringify({ phase: mode, ...counters }));
  }
} finally {
  if (!mode) await saver.deleteThread(threadId);
  await saver.end();
}
