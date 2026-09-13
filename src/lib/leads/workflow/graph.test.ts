import { describe, expect, it, vi } from "vitest";
import { MemorySaver } from "@langchain/langgraph";
import { WorkflowPausedError } from "./pause";
import {leadEvidenceContentHash} from "@/lib/leads/evidence-snapshot";
import { resultPersistenceFingerprint } from "./persistence-identity";
import {completedStageMetric} from "./workflow-telemetry";
import { processingRecoveryWork } from "./processing-recovery";
import {revalidateSavedRecoveryResume} from "./recovery-resume-revalidation";
import { snapshotDiscoverySession } from "./discovery-session";
import { createHybridDiscoverySession } from "./hybrid-discovery-executor";
import { compactLeadSingleton } from "@/providers/compact-lead-request";
import { leadRequestBatches } from "@/providers/lead-request-batches";
import { LeadRequestTooLargeError } from "@/providers/lead-request-bounds";

import type { LeadSearchPlan } from "@/lib/assistant/types";

import { buildLeadWorkflowGraph, type LeadWorkflowDependencies } from "./graph";
import type { DiscoveryResult } from "./discovery";
import type {
  CorrectedLeadWorkflowCandidate,
  LeadCandidateAssessment,
  LeadMarketPlaybook,
  LeadRagCitation,
  LeadWorkflowCandidate,
  LeadWorkflowResult,
  LeadWorkflowState,
} from "./types";

const plan: LeadSearchPlan = {
  countryCode: "DE",
  countryName: "德国",
  objective: "new-market",
  roles: ["Distributor", "VAD", "VAR", "Dealer", "Reseller", "Retailer", "E-tailer", "SI", "Installer", "MSP", "ISP"],
  targetCount: 20,
  queryLanguage: "zh-CN",
  userRequest: "搜索德国有开发价值的渠道公司",
};

const ragContext: LeadRagCitation[] = (["product", "company", "industry"] as const).map((collection, index) => ({
  chunkId: `00000000-0000-4000-8000-00000000000${index + 1}`,
  collection,
  title: `${collection} evidence`,
  content: `${collection} context`,
  score: 0.8,
  retrievalSignals: collection === "product" ? ["vector", "structured"] : ["vector"],
  corroborated: collection === "product",
  structuredFacts: collection === "product"
    ? [{ model: "WR3000", factKey: "category", factValue: "Wi-Fi Router", status: "verified" }] : [],
}));

const playbook: LeadMarketPlaybook = {
  marketHypothesis: "Test market hypothesis for multi-node development.",
  productAngles: ["SMB networking"],
  preferredCompanyTraits: ["networking customer access"],
  exclusions: ["directories"],
  rolePriorities: [{ family: "distribution", roles: ["Distributor", "VAD"], weight: 1, reason: "Supply path" }],
  searchQueries: [{ family: "distribution", roles: ["Distributor", "VAD"], query: "networking distributor Germany", priority: 1 }],
  ragCitationIds: ragContext.map((item) => item.chunkId),
  generatedBy: "langchain-model",
  model: "test-planner",
  warnings: [],
};

const candidate: LeadWorkflowCandidate = {
  candidateId: "lead-example",
  evidenceSnapshotRunId: "run-1",
  companyName: "Example GmbH",
  domain: "example.de",
  officialWebsiteUrl: "https://example.de/",
  queryRoles: ["Distributor"],
  queryFamily: "distribution",
  providerScore: 0.8,
  evidence: [{ id: "evidence-example", url: "https://example.de/", title: "Example",
    excerpt: "Networking distributor in Germany", sourceType: "official-website", provider: "test", capturedAt: "2026-08-22T00:00:00Z" }],
  evidenceWarnings: [],
};

const correctedCandidate: CorrectedLeadWorkflowCandidate = {
  ...candidate,
  correction: { originalCompanyName: candidate.companyName, originalDomain: candidate.domain,
    originalOfficialWebsiteUrl: candidate.officialWebsiteUrl, resolvedRoles: ["Distributor"],
    resolvedFamilies: ["distribution"], primaryRole: "Distributor", primaryFamily: "distribution",
    primaryChannelReason: "Fixture primary route.", usedSmallLongTailChannelException: false,
    identityChanged: false, routingChanged: false,
    supplementalEvidenceIds: [], reliedEvidenceIds: ["evidence-example"], findings: [{
      findingId: "finding-distribution", kind: "role", statement: "Example is a networking distributor.",
      status: "supported", roles: ["Distributor"], evidenceIds: ["evidence-example"],
      sourceTypes: ["official-website"], confidence: 85, notes: [],
    }], reasons: ["Official evidence supports distribution."],
    confidence: 85, model: "test-corrector", promptVersion: "test", escalated: false, warnings: [] },
};

