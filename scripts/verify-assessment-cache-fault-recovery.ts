import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { getPool } from "../src/lib/rag/db";
import { buildLeadWorkflowGraph, type LeadWorkflowDependencies } from "../src/lib/leads/workflow/graph";
import { WorkflowPausedError } from "../src/lib/leads/workflow/pause";
import { plan, playbook, candidate, correctedCandidate, assessment } from "./workflow-recovery-fixtures";

// Isolated synthetic adapters with the production graph serializer and PostgreSQL checkpointer.
// The generated thread is removed after the four separate processes finish.
const mode = process.argv[2];
const threadId = process.argv[3] ?? `verify-assessment-cache:${randomUUID()}`;
if (!/^verify-assessment-cache:[a-f0-9-]{36}$/.test(threadId)) throw new Error("Invalid isolated verification thread");
if (mode && !["seed", "read-failure", "write-failure", "resume"].includes(mode)) throw new Error("Invalid verification phase");
const saver = new PostgresSaver(getPool(), undefined, { schema: "langgraph" });
const config = { configurable: { thread_id: threadId } };
const calls = { cacheReads: 0, cacheWrites: 0, scoring: 0, review: 0, persistence: 0 };
const forbidden = async (): Promise<never> => { throw new Error("Completed or unrelated stage replayed"); };
const deps: LeadWorkflowDependencies = {
  retrieveRagContext: forbidden, buildPlaybook: forbidden, discover: forbidden, collectEvidence: forbidden,
  correctionAgent: { correct: forbidden },
  qualificationAgent: { evaluate: async (items) => {
    calls.scoring++;
    assert.equal(mode, "write-failure");
    assert.deepEqual(items.map(item => item.candidateId), [candidate.candidateId]);
    return [assessment];
  } },
  loadAssessmentCache: async () => {
    calls.cacheReads++;
    if (mode === "read-failure") throw new Error("Synthetic cache read unavailable");
    if (mode !== "write-failure") throw new Error("Scoring cache read was replayed");
    return new Map();
  },
  saveAssessmentCache: async () => {
    calls.cacheWrites++;
    throw new Error("Synthetic optional cache write unavailable");
  },
  assessmentReviewAgent: { review: async (_items, assessments) => {
    calls.review++;
    assert.equal(mode, "resume");
    return { assessments, reviews: [], warnings: [] };
  } },
  handoffAssembler: { assemble: () => [] },
  persist: async (input) => {
    calls.persistence++;
    assert.equal(mode, "resume");
    assert.equal(input.assessments[0]?.candidateId, candidate.candidateId);
    assert.equal(input.creditsUsed, 13);
    return { runId: threadId, countryCode: plan.countryCode, countryName: plan.countryName,
      requested: 1, discovered: 1, assessed: 1, qualified: 1, accepted: 1,
      creditsUsed: 13, ragCitationCount: 0, graphThreadId: threadId, warnings: [] };
  },
  updatePhase: async (_user, _action, phase) => {
    if (mode === "write-failure" && phase === "reviewing-scores") throw new WorkflowPausedError();
  },
};

try {
  if (!mode) {
    for (const phase of ["seed", "read-failure", "write-failure", "resume"]) {
      const child = spawnSync(process.execPath,
        ["scripts/run-tsx.cjs", "scripts/verify-assessment-cache-fault-recovery.ts", phase, threadId],
        { encoding: "utf8", windowsHide: true, timeout: 60000, env: process.env });
      if (child.status !== 0) throw new Error(`Assessment-cache ${phase} verification failed: ${child.stderr}`);
      process.stdout.write(child.stdout);
    }
    console.log(JSON.stringify({ postgresCrossProcessCheckpoint: true, cacheReadFailureBeforeScoring: true,
      optionalCacheWriteFailureAfterOneScore: true, completedScoreReplays: 0, priorCreditsPreserved: 13,
      realProviderCalls: 0, businessPersistence: "synthetic-adapters-only" }));
  } else {
    const graph = buildLeadWorkflowGraph(deps, saver);
    if (mode === "seed") {
      await graph.updateState(config, { userId: "synthetic-owner", actionId: "synthetic-action",
        graphThreadId: threadId, workspaceId: "synthetic-workspace", plan: { ...plan, targetCount: 1 },
        phase: "routing", runId: threadId, playbook, ragContext: [], candidates: [candidate],
        correctedCandidates: [correctedCandidate], assessments: [], assessmentReviews: [], handoffs: [],
        creditsUsed: 13, modelUsage: [], stageMetrics: [], warnings: [] }, "route_candidates");
      const snapshot = await graph.getState(config);
      assert.deepEqual(snapshot.next, ["score_candidates"]);
      assert.equal(snapshot.values.creditsUsed, 13);
    } else if (mode === "read-failure") {
      await assert.rejects(graph.invoke(null, config), /Synthetic cache read unavailable/);
      const snapshot = await graph.getState(config);
      assert.deepEqual(snapshot.next, ["score_candidates"]);
      assert.equal(snapshot.values.creditsUsed, 13);
      assert.deepEqual(calls, { cacheReads: 1, cacheWrites: 0, scoring: 0, review: 0, persistence: 0 });
    } else if (mode === "write-failure") {
      await assert.rejects(graph.invoke(null, config), WorkflowPausedError);
      const snapshot = await graph.getState(config);
      assert.deepEqual(snapshot.next, ["review_assessment_anomalies"]);
      assert.equal(snapshot.values.assessments[0]?.candidateId, candidate.candidateId);
      assert.equal(snapshot.values.creditsUsed, 13);
      assert.equal(snapshot.values.stageMetrics.at(-1)?.metadata?.cachePersistenceFailed, true);
      assert.deepEqual(calls, { cacheReads: 1, cacheWrites: 1, scoring: 1, review: 0, persistence: 0 });
    } else {
      const before = await graph.getState(config);
      assert.deepEqual(before.next, ["review_assessment_anomalies"]);
      const result = await graph.invoke(null, config);
      assert.equal(result.result?.accepted, 1);
      assert.equal(result.creditsUsed, 13);
      assert.deepEqual(calls, { cacheReads: 0, cacheWrites: 0, scoring: 0, review: 1, persistence: 1 });
    }
    console.log(JSON.stringify({ phase: mode, ...calls }));
  }
} finally {
  if (!mode) await saver.deleteThread(threadId);
  await saver.end();
}
