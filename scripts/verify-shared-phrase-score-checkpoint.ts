import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import nextEnv from "@next/env";
import { Pool } from "pg";

import { getPool } from "../src/lib/rag/db";
import { databaseConnectionString, databaseSslConfiguration } from "../src/lib/rag/database-ssl";
import { leadEvidenceContentHash } from "../src/lib/leads/evidence-snapshot";
import { assessmentDependencyFingerprint } from "../src/lib/leads/workflow/assessment-cache";
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
if (mode && !["seed", "resume", "sql", "sql-resume"].includes(mode)) throw new Error("Invalid verification phase");
const foldedVariant = process.env.P06_SYNTHETIC_FOLD_VARIANT === "1";
const foldedTableVariant = foldedVariant && process.env.P06_SYNTHETIC_FOLD_COUNT === "110";
const expectedEncoding = foldedTableVariant ? "supported-excerpt-fold-v1+exact-field-table-v1"
  : foldedVariant ? "supported-excerpt-fold-v1" : "exact-shared-phrase-v1";
function assertEncoding(value: string | undefined): void {
  if (foldedTableVariant) assert.ok(value?.startsWith(expectedEncoding));
  else if (foldedVariant) assert.equal(value, expectedEncoding);
  else assert.match(value ?? "", /exact-shared-phrase-v1/);
}
const extraCount = foldedTableVariant ? 110 : foldedVariant ? 55 : 100;
const expectedEvidenceCount = extraCount + 1;
const expectedFindingCount = extraCount + correctedCandidate.correction.findings.length
  + (foldedVariant ? 0 : 4);
const saver = new PostgresSaver(getPool(), undefined, { schema: "langgraph" });
const config = { configurable: { thread_id: threadId } };
const runId = "synthetic-phrase-score-run";
const originalEvidence = { ...candidate.evidence[0], evidenceRunId: runId, freshnessStatus: "fresh" as const,
  contentHash: leadEvidenceContentHash(candidate.evidence[0].excerpt) };
const extraEvidence = Array.from({ length: extraCount }, (_, index) => {
  const excerpt = foldedVariant
    ? Array.from({ length: 9 }, (_, part) => createHash("sha256")
      .update(`independent-${index}-${part}`).digest("hex")).join(" ")
    : `Evidence ${index}: ${`independent networking fact ${index} `.repeat(7).trim()}`;
  return { ...originalEvidence, id: `unique-${index}`, url: `https://fixture.invalid/evidence/${index}`,
    title: `Unique source ${index}`, excerpt, contentHash: leadEvidenceContentHash(excerpt) };
});
const extraFindings = extraEvidence.map((item, index) => ({ ...correctedCandidate.correction.findings[0],
  findingId: `unique-finding-${index}`, statement: foldedVariant
    ? `Fact ${index + 5}: ${createHash("sha256").update(`finding-${index + 5}`).digest("hex")}`
    : `Distinct product and customer fact ${index}: ${item.excerpt.slice(0, 90)}`,
  status: index === 25 && foldedVariant ? "conflicting" as const : "supported" as const,
  evidenceIds: [item.id] }));