const assessment: LeadCandidateAssessment = {
  candidateId: candidate.candidateId,
  eligible: true,
  gates: { correctedIdentityUsable: "supported", companyExists: "supported", targetCountryPresence: "supported",
    networkingRelevant: "supported", independentProspect: "supported" },
  roles: ["Distributor"], primaryRole: "Distributor", companyScaleClass: "Regional",
  researchDepth: "standard", recommendationPriority: "High", accountTier: "Priority Distributor",
  supplyModel: "Distributor Supply", brandInvolvement: "Standard",
  dimensions: { productFamilyMatch: 21, customerAndScenarioOverlap: 12, positioningCompatibility: 8,
    cooperationPathAndBuyingInfluence: 12, scaleAndChannelCoverage: 11,
    executionAndEnablement: 7, opportunityAndRisk: 8 },
  dimensionRationales: [],
  totalScore: 79, scoreRange: { lower: 76, upper: 82 }, confidence: 85,
  eligibilityStatus: "eligible", cooperationPaths: [{ pathId: "path-distribution",
    pathType: "Direct Tier-1 Supply", candidateRole: "Distributor",
    fitComponents: { roleStructureFit: 28, userStageAndSupplyFit: 20, productCustomerScenarioFit: 17,
      procurementAndInfluence: 10, executionFeasibility: 7 }, fitScore: 82, rank: 1,
    findingIds: ["finding-distribution"], evidenceIds: ["evidence-example"],
    reason: "Direct tier-1 supply fits the distributor role.", prerequisites: [], risks: [], unknowns: [],
    allowedInExternalEmail: true }], selectedPathId: "path-distribution",
  summary: "Qualified test candidate", reasons: ["Evidence supports fit"],
  risks: [], unknowns: [], evidenceIds: ["evidence-example"], model: "test-scorer",
  promptVersion: "test", escalated: false, scoringStatus: "completed", warnings: [],
};

function discoveryMetric(newUniqueCompanies: number): NonNullable<DiscoveryResult["callMetrics"]>[number] {
  return {
    callKey: "distribution/national/0/test/test", callFingerprint: `fingerprint-${newUniqueCompanies}`,
    queryClusterKey: `cluster-${newUniqueCompanies}`,
    route: { category: "distribution", track: "national", sequence: 0, provider: "gemini-full",
      engine: "google-grounded", mechanism: "planning-and-semantic-web-search", trigger: "core",
      invocationReason: "test" },
    query: "test query", status: "completed", requestedResults: 12, rawResults: 1, normalizedCompanies: 1,
    newUniqueCompanies, existingCompanyHits: 0, rejectedResults: 0, paidSearchCredits: 0,
    requestCount: 1, groundingQueries: 1, inputTokens: 1, outputTokens: 1, latencyMs: 1,
    retryCount: 0, fallbackUsed: false, cacheStatus: "miss", discardedReasonCounts: {}, items: [],
  };
}

function dependencies(events: string[], context = ragContext): LeadWorkflowDependencies {
  const result: LeadWorkflowResult = { runId: "run-1", countryCode: "DE", countryName: "德国", requested: 20,
    discovered: 1, assessed: 1, qualified: 1, accepted: 1, creditsUsed: 3, ragCitationCount: context.length,
    graphThreadId: "thread-1", warnings: [] };
  return {
    updatePhase: vi.fn(async (_userId, _actionId, phase) => { events.push(`phase:${phase}`); }),
    retrieveRagContext: vi.fn(async () => { events.push("rag"); return context; }),
    buildPlaybook: vi.fn(async () => { events.push("playbook"); return playbook; }),
    discover: vi.fn(async () => { events.push("discover"); return { runId: "run-1", candidates: [candidate], creditsUsed: 1, warnings: [] }; }),
    collectEvidence: vi.fn(async () => { events.push("evidence"); return { candidates: [candidate], creditsUsed: 2, warnings: [] }; }),
    correctionAgent: { correct: vi.fn(async () => { events.push("correct"); return { candidates: [correctedCandidate], creditsUsed: 1, warnings: [] }; }) },
    qualificationAgent: { evaluate: vi.fn(async () => { events.push("score"); return [assessment]; }) },
    assessmentReviewAgent: { review: vi.fn(async () => { events.push("review"); return { assessments: [assessment],
      reviews: [{ candidateId: assessment.candidateId, required: false, triggers: [], status: "not-required" as const,
        primaryModel: assessment.model, primaryScore: assessment.totalScore, finalScore: assessment.totalScore,
        materialDisagreements: [], rationale: "No trigger", warnings: [] }], warnings: [] }; }) },
    handoffAssembler: { assemble: vi.fn(() => { events.push("handoff"); return []; }) },
    persist: vi.fn(async () => { events.push("persist"); return result; }),
  };
}

