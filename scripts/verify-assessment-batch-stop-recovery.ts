import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { getPool } from "../src/lib/rag/db";
import { buildLeadWorkflowGraph, type LeadWorkflowDependencies } from "../src/lib/leads/workflow/graph";
import { WorkflowProcessingIncompleteError } from "../src/lib/leads/workflow/processing-recovery";
import type { LeadCandidateAssessment } from "../src/lib/leads/workflow/types";
import { plan, playbook, candidate, correctedCandidate, assessment } from "./workflow-recovery-fixtures";

// Synthetic adapters only; production graph and PostgreSQL checkpointer. No paid transport is reachable.
const mode = process.argv[2];
const threadId = process.argv[3] ?? `verify-batch-stop:${randomUUID()}`;
if (!/^verify-batch-stop:[a-f0-9-]{36}$/.test(threadId)) throw new Error("Invalid isolated verification thread");
if (mode && !["seed", "cache-failure", "resume"].includes(mode)) throw new Error("Invalid verification phase");
const saver = new PostgresSaver(getPool(), undefined, { schema: "langgraph" });
const config = { configurable: { thread_id: threadId } };
const second = { ...candidate, candidateId: "lead-second", companyName: "Second GmbH", domain: "second.example",
  officialWebsiteUrl: "https://second.example/" };
const correctedSecond = { ...correctedCandidate, ...second, correction: { ...correctedCandidate.correction,
  originalCompanyName: second.companyName, originalDomain: second.domain,
  originalOfficialWebsiteUrl: second.officialWebsiteUrl } };
const assessedSecond = { ...assessment, candidateId: second.candidateId };
const deferred = { ...assessedSecond, eligible: false, eligibilityStatus: "research-required" as const,
  scoringStatus: "retry-required" as const };
const calls = { saveAttempts: 0, scoringInputs: [] as string[][], reviews: 0, persistence: 0 };
const forbidden = async (): Promise<never> => { throw new Error("Unrelated stage replayed"); };
const deps: LeadWorkflowDependencies = {
  retrieveRagContext: forbidden, buildPlaybook: forbidden, discover: forbidden, collectEvidence: forbidden,
  correctionAgent: { correct: forbidden }, loadAssessmentCache: async () => new Map(),
  saveAssessmentCache: async () => {
    calls.saveAttempts++;
    if (mode === "cache-failure") throw new Error("Synthetic batch cache unavailable");
  },
  qualificationAgent: { evaluate: forbidden,
    evaluateWithUsage: async (items, _playbook, _code, _name, _objective, onBatchCompleted) => {
      calls.scoringInputs.push(items.map(item => item.candidateId));
      if (mode === "cache-failure") {
        assert.deepEqual(calls.scoringInputs, [[candidate.candidateId, second.candidateId]]);
        await assert.rejects(onBatchCompleted!([correctedCandidate], [assessment]),
          /Synthetic batch cache unavailable/);
        return { assessments: [assessment, deferred], usage: [] };
      }
      assert.equal(mode, "resume");
      assert.deepEqual(calls.scoringInputs, [[second.candidateId]]);
      return { assessments: [assessedSecond], usage: [] };
    } },
  assessmentReviewAgent: { review: async (_items, assessments) => {
    calls.reviews++;
    return { assessments, reviews: [], warnings: [] };
  } },
  handoffAssembler: { assemble: () => [] },
  persist: async input => {
    calls.persistence++;
    assert.deepEqual(input.assessments.map(item => item.candidateId), [candidate.candidateId, second.candidateId]);
    assert.equal(input.creditsUsed, 13);
    return { runId: threadId, countryCode: plan.countryCode, countryName: plan.countryName,
      requested: 2, discovered: 2, assessed: 2, qualified: 2, accepted: 2,
      creditsUsed: 13, ragCitationCount: 0, graphThreadId: threadId, warnings: [] };
  },
  updatePhase: async () => undefined,
};
try {
  if (!mode) {
    for (const phase of ["seed", "cache-failure", "resume"]) {
      const child = spawnSync(process.execPath,
        ["scripts/run-tsx.cjs", "scripts/verify-assessment-batch-stop-recovery.ts", phase, threadId],
        { encoding: "utf8", windowsHide: true, timeout: 60000, env: process.env });
      if (child.status !== 0) throw new Error(`Batch-stop ${phase} failed: ${child.stderr}`);
      process.stdout.write(child.stdout);
    }
    console.log(JSON.stringify({ postgresCrossProcessCheckpoint: true, completedScoreReplays: 0,
      resumedOnlyMissingCandidate: true, priorCreditsPreserved: 13, realProviderCalls: 0,
      businessPersistence: "synthetic-adapters-only" }));
  } else {
    const graph = buildLeadWorkflowGraph(deps, saver);
    if (mode === "seed") {
      await graph.updateState(config, { userId: "synthetic-owner", actionId: "synthetic-action",
        graphThreadId: threadId, workspaceId: "synthetic-workspace", plan: { ...plan, targetCount: 2 },
        phase: "routing", runId: threadId, playbook, ragContext: [], candidates: [candidate, second],
        correctedCandidates: [correctedCandidate, correctedSecond], assessments: [], assessmentReviews: [],
        handoffs: [], creditsUsed: 13, modelUsage: [], stageMetrics: [], warnings: [] }, "route_candidates");
      assert.deepEqual((await graph.getState(config)).next, ["score_candidates"]);
    } else if (mode === "cache-failure") {
      await assert.rejects(graph.invoke(null, config), WorkflowProcessingIncompleteError);
      const snapshot = await graph.getState(config);
      assert.deepEqual(snapshot.next, ["recover_incomplete_processing"]);
      assert.deepEqual(snapshot.values.assessments.map((item: LeadCandidateAssessment) => item.scoringStatus), ["completed", "retry-required"]);
      assert.equal(snapshot.values.stageMetrics.at(-1)?.metadata?.scoringIncomplete, 1);
      assert.equal(snapshot.values.stageMetrics.at(-1)?.metadata?.cachePersistenceFailed, true);
      assert.equal(snapshot.values.creditsUsed, 13);
      assert.deepEqual(calls, { saveAttempts: 1, scoringInputs: [[candidate.candidateId, second.candidateId]],
        reviews: 0, persistence: 0 });
    } else {
      const before = await graph.getState(config);
      assert.deepEqual(before.next, ["recover_incomplete_processing"]);
      await graph.updateState(config, { processingRecoveryAuthorized: true }, "score_candidates");
      const result = await graph.invoke(null, config);
      assert.equal(result.result?.accepted, 2);
      assert.deepEqual(result.assessments.map(item => item.candidateId), [candidate.candidateId, second.candidateId]);
      assert.equal(result.creditsUsed, 13);
      assert.deepEqual(calls, { saveAttempts: 1, scoringInputs: [[second.candidateId]], reviews: 1, persistence: 1 });
    }
    console.log(JSON.stringify({ phase: mode, ...calls }));
  }
} finally {
  if (!mode) await saver.deleteThread(threadId);
  await saver.end();
}
