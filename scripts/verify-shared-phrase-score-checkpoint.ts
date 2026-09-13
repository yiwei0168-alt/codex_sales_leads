import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

import { getPool } from "../src/lib/rag/db";
import { leadEvidenceContentHash } from "../src/lib/leads/evidence-snapshot";
import { buildLeadWorkflowGraph, type LeadWorkflowDependencies } from "../src/lib/leads/workflow/graph";
import { LeadQualificationAgent } from "../src/lib/leads/workflow/qualification-agent";
import { checkpointInvocation, WorkflowPausedError } from "../src/lib/leads/workflow/pause";
import { DeepSeekProvider } from "../src/providers/deepseek";
import type { AiProvider, StructuredAiRequest, StructuredAiResponse } from "../src/providers/contracts";
import { assessment, candidate, correctedCandidate, plan, playbook } from "./workflow-recovery-fixtures";

// Synthetic business adapters and an in-memory model response; only the graph/checkpointer write SQL.
const mode = process.argv[2];
const threadId = process.argv[3] ?? `verify-phrase-score:${randomUUID()}`;
if (!/^verify-phrase-score:[a-f0-9-]{36}$/.test(threadId)) throw new Error("Invalid isolated verification thread");
if (mode && !["seed", "resume"].includes(mode)) throw new Error("Invalid verification phase");
const saver = new PostgresSaver(getPool(), undefined, { schema: "langgraph" });
const config = { configurable: { thread_id: threadId } };
const runId = "synthetic-phrase-score-run";
const originalEvidence = { ...candidate.evidence[0], evidenceRunId: runId, freshnessStatus: "fresh" as const,
  contentHash: leadEvidenceContentHash(candidate.evidence[0].excerpt) };
const extraEvidence = Array.from({ length: 100 }, (_, index) => {
  const excerpt = `Evidence ${index}: ${`independent networking fact ${index} `.repeat(7).trim()}`;
  return { ...originalEvidence, id: `unique-${index}`, url: `https://fixture.invalid/evidence/${index}`,
    title: `Unique source ${index}`, excerpt, contentHash: leadEvidenceContentHash(excerpt) };
});
const extraFindings = extraEvidence.map((item, index) => ({ ...correctedCandidate.correction.findings[0],
  findingId: `unique-finding-${index}`, statement: `Distinct product and customer fact ${index}: ${item.excerpt.slice(0, 90)}`,
  evidenceIds: [item.id] }));
const corrected = { ...correctedCandidate, evidenceSnapshotRunId: runId,
  evidence: [originalEvidence, ...extraEvidence], correction: { ...correctedCandidate.correction,
    findings: [...correctedCandidate.correction.findings,
      ...Array.from({ length: 4 }, (_, index) => ({ ...correctedCandidate.correction.findings[0],
        findingId: `base-finding-${index}` })), ...extraFindings] } };
const fullPlan = { ...plan, targetCount: 1 };
const wire = new DeepSeekProvider({ apiKey: "fixture-never-sent", maxAttempts: 1,
  fetchImplementation: async () => { throw new Error("External transport is forbidden"); } });
const calls: StructuredAiRequest<unknown>[] = [];
const provider: AiProvider = {
  id: "synthetic-score",
  requestBytes: request => wire.requestBytes(request),
  cacheIdentity: request => wire.cacheIdentity(request),
  execute: async <I, O>(request: StructuredAiRequest<I>): Promise<StructuredAiResponse<O>> => {
    calls.push(request as StructuredAiRequest<unknown>);
    assert.equal(mode, "resume");
    assert.match(request.preparation?.encoding ?? "", /exact-shared-phrase-v1/);
    assert.ok(wire.requestBytes(request) <= 61_440);
    assert.equal(request.preparation?.preparedMaximumWireBytes, wire.requestBytes(request));
    const dimensionRationales = Object.entries(assessment.dimensions).map(([dimension, score]) => ({
      dimension, score, reason: "Synthetic cited scoring rationale.",
      findingIds: ["finding-distribution"], evidenceIds: [originalEvidence.id], confidence: 85,
    }));
    return { output: { assessments: [{ ...assessment, dimensionRationales,
      escalation: { required: false, expectedTotalScoreChange: 0, criticalStateChanges: [],
        higherCapabilityCanResolve: false, reason: "" } }] } as O,
      modelVersion: request.modelVersion, promptVersion: request.promptVersion, latencyMs: 0, warnings: [] };
  },
};
const agent = new LeadQualificationAgent(provider, { batchSize: 1, concurrency: 1 });
const expectedContract = agent.cacheContracts([corrected], playbook, fullPlan.countryCode,
  fullPlan.countryName, fullPlan.objective);
assert.notDeepEqual(expectedContract, agent.cacheContracts([corrected], playbook, "MX", "Mexico", fullPlan.objective));
const changedExcerpt = `${corrected.evidence[0].excerpt} Changed fact.`;
const changedEvidence = [{ ...corrected.evidence[0], excerpt: changedExcerpt,
  contentHash: leadEvidenceContentHash(changedExcerpt) }, ...corrected.evidence.slice(1)];
assert.notDeepEqual(expectedContract, agent.cacheContracts([{ ...corrected, evidence: changedEvidence }],
  playbook, fullPlan.countryCode, fullPlan.countryName, fullPlan.objective));