describe("LangGraph lead workflow", () => {
  it("routes a resumed recovery checkpoint with newly expired evidence back to evidence collection",async()=>{
    const deps=dependencies([]),graph=buildLeadWorkflowGraph(deps,new MemorySaver());
    const config={configurable:{thread_id:"saved-expired-resume"}};
    const old={...candidate.evidence[0],evidenceRunId:"run-1",freshnessStatus:"revalidated" as const,
      priorRunId:"parent-run",contentHash:leadEvidenceContentHash(candidate.evidence[0].excerpt)};
    await graph.updateState(config,{userId:"u",actionId:"child",workspaceId:"w",graphThreadId:"saved-expired-resume",
      runId:"run-1",plan,playbook,phase:"scoring",candidates:[{...candidate,evidence:[old]}],
      correctedCandidates:[{...correctedCandidate,evidence:[old]}],assessments:[assessment],creditsUsed:7,
      ragContext:[],assessmentReviews:[],handoffs:[],modelUsage:[],stageMetrics:[],warnings:[],terminalRecoveryOnly:true,
      savedProcessingRecovery:{sourceActionId:"parent",sourceRunId:"parent-run",sourceFingerprint:"proof",refreshCandidateIds:[]}},"route_candidates");
    const snapshot=await graph.getState(config);
    const patch=revalidateSavedRecoveryResume(snapshot.values as LeadWorkflowState,[{candidateId:candidate.candidateId,
      reusableEvidence:0,needsEvidenceRefresh:true,reasons:{"expired-evidence":1}}]);
    expect(patch?.savedProcessingRecovery?.refreshCandidateIds).toEqual([candidate.candidateId]);
    await graph.updateState(config,patch!,"build_playbook");
    expect((await graph.getState(config)).next).toEqual(["prepare_recovery_evidence"]);
  });
  it("runs saved recovery through correction and scoring without discovery or repeated evidence",async()=>{
    const deps=dependencies([]),graph=buildLeadWorkflowGraph(deps,new MemorySaver());
    const config={configurable:{thread_id:"saved-fresh"}};
    await graph.updateState(config,{userId:"u",actionId:"child",workspaceId:"w",graphThreadId:"saved-fresh",runId:"run-1",plan,playbook,
      phase:"planning",candidates:[candidate],correctedCandidates:[],assessments:[],creditsUsed:0,ragContext:[],
      assessmentReviews:[],handoffs:[],modelUsage:[],stageMetrics:[],warnings:[],terminalRecoveryOnly:true,
      savedProcessingRecovery:{sourceActionId:"parent",sourceRunId:"old",sourceFingerprint:"proof",refreshCandidateIds:[]}},"build_playbook");
    const completed=await graph.invoke(null,config);
    expect(deps.discover).not.toHaveBeenCalled();expect(deps.collectEvidence).not.toHaveBeenCalled();
    expect(deps.correctionAgent.correct).toHaveBeenCalledOnce();expect(deps.qualificationAgent.evaluate).toHaveBeenCalledOnce();
    expect(completed.targetCompletionReason).toBe("qualified-shortfall");
  });
  it("checkpoints each recovery evidence success and pauses invalid paid output without automatic retry",async()=>{
    const deps=dependencies([]),graph=buildLeadWorkflowGraph(deps,new MemorySaver());
    const config={configurable:{thread_id:"saved-partial"}};
    const second={...candidate,candidateId:"second",domain:"second.de"};let failed=true;
    deps.correctionAgent.correct=vi.fn(async (items:LeadWorkflowCandidate[])=>({candidates:items.map(item=>({...item,correction:correctedCandidate.correction})),creditsUsed:0,warnings:[]}));
    deps.qualificationAgent.evaluate=vi.fn(async (items:CorrectedLeadWorkflowCandidate[])=>items.map(item=>({...assessment,candidateId:item.candidateId})));
    deps.collectEvidence=vi.fn(async(items:LeadWorkflowCandidate[])=>({candidates:items.map(item=>({...item,evidence:item.candidateId==="second"&&failed?[]:
      [{...candidate.evidence[0],evidenceRunId:"run-1",freshnessStatus:"fresh" as const,contentHash:leadEvidenceContentHash(candidate.evidence[0].excerpt)}]})),creditsUsed:2,warnings:[]}));
    await graph.updateState(config,{userId:"u",actionId:"child",workspaceId:"w",graphThreadId:"saved-partial",runId:"run-1",plan,playbook,
      phase:"planning",candidates:[candidate,second],correctedCandidates:[],assessments:[],creditsUsed:0,ragContext:[],
      assessmentReviews:[],handoffs:[],modelUsage:[],stageMetrics:[],warnings:[],terminalRecoveryOnly:true,
      savedProcessingRecovery:{sourceActionId:"parent",sourceRunId:"old",sourceFingerprint:"proof",refreshCandidateIds:[candidate.candidateId,"second"]}},"build_playbook");
    await expect(graph.invoke(null,config)).rejects.toThrow("校正或评分未完成");
    const paused=await graph.getState(config);
    expect(paused.next).toEqual(["recover_saved_evidence"]);expect(paused.values.creditsUsed).toBe(4);
    expect(paused.values.savedProcessingRecovery?.refreshCandidateIds).toEqual(["second"]);
    expect(deps.collectEvidence).toHaveBeenCalledTimes(2);
    await expect(graph.invoke(null,config)).rejects.toThrow("校正或评分未完成");
    expect(deps.collectEvidence).toHaveBeenCalledTimes(2);
    failed=false;
    await graph.updateState(config,{savedProcessingRecovery:{...paused.values.savedProcessingRecovery!,evidenceBlocked:false}},"build_playbook");
    await graph.invoke(null,config);
    expect(deps.collectEvidence).toHaveBeenCalledTimes(3);expect(deps.discover).not.toHaveBeenCalled();
    expect(vi.mocked(deps.collectEvidence).mock.calls[2][0].map(item=>item.candidateId)).toEqual(["second"]);
  });
  it("repairs a retained terminal score without restarting discovery to fill the remaining target",async()=>{
    const deps=dependencies([]),saver=new MemorySaver(),graph=buildLeadWorkflowGraph(deps,saver);
    const config={configurable:{thread_id:"terminal-score"}};
    await graph.updateState(config,{userId:"u",actionId:"a",workspaceId:"w",graphThreadId:"terminal-score",runId:"run-1",plan,playbook,
      phase:"completed",candidates:[candidate],correctedCandidates:[correctedCandidate],assessments:[],creditsUsed:13,ragContext:[],
      assessmentReviews:[],handoffs:[],modelUsage:[],stageMetrics:[completedStageMetric({stage:"discover_candidates",startedAt:Date.now(),input:[],output:[],
        metadata:{completedCalls:1,completedFreshCalls:1,unavailableCalls:0}})],warnings:[],targetCompletionReason:"processing-incomplete"},"persist_results");
    expect((await graph.getState(config)).next).toEqual([]);
    // Runtime does this only after the original-run and unknown-cost database gates pass.
    await graph.updateState(config,{processingRecoveryAuthorized:true,terminalRecoveryOnly:true},"score_candidates");
    const result=await buildLeadWorkflowGraph(deps,saver).invoke(null,config);
    expect(result.targetCompletionReason).toBe("qualified-shortfall");expect(result.creditsUsed).toBe(13);
    expect(deps.discover).not.toHaveBeenCalled();expect(deps.collectEvidence).not.toHaveBeenCalled();
    expect(deps.correctionAgent.correct).not.toHaveBeenCalled();expect(deps.qualificationAgent.evaluate).toHaveBeenCalledTimes(1);
    expect(result.result).toBeDefined();
  });
  it("retries a saved result after completion-status failure with the same business identity",async()=>{
    const deps=dependencies([]),saver=new MemorySaver();
    const persist=deps.persist;
    let savedFingerprint:string|undefined;
    deps.persist=vi.fn(async input=>{
      const fingerprint=resultPersistenceFingerprint(input);
      if(savedFingerprint)expect(fingerprint).toBe(savedFingerprint);
      savedFingerprint=fingerprint;
      return persist(input);
    });
    let failCompletion=true;
    deps.updatePhase=vi.fn(async(_user,_action,phase)=>{
      if(phase==="completed"&&failCompletion){failCompletion=false;throw new Error("Synthetic completion write interrupted");}
    });
    const graph=buildLeadWorkflowGraph(deps,saver),config={configurable:{thread_id:"persist-interrupted"}};
    await expect(graph.invoke({userId:"u",actionId:"a",graphThreadId:"persist-interrupted",workspaceId:"w",plan,
      phase:"queued",ragContext:[],candidates:[],assessments:[],assessmentReviews:[],handoffs:[],creditsUsed:0,warnings:[]},config))
      .rejects.toThrow("Synthetic completion write interrupted");
    const stopped=await graph.getState(config);
    expect(stopped.next).toEqual(["persist_results"]);
    const result=await buildLeadWorkflowGraph(deps,saver).invoke(null,config);
    expect(result.result).toBeDefined();expect(result.creditsUsed).toBe(stopped.values.creditsUsed);
    expect(deps.persist).toHaveBeenCalledTimes(2);
    expect(deps.discover).toHaveBeenCalledTimes(1);expect(deps.correctionAgent.correct).toHaveBeenCalledTimes(1);
    expect(deps.qualificationAgent.evaluate).toHaveBeenCalledTimes(1);
  });
  it.each([false,true])("persists zero output with measured stop reason (provider failure=%s)",async failure=>{
    const deps=dependencies([]);
    const call=discoveryMetric(0);
    deps.discover=vi.fn(async()=>({runId:"run-1",candidates:[],processedCompanyKeys:[],creditsUsed:1,warnings:[],
      callMetrics:[failure?{...call,status:"failed" as const}:call]}));
    deps.collectEvidence=vi.fn(async()=>({candidates:[],creditsUsed:0,warnings:[]}));
    deps.correctionAgent.correct=vi.fn(async()=>({candidates:[],creditsUsed:0,warnings:[]}));
    deps.assessmentReviewAgent.review=vi.fn(async()=>({assessments:[],reviews:[],warnings:[]}));
    deps.persist=vi.fn(async()=>({runId:"run-1",countryCode:"DE",countryName:"Germany",requested:2,
      discovered:0,assessed:0,qualified:0,accepted:0,creditsUsed:failure?1:2,ragCitationCount:0,graphThreadId:"zero",warnings:[]}));
    const state=await buildLeadWorkflowGraph(deps).invoke({userId:"u",actionId:"a",graphThreadId:"zero",workspaceId:"w",
      plan:{...plan,targetCount:2},phase:"queued",ragContext:[],candidates:[],correctedCandidates:[],assessments:[],
      processedCompanyKeys:[],assessmentReviews:[],handoffs:[],creditsUsed:0,warnings:[]},{recursionLimit:50});
    expect(state.targetCompletionReason).toBe(failure?"provider-unavailable":"confirmed-exhaustion");
    expect(deps.discover).toHaveBeenCalledTimes(failure?1:2);
    expect(deps.qualificationAgent.evaluate).not.toHaveBeenCalled();
    expect(deps.persist).toHaveBeenCalledWith(expect.objectContaining({processedCompanyKeys:[],assessments:[],creditsUsed:failure?1:2}));
    expect(state.result?.accepted).toBe(0);
  });
  it("persists a role-conflict shortfall without calling it exhaustion or redoing search", async () => {
    const deps = dependencies([]);
    const conflict = { ...correctedCandidate, candidateId: "conflict", correction: { ...correctedCandidate.correction,
      resolvedRoles: ["SI" as const], resolvedFamilies: ["services" as const], primaryRole: "SI" as const, primaryFamily: "services" as const } };
    deps.correctionAgent.correct = vi.fn(async () => ({ candidates: [correctedCandidate, conflict], creditsUsed: 0, warnings: [] }));
    deps.assessmentReviewAgent.review = vi.fn(async (_candidates, assessments) => ({ assessments, reviews: [], warnings: [] }));
    const state = await buildLeadWorkflowGraph(deps).invoke({ userId: "u", actionId: "a", graphThreadId: "conflict",
      workspaceId: "w", plan, phase: "queued", ragContext: [], candidates: [], assessments: [],
      assessmentReviews: [], handoffs: [], creditsUsed: 0, warnings: [] });
    expect(state.targetCompletionReason).toBe("role-unresolved");
    expect(state.result?.pendingRoleCount).toBe(1);
    expect(state.consecutiveNoFinalRounds).toBe(0);
    expect(deps.qualificationAgent.evaluate).not.toHaveBeenCalled();
    expect(deps.discover).toHaveBeenCalledTimes(1);
  });
  it("does not report target met when final persistence returns a shortfall", async () => {
    const deps = dependencies([]);
    deps.discover = vi.fn(async () => ({ runId: "run-1", candidates: [candidate], creditsUsed: 0,
      warnings: [], callMetrics: [discoveryMetric(1)] }));
    const state = await buildLeadWorkflowGraph(deps).invoke({ userId: "u", actionId: "a", graphThreadId: "shortfall",
      workspaceId: "w", plan: { ...plan, targetCount: 1 }, phase: "queued", ragContext: [], candidates: [], assessments: [],
      assessmentReviews: [], handoffs: [], creditsUsed: 0, warnings: [] });
    // The persistence fixture reports 1/20; the final outcome must not retain an earlier target-met claim.
    expect(state.targetCompletionReason).toBe("target-met");
    expect(state.result?.targetCompletionReason).toBe("qualified-shortfall");
  });
  it("checkpoints correction before saving requested-scope transfers and resumes without another correction", async () => {
    const deps = dependencies([]);
    const shifted = { ...correctedCandidate, queryFamily: "services" as const, queryRoles: ["SI" as const] };
    deps.correctionAgent.correct = vi.fn(async () => ({ candidates: [shifted], creditsUsed: 1, warnings: [] }));
    deps.persistCandidateRoutes = vi.fn().mockRejectedValueOnce(new Error("route storage unavailable")).mockResolvedValue(undefined);
    const graph = buildLeadWorkflowGraph(deps, new MemorySaver());
    const config = { configurable: { thread_id: "route-recovery" } };
    await expect(graph.invoke({ userId: "u", actionId: "a", graphThreadId: "route-recovery", workspaceId: "w",
      plan: { ...plan, roles: ["SI", "Distributor"] }, phase: "queued", ragContext: [], candidates: [], assessments: [],
      assessmentReviews: [], handoffs: [], creditsUsed: 0, warnings: [] }, config)).rejects.toThrow("route storage unavailable");
    expect((await graph.getState(config)).next).toEqual(["route_candidates"]);
    await graph.invoke(null, config);
    expect(deps.correctionAgent.correct).toHaveBeenCalledTimes(1);
    expect(deps.qualificationAgent.evaluate).toHaveBeenCalledWith([shifted], expect.objectContaining(playbook), plan.countryCode, plan.countryName, plan.objective);
    expect(deps.persistCandidateRoutes).toHaveBeenLastCalledWith(expect.objectContaining({
      routes: [expect.objectContaining({ status: "transferred", sourceFamily: "services", targetFamily: "distribution" })],
    }));
  });
  it("retains complete peers and original evidence while reopening only missing correction and retry scores", () => {
    const retry = { ...correctedCandidate, candidateId: "retry", correction: {
      ...correctedCandidate.correction, completionStatus: "retry-required" as const } };
    const missing = { ...candidate, candidateId: "missing", domain: "missing.test" };
    const work = processingRecoveryWork({ candidates: [candidate, missing], correctedCandidates: [correctedCandidate, retry],
      assessments: [assessment, { ...assessment, candidateId: "retry", scoringStatus: "retry-required" }] });
    expect(work.candidates).toEqual([retry, missing]);
    expect(work.candidates[0].evidence).toBe(retry.evidence);
    expect(work.assessments).toEqual([assessment]);
  });
  it.each(["fallback", "missing-correction", "missing-score"])("retains incomplete %s without refilling or declaring market exhaustion", async failure => {
    const deps = dependencies([]);
    deps.discover = vi.fn(async () => ({ runId: "run-1", candidates: [candidate], creditsUsed: 1,
      warnings: [], callMetrics: [discoveryMetric(1)] }));
    deps.correctionAgent.correct = vi.fn(async () => ({ candidates: failure === "missing-correction" ? [] : [{
      ...correctedCandidate, correction: { ...correctedCandidate.correction,
        model: failure === "fallback" ? "deterministic-fallback" : "fixture" } }], creditsUsed: 2, warnings: [] }));
    deps.qualificationAgent.evaluate = vi.fn(async () => []);
    const saver = new MemorySaver();
    const graph = buildLeadWorkflowGraph(deps, saver);
    const config = { configurable: { thread_id: "incomplete" } };
    await expect(graph.invoke({ userId: "u", actionId: "a", graphThreadId: "incomplete",
      workspaceId: "w", plan: { ...plan, targetCount: 1 }, phase: "queued", ragContext: [], candidates: [], assessments: [],
      assessmentReviews: [], handoffs: [], creditsUsed: 0, warnings: [] }, config)).rejects.toThrow("校正或评分未完成");
    const snapshot = await graph.getState(config);
    const state = snapshot.values;
    expect(state.targetCompletionReason).toBe("processing-incomplete");
    expect(snapshot.next).toEqual(["recover_incomplete_processing"]);
    expect(state.consecutiveNoFinalRounds).toBe(0);
    expect(deps.discover).toHaveBeenCalledTimes(1);
    expect(state.creditsUsed).toBeGreaterThanOrEqual(3);
    if (failure !== "missing-score") expect(deps.qualificationAgent.evaluate).not.toHaveBeenCalled();
    deps.correctionAgent.correct = vi.fn(async () => ({ candidates: [correctedCandidate], creditsUsed: 0, warnings: [] }));
    deps.qualificationAgent.evaluate = vi.fn(async () => [assessment]);
    const resumed = buildLeadWorkflowGraph(deps, saver);
    await expect(resumed.invoke(null, config)).rejects.toThrow("校正或评分未完成");
    await resumed.updateState(config, { processingRecoveryAuthorized: true }, "score_candidates");
    const completed = await resumed.invoke(null, config);
    expect(completed.targetCompletionReason).toBe("target-met");
    expect(completed.creditsUsed).toBe(state.creditsUsed);
    expect(deps.discover).toHaveBeenCalledTimes(1);
    expect(deps.collectEvidence).toHaveBeenCalledTimes(1);
    expect(deps.correctionAgent.correct).toHaveBeenCalledTimes(failure === "missing-score" ? 0 : 1);
    expect(deps.qualificationAgent.evaluate).toHaveBeenCalledTimes(1);
  });
  it("preserves completed scores and the stage checkpoint when optional cache persistence fails",async()=>{
    const events:string[]=[];const deps=dependencies(events);
    deps.saveAssessmentCache=vi.fn().mockRejectedValue(new Error("fixture cache unavailable"));
    const state=await buildLeadWorkflowGraph(deps).invoke({userId:"user-1",actionId:"action-1",graphThreadId:"cache-failure",workspaceId:"workspace-1",plan,phase:"queued",ragContext:[],candidates:[],assessments:[],assessmentReviews:[],handoffs:[],creditsUsed:0,warnings:[]});
    expect(deps.qualificationAgent.evaluate).toHaveBeenCalledTimes(1);
    expect(state.assessments).toEqual([assessment]);
    expect(state.warnings.some(warning=>warning.includes("评分缓存写入失败"))).toBe(true);
    expect(state.result).toBeDefined();
  });
  it("resumes after a phase pause without repeating completed discovery or resetting credits",async()=>{
    const events:string[]=[];const deps=dependencies(events);let paused=true;
    deps.updatePhase=vi.fn(async(_u,_a,phase)=>{if(paused&&phase==='collecting-evidence')throw new WorkflowPausedError();});
    const graph=buildLeadWorkflowGraph(deps,new MemorySaver());const config={configurable:{thread_id:'resume-test'}};
    await expect(graph.invoke({userId:'u',actionId:'a',graphThreadId:'resume-test',workspaceId:'w',plan,phase:'queued',ragContext:[],candidates:[],assessments:[],assessmentReviews:[],handoffs:[],creditsUsed:0,warnings:[]},config)).rejects.toThrow('阶段边界暂停');
    expect(deps.discover).toHaveBeenCalledTimes(1);expect(deps.collectEvidence).not.toHaveBeenCalled();paused=false;
    const state=await graph.invoke(null,config);expect(state.result).toBeDefined();expect(deps.discover).toHaveBeenCalledTimes(1);expect(deps.buildPlaybook).toHaveBeenCalledTimes(1);expect(state.creditsUsed).toBe(4);
  });
  it("retains an incompressible candidate and prior credits at the actual request preflight boundary",async()=>{
    const deps=dependencies([]);
    const largeCandidate={...candidate,evidence:candidate.evidence.map(item=>({...item,excerpt:"界".repeat(20000)}))};
    deps.collectEvidence=vi.fn(async()=>({candidates:[largeCandidate],creditsUsed:2,warnings:[]}));
    const saver=new MemorySaver();
    const config={configurable:{thread_id:"oversized-singleton"}};
    deps.correctionAgent.correct=vi.fn(async (items:LeadWorkflowCandidate[])=>{
      leadRequestBatches(items,batch=>compactLeadSingleton({task:"lead-evidence-correction",modelVersion:"deepseek-v4-flash",
        promptVersion:"oversized-fixture",evidenceIds:batch.flatMap(item=>item.evidence.map(source=>source.id)),input:{instructions:[],candidates:batch.map(item=>({
          candidateId:item.candidateId,evidence:item.evidence.map(source=>({evidenceId:source.id,url:source.url,excerpt:source.excerpt}))}))}}),5,100000);
      throw new Error("Oversized input must never reach a model");
    });
    const graph=buildLeadWorkflowGraph(deps,saver);
    await expect(graph.invoke({userId:"u",actionId:"a",graphThreadId:"oversized-singleton",workspaceId:"w",plan,
      phase:"queued",ragContext:[],candidates:[],assessments:[],assessmentReviews:[],handoffs:[],creditsUsed:0,warnings:[]},config))
      .rejects.toBeInstanceOf(LeadRequestTooLargeError);
    const snapshot=await graph.getState(config);
    expect(snapshot.next).toEqual(["correct_candidates"]);
    expect(snapshot.values.candidates).toHaveLength(1);
    expect(snapshot.values.candidates[0].evidence).toEqual(largeCandidate.evidence);
    expect(snapshot.values.assessments).toEqual([]);
    expect(snapshot.values.creditsUsed).toBeGreaterThan(0);
    expect(deps.qualificationAgent.evaluate).not.toHaveBeenCalled();
    expect(deps.persist).not.toHaveBeenCalled();
    deps.correctionAgent.correct=vi.fn(async()=>({candidates:[{...correctedCandidate,evidence:largeCandidate.evidence}],creditsUsed:0,warnings:[]}));
    // A rebuilt graph resumes the saved boundary once the request can be processed.
    const resumed=await buildLeadWorkflowGraph(deps,saver).invoke(null,config);
    expect(resumed.result).toBeDefined();
    expect(resumed.creditsUsed).toBe(snapshot.values.creditsUsed);
    expect(deps.discover).toHaveBeenCalledTimes(1);
    expect(deps.collectEvidence).toHaveBeenCalledTimes(1);
    expect(deps.qualificationAgent.evaluate).toHaveBeenCalledTimes(1);
  });
  it("retrieves all three RAG domains before search and scores before persistence", async () => {
    const events: string[] = [];
    const graph = buildLeadWorkflowGraph(dependencies(events));
    const state = await graph.invoke({ userId: "user-1", actionId: "action-1", graphThreadId: "thread-1",
      workspaceId: "workspace-1", plan, phase: "queued", ragContext: [], candidates: [], assessments: [], assessmentReviews: [], handoffs: [], creditsUsed: 0, warnings: [] });
    expect(state.result?.accepted).toBe(1);
    expect(events.filter((item) => ["rag", "playbook", "discover", "evidence", "correct", "score", "review", "handoff", "persist"].includes(item)))
      .toEqual(["rag", "playbook", "discover", "evidence", "correct", "score", "review", "handoff", "persist"]);
  });

  it("fails closed before external discovery when one RAG domain is missing", async () => {
    const events: string[] = [];
    const deps = dependencies(events, ragContext.filter((item) => item.collection !== "company"));
    const graph = buildLeadWorkflowGraph(deps);
    await expect(graph.invoke({ userId: "user-1", actionId: "action-1", graphThreadId: "thread-1",
      workspaceId: "workspace-1", plan, phase: "queued", ragContext: [], candidates: [], assessments: [], assessmentReviews: [], handoffs: [], creditsUsed: 0, warnings: [] }))
      .rejects.toThrow("missing usable company context");
    expect(deps.discover).not.toHaveBeenCalled();
  });

  it("fails closed when product evidence has no independent retrieval corroboration", async () => {
    const events: string[] = [];
    const context = ragContext.map((item) => item.collection === "product"
      ? { ...item, retrievalSignals: ["vector"] as LeadRagCitation["retrievalSignals"], corroborated: false } : item);
    const deps = dependencies(events, context);
    const graph = buildLeadWorkflowGraph(deps);
    await expect(graph.invoke({ userId: "user-1", actionId: "action-1", graphThreadId: "thread-1",
      workspaceId: "workspace-1", plan, phase: "queued", ragContext: [], candidates: [], assessments: [], assessmentReviews: [], handoffs: [], creditsUsed: 0, warnings: [] }))
      .rejects.toThrow("lacks independent structured/text retrieval corroboration");
    expect(deps.discover).not.toHaveBeenCalled();
  });

  it("reuses exact playbook and assessment dependencies without calling either model", async () => {
    const events: string[] = [];
    const deps = dependencies(events);
    deps.loadPlaybookCache = vi.fn(async () => playbook);
    deps.savePlaybookCache = vi.fn(async () => undefined);
    deps.loadAssessmentCache = vi.fn(async () => new Map([[assessment.candidateId, assessment]]));
    deps.saveAssessmentCache = vi.fn(async () => undefined);
    const graph = buildLeadWorkflowGraph(deps);
    const state = await graph.invoke({ userId: "user-1", actionId: "action-1", graphThreadId: "thread-1",
      workspaceId: "workspace-1", plan, phase: "queued", ragContext: [], candidates: [], assessments: [],
      assessmentReviews: [], handoffs: [], creditsUsed: 0, modelUsage: [], stageMetrics: [], warnings: [] });
    expect(deps.buildPlaybook).not.toHaveBeenCalled();
    expect(deps.qualificationAgent.evaluate).not.toHaveBeenCalled();
    expect(state.stageMetrics.filter((metric) => metric.status === "cache-hit").map((metric) => metric.stage))
      .toEqual(["build_playbook", "score_candidates"]);
    for(const metric of state.stageMetrics){expect(metric.validArtifacts).toBeLessThanOrEqual(metric.generatedArtifacts);expect(metric.downstreamUsedArtifacts).toBeLessThanOrEqual(metric.generatedArtifacts);}
    expect(state.stageMetrics.find(metric=>metric.stage==="score_candidates")?.metadata.reusedCompletedArtifacts).toBe(1);
  });

  it("repeats the production search loop until the requested valid count is reached", async () => {
    const events: string[] = [];
    const deps = dependencies(events);
    const twoTargetPlan = { ...plan, targetCount: 2 };
    const candidate2 = { ...candidate, candidateId: "lead-example-2", companyName: "Example Two GmbH",
      domain: "example-two.de", officialWebsiteUrl: "https://example-two.de/" };
    const corrected2 = { ...correctedCandidate, ...candidate2,
      correction: { ...correctedCandidate.correction, originalCompanyName: candidate2.companyName,
        originalDomain: candidate2.domain, originalOfficialWebsiteUrl: candidate2.officialWebsiteUrl } };
    const assessment2 = { ...assessment, candidateId: candidate2.candidateId };
    const session = createHybridDiscoverySession();
    session.providerCircuits.set("brave", "fixture configuration failure");
    const sessionSnapshot = snapshotDiscoverySession(session, "fixture-dependency");
    deps.discover = vi.fn()
      .mockResolvedValueOnce({ runId: "run-1", candidates: [candidate], creditsUsed: 1,
        warnings: [], callMetrics: [discoveryMetric(1)], sessionSnapshot,
        processedCompanyKeys: ["a".repeat(64),"c".repeat(64)] })
      .mockResolvedValueOnce({ runId: "run-1", candidates: [candidate2], creditsUsed: 1,
        warnings: [], callMetrics: [discoveryMetric(1)], processedCompanyKeys:["b".repeat(64),"c".repeat(64)] });
    deps.collectEvidence = vi.fn(async (items: LeadWorkflowCandidate[]) =>
      ({ candidates: items, creditsUsed: 0, warnings: [] }));
    deps.correctionAgent.correct = vi.fn(async (items: LeadWorkflowCandidate[]) => ({
      candidates: items.map((item) => item.candidateId === candidate.candidateId ? correctedCandidate : corrected2),
      creditsUsed: 0, warnings: [],
    }));
    deps.qualificationAgent.evaluate = vi.fn(async (items: CorrectedLeadWorkflowCandidate[]) => items.map((item) =>
      item.candidateId === candidate.candidateId ? assessment : assessment2));
    const graph = buildLeadWorkflowGraph(deps);
    const state = await graph.invoke({ userId: "user-1", actionId: "action-1", graphThreadId: "thread-1",
      workspaceId: "workspace-1", plan: twoTargetPlan, phase: "queued", ragContext: [], candidates: [],
      processedCompanyKeys: [],
      correctedCandidates: [], assessments: [], assessmentReviews: [], handoffs: [], creditsUsed: 0,
      modelUsage: [], stageMetrics: [], warnings: [] }, { recursionLimit: 50 });
    expect(deps.discover).toHaveBeenCalledTimes(2);
    expect(deps.discover).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), expect.anything(),
      expect.anything(), expect.anything(), expect.objectContaining({ sessionSnapshot }));
    expect(state.acceptedCandidateCount).toBe(2);
    // The rejected company c is part of actual work although only a/b qualified.
    expect(deps.persist).toHaveBeenCalledWith(expect.objectContaining({
      processedCompanyKeys:["a".repeat(64),"b".repeat(64),"c".repeat(64)] }));
    expect(state.targetCompletionReason).toBe("target-met");
  });
  it("rechecks the remaining exact contract after a partial checkpoint hit without scoring again",async()=>{
    const deps=dependencies([]);
    const second={...candidate,candidateId:"lead-example-2",domain:"example-two.de"};
    const corrected2={...correctedCandidate,...second};const assessment2={...assessment,candidateId:second.candidateId};
    deps.discover=vi.fn(async()=>({runId:"run-1",candidates:[candidate,second],creditsUsed:0,warnings:[],callMetrics:[discoveryMetric(2)]}));
    deps.collectEvidence=vi.fn(async(items)=>({candidates:items,creditsUsed:0,warnings:[]}));
    deps.correctionAgent.correct=vi.fn(async()=>({candidates:[correctedCandidate,corrected2],creditsUsed:0,warnings:[]}));
    deps.qualificationAgent.cacheContracts=vi.fn((items:CorrectedLeadWorkflowCandidate[])=>new Map(items.map(item=>[item.candidateId,items.length===1?"single":"batch"])));
    deps.loadAssessmentCache=vi.fn(async options=>options.candidates.length===2?new Map([[assessment.candidateId,assessment]]):new Map([[assessment2.candidateId,assessment2]]));
    await buildLeadWorkflowGraph(deps).invoke({userId:"user-1",actionId:"action-1",graphThreadId:"thread-1",workspaceId:"workspace-1",plan:{...plan,targetCount:2},phase:"queued",ragContext:[],candidates:[],assessments:[],assessmentReviews:[],handoffs:[],creditsUsed:0,warnings:[]});
    expect(deps.loadAssessmentCache).toHaveBeenCalledTimes(2);
    expect(deps.loadAssessmentCache).toHaveBeenLastCalledWith(expect.objectContaining({candidates:[corrected2],contracts:new Map([[second.candidateId,"single"]])}));
    expect(deps.qualificationAgent.evaluate).not.toHaveBeenCalled();
  });
});