const corrected = { ...correctedCandidate, evidenceSnapshotRunId: runId,
  evidence: [originalEvidence, ...extraEvidence], correction: { ...correctedCandidate.correction,
    findings: [...correctedCandidate.correction.findings,
      ...Array.from({ length: foldedVariant ? 0 : 4 }, (_, index) => ({ ...correctedCandidate.correction.findings[0],
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
    assert.ok(mode === "resume" || mode === "sql-resume");
    assertEncoding(request.preparation?.encoding);
    assert.ok(wire.requestBytes(request) <= 61_440);
    assert.equal(request.preparation?.preparedMaximumWireBytes, wire.requestBytes(request));
    if (foldedVariant) {
      assert.ok((request.preparation?.omittedEvidenceExcerpts ?? 0) > 0);
      assert.deepEqual(request.evidenceIds, corrected.evidence.map(item => item.id));
      const input = request.input as { sharedPhraseDictionary?:Record<string,string>;
        candidates: Array<{ findings?: typeof corrected.correction.findings;
          evidence?: Array<{ evidenceId: string; url: string; excerpt: string; excerptFolded?: boolean }>;
          evidenceTable?:{columns:string[];rows:unknown[][]};
          findingsTable?:{columns:string[];rows:unknown[][]} }> };
      const expand=(value:unknown)=>typeof value==="string"
        ?Object.entries(input.sharedPhraseDictionary??{}).reduce((text,[marker,phrase])=>
          text.replaceAll(marker,phrase),value):value;
      const decode=(table:{columns:string[];rows:unknown[][]})=>table.rows.map(row=>
        Object.fromEntries(table.columns.map((column,index)=>[column,expand(row[index])])));
      const evidence=foldedTableVariant ? decode(input.candidates[0].evidenceTable!) : input.candidates[0].evidence!;
      const findings=foldedTableVariant ? decode(input.candidates[0].findingsTable!) : input.candidates[0].findings!;
      assert.deepEqual(findings, corrected.correction.findings);
      assert.deepEqual(evidence.map(item => item.evidenceId), corrected.evidence.map(item => item.id));
      assert.deepEqual(evidence.map(item => item.url), corrected.evidence.map(item => item.url));
      assert.equal(evidence.find(item => item.evidenceId === "unique-25")?.excerpt,
        corrected.evidence.find(item => item.id === "unique-25")?.excerpt);
      assert.ok(evidence.some(item => item.excerptFolded));
    }
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
if (foldedVariant) {
  const source = corrected.evidence.find(item => item.id === "unique-0");
  assert.ok(source);
  const excerpt = `${source.excerpt.slice(0, -1)}X`;
  const revised = corrected.evidence.map(item => item.id === source.id
    ? { ...item, excerpt, contentHash: leadEvidenceContentHash(excerpt) } : item);
  const context = { countryCode: fullPlan.countryCode, countryName: fullPlan.countryName,
    executionContract: expectedContract.get(corrected.candidateId) ?? "" };
  assert.notEqual(assessmentDependencyFingerprint({ ...corrected, evidence: revised }, playbook,
    fullPlan.objective, context), assessmentDependencyFingerprint(corrected, playbook,
    fullPlan.objective, context));
}
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
    assert.equal(input.candidates[0].evidence.length, expectedEvidenceCount);
    assert.equal(input.candidates[0].correction.findings.length, expectedFindingCount);
    assert.equal(input.creditsUsed, 13);
    assertEncoding(input.modelUsage.at(-1)?.requestPreparation?.encoding);
    assert.equal(input.assessments.length, 1);
    assert.equal(input.assessments[0].scoringStatus, "completed");
    const accepted = input.assessments.filter(item => item.eligible && item.eligibilityStatus === "eligible").length;
    return { runId: threadId, countryCode: fullPlan.countryCode, countryName: fullPlan.countryName,
      requested: 1, discovered: 1, assessed: 1, qualified: accepted, accepted,
      creditsUsed: 13, ragCitationCount: 0, graphThreadId: threadId, warnings: [] };
  },
};

async function verifyProductSql(): Promise<void> {
  nextEnv.loadEnvConfig(process.cwd());
  const appUrl = process.env.DATABASE_URL;
  const migrationUrl = process.env.DATABASE_MIGRATION_URL;
  if (!appUrl || !migrationUrl) throw new Error("Both database connections are required");
  const app = new URL(appUrl);
  const migration = new URL(migrationUrl);
  if (app.hostname !== migration.hostname || (app.port || "5432") !== (migration.port || "5432")
    || app.pathname !== migration.pathname) throw new Error("Database target mismatch");
  const admin = new Pool({ connectionString: databaseConnectionString(migrationUrl),
    ssl: databaseSslConfiguration(migrationUrl) });
  const { tenantQuery } = await import("../src/lib/rag/db");
  const { persistLeadWorkflowResult, updateWorkflowPhase } = await import("../src/lib/leads/workflow/persistence");
  const userId = randomUUID(), otherUserId = randomUUID(), workspaceId = randomUUID();
  const actionId = randomUUID(), runId = randomUUID(), conversationId = randomUUID();
  const domain = `phrase-score-${randomUUID()}.fixture.invalid`;
  const sqlCorrected = { ...corrected, companyName: "Phrase SQL Fixture", domain,
    officialWebsiteUrl: `https://${domain}/`, evidenceSnapshotRunId: runId,
    evidence: corrected.evidence.map(item => ({ ...item, evidenceRunId: runId })),
    correction: { ...corrected.correction, originalCompanyName: "Phrase SQL Fixture",
      originalDomain: domain, originalOfficialWebsiteUrl: `https://${domain}/` } };
  let created = false;
  try {
    const client = await admin.connect();
    try {
      await client.query("begin");
      for (const id of [userId, otherUserId]) await client.query(
        "insert into app_user(id,email,display_name,role,status) values($1,$2,'Phrase SQL fixture','member','disabled')",
        [id, `phrase-sql-${id}@fixture.invalid`]);
      await client.query("insert into market_workspace(id,owner_id,slug,name,market,country_code,objective) values($1,$2,'global-sales','Phrase SQL fixture','Global','WW','Synthetic')",
        [workspaceId, userId]);
      await client.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Phrase SQL fixture')",
        [conversationId, userId]);
      await client.query("insert into assistant_action(id,user_id,conversation_id,action_type,status,payload) values($1,$2,$3,'lead-search','running',$4)",
        [actionId, userId, conversationId, JSON.stringify(fullPlan)]);
      await client.query("insert into lead_search_run(id,workspace_id,provider,target_count,country_code,graph_thread_id,status) values($1,$2,'phrase-sql-fixture',1,'DE',$3,'running')",
        [runId, workspaceId, threadId]);
      await client.query("commit");
      created = true;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
    const graph = buildLeadWorkflowGraph({ ...deps, persist: persistLeadWorkflowResult,
      updatePhase: async (...args) => {
        await updateWorkflowPhase(...args);
        if (args[2] === "scoring") throw new WorkflowPausedError();
      } }, saver);
    await graph.updateState(config, { userId, actionId, graphThreadId: threadId,
      workspaceId, plan: fullPlan, phase: "routing", runId, playbook, ragContext: [],
      candidates: [sqlCorrected], correctedCandidates: [sqlCorrected], assessments: [],
      assessmentReviews: [], handoffs: [], creditsUsed: 0, modelUsage: [], stageMetrics: [],
      warnings: [] }, "route_candidates");
    await assert.rejects(graph.invoke(null, config), WorkflowPausedError);
    const beforeResume = await graph.getState(config);
    assert.deepEqual(beforeResume.next, ["score_candidates"]);
    assert.deepEqual(beforeResume.values.correctedCandidates[0].evidence, sqlCorrected.evidence);
    assert.deepEqual(beforeResume.values.correctedCandidates[0].correction.findings,
      sqlCorrected.correction.findings);
    assert.equal(beforeResume.values.creditsUsed, 0);
    assert.equal(calls.length, 0);
    const child = spawnSync(process.execPath,
      ["scripts/run-tsx.cjs", "scripts/verify-shared-phrase-score-checkpoint.ts",
        "sql-resume", threadId, userId, actionId],
      { encoding: "utf8", windowsHide: true, timeout: 60000, env: process.env });
    if (child.status !== 0) throw new Error(`Product SQL resume failed: ${child.stderr}`);
    const resumed = JSON.parse(child.stdout.trim()) as { sqlResumed: boolean; fakeModelCalls: number; accepted: number };
    assert.deepEqual(resumed, { sqlResumed: true, fakeModelCalls: 1, accepted: 0 });
    const completed = await graph.getState(config);
    assert.equal(completed.values.result?.accepted, 0);
    assert.equal(completed.values.assessments[0].scoringStatus, "completed");
    const assessments = await tenantQuery<{scoring_status:string;selected:boolean;eligible:boolean;
      evidence:unknown[];fact_ledger:unknown[]}>(userId,
      "select scoring_status,selected,eligible,evidence,fact_ledger from lead_candidate_assessment where run_id=$1",
      [runId]);
    assert.equal(assessments.length, 1);
    assert.equal(assessments[0].scoring_status, "completed");
    assert.equal(assessments[0].selected, false);
    assert.equal(assessments[0].eligible, false);
    assert.equal(assessments[0].evidence.length, expectedEvidenceCount);
    assert.equal(assessments[0].fact_ledger.length, expectedFindingCount);
    assert.deepEqual(assessments[0].evidence, JSON.parse(JSON.stringify(sqlCorrected.evidence)));
    assert.deepEqual(assessments[0].fact_ledger, JSON.parse(JSON.stringify(sqlCorrected.correction.findings)));
    const snapshots = await tenantQuery<{count:string}>(userId,
      "select count(*)::text as count from lead_evidence_snapshot where run_id=$1", [runId]);
    assert.equal(snapshots[0].count, String(expectedEvidenceCount));
    const run = await tenantQuery<{accepted_count:number;status:string;metadata:Record<string,unknown>}>(userId,
      "select accepted_count,status,metadata from lead_search_run where id=$1", [runId]);
    assert.equal(run[0].accepted_count, 0);
    assert.equal(run[0].status, "completed");
    assert.equal(run[0].metadata.assessmentCount, 1);
    const scoreMetrics = await tenantQuery<{input_items:number;valid_artifacts:number;
      downstream_used_artifacts:number;metadata:Record<string,unknown>}>(userId,
      "select input_items,valid_artifacts,downstream_used_artifacts,metadata from workflow_stage_metric where lead_run_id=$1 and stage='score_candidates'",
      [runId]);
    assert.equal(scoreMetrics.length, 1);
    assert.deepEqual([scoreMetrics[0].input_items, scoreMetrics[0].valid_artifacts,
      scoreMetrics[0].downstream_used_artifacts], [1, 1, 1]);
    const preparations = scoreMetrics[0].metadata.requestPreparations as Array<{
      encoding:string; omittedEvidenceExcerpts?:number}>;
    assert.equal(preparations.length, 1);
    assertEncoding(preparations[0].encoding);
    if (foldedVariant) assert.ok((preparations[0].omittedEvidenceExcerpts ?? 0) > 0);
    const usageRows = await tenantQuery<{stage:string;account_cash_cost_usd:string|null}>(userId,
      "select stage,account_cash_cost_usd::text from workflow_model_usage where lead_run_id=$1", [runId]);
    assert.equal(usageRows.length, 1);
    assert.equal(usageRows[0].stage, "qualification");
    assert.equal(usageRows[0].account_cash_cost_usd, null);
    assert.equal((await tenantQuery(userId,
      "select company_id from workspace_company_market where workspace_id=$1", [workspaceId])).length, 0);
    assert.equal((await tenantQuery(otherUserId,
      "select id from lead_candidate_assessment where run_id=$1", [runId])).length, 0);
    assert.equal((await tenantQuery(userId,
      "select id from paid_call_reservation where operation_id=$1", [actionId])).length, 0);
    console.log(JSON.stringify({ crossProcessProductSql: true, scored: 1, accepted: 0,
      encoding: expectedEncoding, evidenceSnapshots: expectedEvidenceCount,
      savedFacts: expectedFindingCount, scoreMetric: 1, modelUsage: 1,
      otherUserVisibleAssessments: 0,
      fakeModelCalls: resumed.fakeModelCalls, paidProviderCalls: 0 }));
  } finally {
    if (created) {
      const client = await admin.connect();
      try {
        await client.query("begin");
        const owners = await client.query("select id from app_user where id=any($1::uuid[]) and display_name='Phrase SQL fixture' and email='phrase-sql-'||id::text||'@fixture.invalid' for update",
          [[userId, otherUserId]]);
        if (owners.rowCount !== 2) throw new Error("Fixture identity mismatch");
        const paid = await client.query("select id from paid_call_reservation where user_id=$1", [userId]);
        if (paid.rowCount) throw new Error("Unexpected paid activity; preserve fixture");
        await client.query("delete from market_workspace where id=$1 and owner_id=$2", [workspaceId, userId]);
        await client.query("delete from app_user where id=any($1::uuid[])", [[userId, otherUserId]]);
        await client.query("delete from sales_company where domain=$1", [domain]);
        await client.query("commit");
        console.log("Synthetic phrase SQL fixture removed.");
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally { client.release(); }
    }
    await admin.end();
  }
}
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
      encoding: expectedEncoding, savedEvidence: expectedEvidenceCount,
      savedFindings: expectedFindingCount,
      priorCreditsPreserved: 13, finalQualified: 0, paidProviderCalls: 0,
      businessPersistence: "synthetic-adapter-only" }));
  } else if (mode === "sql") {
    await verifyProductSql();
  } else if (mode === "sql-resume") {
    const userId = process.argv[4], actionId = process.argv[5];
    if (!/^[a-f0-9-]{36}$/.test(userId ?? "") || !/^[a-f0-9-]{36}$/.test(actionId ?? ""))
      throw new Error("SQL resume fixture identity is missing");
    const { persistLeadWorkflowResult, updateWorkflowPhase } = await import("../src/lib/leads/workflow/persistence");
    const graph = buildLeadWorkflowGraph({ ...deps, persist: persistLeadWorkflowResult,
      updatePhase: updateWorkflowPhase }, saver);
    const snapshot = await graph.getState(config);
    assert.equal(checkpointInvocation(snapshot, userId, actionId, fullPlan), "resume");
    assert.throws(() => checkpointInvocation(snapshot, randomUUID(), actionId), /ownership/);
    assert.throws(() => checkpointInvocation(snapshot, userId, randomUUID()), /ownership/);
    assert.deepEqual(snapshot.next, ["score_candidates"]);
    assert.equal(snapshot.values.correctedCandidates[0].evidence.length, expectedEvidenceCount);
    assert.equal(snapshot.values.correctedCandidates[0].correction.findings.length, expectedFindingCount);
    assert.equal(snapshot.values.creditsUsed, 0);
    const result = await graph.invoke(null, config).catch(async error => {
      const failed = await graph.getState(config);
      throw new Error(`SQL resume graph failed: ${JSON.stringify({ next: failed.next,
        scoringStatus: failed.values.assessments?.map((item: {scoringStatus?:string}) => item.scoringStatus),
        warnings: failed.values.assessments?.flatMap((item: {warnings?:string[]}) => item.warnings ?? []),
        fakeModelCalls: calls.length })}`, { cause: error });
    });
    assert.equal(result.result?.accepted, 0);
    assert.equal(result.assessments[0].scoringStatus, "completed");
    assert.deepEqual(agent.completedCacheContracts(result.assessments),
      agent.cacheContracts(snapshot.values.correctedCandidates, playbook,
        fullPlan.countryCode, fullPlan.countryName, fullPlan.objective));
    assert.equal(calls.length, 1);
    console.log(JSON.stringify({ sqlResumed: true, fakeModelCalls: calls.length, accepted: result.result.accepted }));
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
      assert.equal(snapshot.values.correctedCandidates[0].correction.findings.length, expectedFindingCount);
      assert.deepEqual(counters, { scores: 0, persisted: 0 });
    } else {
      const snapshot = await graph.getState(config);
      assert.equal(checkpointInvocation(snapshot, "synthetic-owner", "synthetic-action", fullPlan), "resume");
      assert.throws(() => checkpointInvocation(snapshot, "other-owner", "synthetic-action"), /ownership/);
      assert.throws(() => checkpointInvocation(snapshot, "synthetic-owner", "other-action"), /ownership/);
      assert.deepEqual(snapshot.next, ["score_candidates"]);
      assert.deepEqual(snapshot.values.correctedCandidates[0].evidence, corrected.evidence);
      assert.deepEqual(snapshot.values.correctedCandidates[0].correction.findings, corrected.correction.findings);
      const result = await graph.invoke(null, config).catch(async error => {
        const failed = await graph.getState(config);
        throw new Error(`Resume graph failed: ${JSON.stringify({ next: failed.next,
          scoringStatus: failed.values.assessments?.map((item: {scoringStatus?:string}) => item.scoringStatus),
          warnings: failed.values.assessments?.flatMap((item: {warnings?:string[]}) => item.warnings ?? []),
          fakeModelCalls: calls.length })}`, { cause: error });
      });
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
  if (!mode || mode === "sql") await saver.deleteThread(threadId);
  await saver.end();
}