const counters = { scores: 0, persisted: 0 };
let finalQualified: number | null = null;
const forbidden = async (): Promise<never> => { throw new Error("Completed stage replayed"); };
const deps: LeadWorkflowDependencies = {
  retrieveRagContext: forbidden, buildPlaybook: forbidden, discover: forbidden, collectEvidence: forbidden,
  correctionAgent: { correct: forbidden }, qualificationAgent: {
    evaluate: async (...args) => {
      counters.scores++;
      return agent.evaluate(...args);
    },
    evaluateWithUsage: async (...args) => {
      counters.scores++;
      return agent.evaluateWithUsage(...args);
    },
    cacheContracts: (...args) => agent.cacheContracts(...args),
    completedCacheContracts: value => agent.completedCacheContracts(value),
  },
  assessmentReviewAgent: { review: async (_items, assessments) => ({ assessments, reviews: [], warnings: [] }) },
  handoffAssembler: { assemble: () => [] },
  updatePhase: async (_user, _action, phase) => {
    if (mode === "seed" && phase === "scoring") throw new WorkflowPausedError();
  },
  persist: async input => {
    counters.persisted++;
    assert.equal(input.candidates[0].evidence.length, 101);
    assert.equal(input.candidates[0].correction.findings.length, 105);
    assert.equal(input.creditsUsed, 13);
    assert.match(input.modelUsage.at(-1)?.requestPreparation?.encoding ?? "", /exact-shared-phrase-v1/);
    assert.equal(input.assessments.length, 1);
    assert.equal(input.assessments[0].scoringStatus, "completed");
    const accepted = input.assessments.filter(item => item.eligible && item.eligibilityStatus === "eligible").length;
    return { runId: threadId, countryCode: fullPlan.countryCode, countryName: fullPlan.countryName,
      requested: 1, discovered: 1, assessed: 1, qualified: accepted, accepted,
      creditsUsed: 13, ragCitationCount: 0, graphThreadId: threadId, warnings: [] };
  },
};
try {
  if (!mode) {
    for (const phase of ["seed", "resume"]) {
      const child = spawnSync(process.execPath,
        ["scripts/run-tsx.cjs", "scripts/verify-shared-phrase-score-checkpoint.ts", phase, threadId],
        { encoding: "utf8", windowsHide: true, timeout: 60000, env: process.env });
      if (child.status !== 0) throw new Error(`Phrase-score ${phase} failed: ${child.stderr}`);
      process.stdout.write(child.stdout);
    }
    console.log(JSON.stringify({ postgresTwoProcesses: true, fullScoringAgentAfterResume: true,
      exactSharedPhraseEncoding: true, savedEvidence: 101, savedFindings: 105,
      priorCreditsPreserved: 13, finalQualified: 0, paidProviderCalls: 0,
      businessPersistence: "synthetic-adapter-only" }));
  } else {
    const graph = buildLeadWorkflowGraph(deps, saver);
    if (mode === "seed") {
      await graph.updateState(config, { userId: "synthetic-owner", actionId: "synthetic-action",
        graphThreadId: threadId, workspaceId: "synthetic-workspace", plan: fullPlan, phase: "routing",
        runId: threadId, playbook, ragContext: [], candidates: [corrected],
        correctedCandidates: [corrected], assessments: [], assessmentReviews: [], handoffs: [],
        creditsUsed: 13, modelUsage: [], stageMetrics: [], warnings: [] }, "route_candidates");
      await assert.rejects(graph.invoke(null, config), WorkflowPausedError);
      const snapshot = await graph.getState(config);
      assert.deepEqual(snapshot.next, ["score_candidates"]);
      assert.equal(snapshot.values.creditsUsed, 13);
      assert.equal(snapshot.values.correctedCandidates[0].correction.findings.length, 105);
      assert.deepEqual(counters, { scores: 0, persisted: 0 });
    } else {
      const snapshot = await graph.getState(config);
      assert.equal(checkpointInvocation(snapshot, "synthetic-owner", "synthetic-action", fullPlan), "resume");
      assert.throws(() => checkpointInvocation(snapshot, "other-owner", "synthetic-action"), /ownership/);
      assert.throws(() => checkpointInvocation(snapshot, "synthetic-owner", "other-action"), /ownership/);
      assert.deepEqual(snapshot.next, ["score_candidates"]);
      assert.deepEqual(snapshot.values.correctedCandidates[0].evidence, corrected.evidence);
      assert.deepEqual(snapshot.values.correctedCandidates[0].correction.findings, corrected.correction.findings);
      const result = await graph.invoke(null, config);
      assert.equal(result.result?.accepted,
        result.assessments.filter(item => item.eligible && item.eligibilityStatus === "eligible").length);
      finalQualified = result.result?.accepted ?? null;
      assert.equal(finalQualified, 0);
      assert.equal(result.creditsUsed, 13);
      assert.deepEqual(agent.completedCacheContracts(result.assessments), expectedContract);
      assert.equal(calls.length, 1);
      assert.deepEqual(counters, { scores: 1, persisted: 1 });
    }
    console.log(JSON.stringify({ phase: mode, ...counters, fakeModelCalls: calls.length, finalQualified }));
  }
} finally {
  if (!mode) await saver.deleteThread(threadId);
  await saver.end();
}
