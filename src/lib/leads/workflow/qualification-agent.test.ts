import { describe, expect, it } from "vitest";
import {createHash} from "node:crypto";
import {BudgetDeniedError} from "@/lib/billing/policy";
import {currentSpendContext,withProductSpend} from "@/lib/billing/context";
import {companyCostKey} from "@/lib/billing/company-cost-context";

import type { AiProvider, StructuredAiRequest, StructuredAiResponse } from "@/providers/contracts";
import { leadEvidenceContentHash } from "@/lib/leads/evidence-snapshot";

import { enforceAssessmentEvidenceCaps, LeadQualificationAgent } from "./qualification-agent";
import {validCachedAssessment} from "./assessment-cache";
import { roleScoringAnchors } from "./role-scoring-anchors";
import { CHANNEL_ROLE_FAMILIES } from "./types";
import type { CorrectedLeadWorkflowCandidate, LeadMarketPlaybook } from "./types";

class FakeProvider implements AiProvider {
  readonly id = "fake";
  calls: StructuredAiRequest<unknown>[] = [];
  constructor(private readonly options: { cooperationPaths?: unknown[]; fail?: boolean; malformedFirst?: boolean; escalation?: {
    required: boolean; expectedTotalScoreChange: number; criticalStateChanges: string[];
    higherCapabilityCanResolve: boolean; reason: string;
  } } = {}) {}
  async execute<TInput, TOutput>(request: StructuredAiRequest<TInput>): Promise<StructuredAiResponse<TOutput>> {
    this.calls.push(request as StructuredAiRequest<unknown>);
    if (this.options.fail) throw new Error("fixture provider unavailable");
    if (this.options.malformedFirst && this.calls.length === 1) {
      return { output: { invalid: true } as TOutput, modelVersion: request.modelVersion,
        promptVersion: request.promptVersion, latencyMs: 5, warnings: [] };
    }
    return {
      output: { assessments: [{
        candidateId: "lead-example", gates: { correctedIdentityUsable: "supported", companyExists: "supported",
          targetCountryPresence: "supported", networkingRelevant: "supported", independentProspect: "supported" },
        eligibilityStatus: "eligible", companyScaleClass: "Regional", researchDepth: "standard",
        supplyModel: "Distributor Supply", brandInvolvement: "Standard",
        cooperationPaths: this.options.cooperationPaths ?? [{ pathId: "path-var", pathType: "Direct Downstream Channel Supply", candidateRole: "VAR",
          fitComponents: { roleStructureFit: 27, userStageAndSupplyFit: 22, productCustomerScenarioFit: 16,
            procurementAndInfluence: 13, executionFeasibility: 8 },
          findingIds: ["finding-path"], evidenceIds: ["evidence-valid"],
          reason: "Direct supply fits the evidenced VAR role.", prerequisites: [], risks: [], unknowns: [],
          allowedInExternalEmail: true }],
        selectedPathId: "path-var",
        dimensions: { productFamilyMatch: 23, customerAndScenarioOverlap: 14,
          positioningCompatibility: 9, cooperationPathAndBuyingInfluence: 13,
          scaleAndChannelCoverage: 13, executionAndEnablement: 8, opportunityAndRisk: 8 },
        dimensionRationales: [
          { dimension: "productFamilyMatch", score: 23, reason: "Relevant routers and switches are sold.",
            findingIds: ["finding-fit"], evidenceIds: ["evidence-valid"], confidence: 90 },
          { dimension: "customerAndScenarioOverlap", score: 14, reason: "The candidate serves business customers.",
            findingIds: ["finding-path"], evidenceIds: ["evidence-valid"], confidence: 85 },
          { dimension: "positioningCompatibility", score: 9, reason: "The SMB portfolio is compatible.",
            findingIds: ["finding-fit"], evidenceIds: ["evidence-valid"], confidence: 85 },
          { dimension: "cooperationPathAndBuyingInfluence", score: 13, reason: "Business customers can request a quote.",
            findingIds: ["finding-path"], evidenceIds: ["evidence-valid"], confidence: 85 },
          { dimension: "scaleAndChannelCoverage", score: 13, reason: "The relevant regional business is evidenced.",
            findingIds: ["finding-identity"], evidenceIds: ["evidence-valid"], confidence: 90 },
          { dimension: "executionAndEnablement", score: 8, reason: "VAR and reseller execution is supported.",
            findingIds: ["finding-role"], evidenceIds: ["evidence-valid"], confidence: 90 },
          { dimension: "opportunityAndRisk", score: 8, reason: "The current opportunity has manageable risk.",
            findingIds: ["finding-role"], evidenceIds: ["evidence-valid"], confidence: 90 },
        ],
        confidence: 88, summary: "Evidence-grounded multi-role channel candidate.", reasons: ["Strong customer access"],
        risks: [], unknowns: ["Purchasing volume"], evidenceIds: ["evidence-valid", "invented-id"],
        escalation: this.options.escalation ?? { required: false, expectedTotalScoreChange: 0, criticalStateChanges: [],
          higherCapabilityCanResolve: false, reason: "" }, warnings: [],
      }] } as TOutput,
      modelVersion: request.modelVersion,
      promptVersion: request.promptVersion,
      latencyMs: 10,
      warnings: [],
    };
  }
}

class CacheableFakeProvider extends FakeProvider {
  cacheIdentity(request:StructuredAiRequest<unknown>){return createHash("sha256").update(JSON.stringify(request)).digest("hex");}
}

const candidate: CorrectedLeadWorkflowCandidate = {
  candidateId: "lead-example", evidenceSnapshotRunId: "run-example",
  companyName: "Example", domain: "example.de", officialWebsiteUrl: "https://example.de/",
  queryRoles: ["VAR"], queryFamily: "resale", providerScore: 0.99,
  evidence: [{ id: "evidence-valid", url: "https://example.de", title: "Example", excerpt: "VAR selling routers and PoE switches; business customers can request a quote.",
    sourceType: "official-website", provider: "test", capturedAt: "2026-08-30T00:00:00Z",
    evidenceRunId: "run-example", contentHash: leadEvidenceContentHash("VAR selling routers and PoE switches; business customers can request a quote."),
    freshnessStatus: "fresh" }], evidenceWarnings: [],
  correction: { originalCompanyName: "Example", originalDomain: "example.de", originalOfficialWebsiteUrl: "https://example.de/",
    resolvedRoles: ["VAR", "Reseller"], resolvedFamilies: ["resale"], primaryRole: "VAR", primaryFamily: "resale",
    primaryChannelReason: "Fixture primary route.", usedSmallLongTailChannelException: false,
    identityChanged: false, routingChanged: false,
    supplementalEvidenceIds: [], reliedEvidenceIds: ["evidence-valid"], findings: [
      { findingId: "finding-identity", kind: "identity", statement: "Example owns example.de.", status: "supported",
        roles: [], evidenceIds: ["evidence-valid"], sourceTypes: ["official-website"], confidence: 90, notes: [] },
      { findingId: "finding-country", kind: "country-presence", statement: "Example operates in Germany.", status: "supported",
        roles: [], evidenceIds: ["evidence-valid"], sourceTypes: ["official-website"], confidence: 90, notes: [] },
      { findingId: "finding-fit", kind: "product-family", statement: "Example sells routers and PoE switches.", status: "supported",
        roles: [], evidenceIds: ["evidence-valid"], sourceTypes: ["official-website"], confidence: 90, notes: [] },
      { findingId: "finding-path", kind: "cooperation-path", statement: "Business customers can request a quote.", status: "supported",
        roles: [], evidenceIds: ["evidence-valid"], sourceTypes: ["official-website"], confidence: 85, notes: [] },
      { findingId: "finding-role", kind: "role", statement: "Example has VAR and reseller activity.", status: "supported",
        roles: ["VAR", "Reseller"], evidenceIds: ["evidence-valid"], sourceTypes: ["official-website"], confidence: 90, notes: [] },
    ], reasons: ["Official evidence supports resale."],
    confidence: 90, model: "test-corrector", promptVersion: "test", escalated: false, warnings: [] },
};
const playbook: LeadMarketPlaybook = {
  marketHypothesis: "test", productAngles: ["SMB"], preferredCompanyTraits: ["VAR"], exclusions: [],
  rolePriorities: [], searchQueries: [], ragCitationIds: ["kb-1"], generatedBy: "langchain-model", warnings: [],
};

describe("LeadQualificationAgent", () => {
  it("checkpoints a complete peer before a missing member's repair is blocked",async()=>{
    class PartialPauseProvider extends CacheableFakeProvider {
      override async execute<I,O>(request:StructuredAiRequest<I>):Promise<StructuredAiResponse<O>>{
        if(this.calls.length)throw new BudgetDeniedError("budget-exhausted");
        return super.execute<I,O>(request);
      }
    }
    const provider=new PartialPauseProvider();const agent=new LeadQualificationAgent(provider,{batchSize:5,concurrency:1});
    const inputs=[candidate,{...candidate,candidateId:"lead-second"}];
    const expected=agent.cacheContracts(inputs,playbook,"DE","Germany","new-market");
    const saved:string[]=[];
    await expect(agent.evaluateWithUsage(inputs,playbook,"DE","Germany","new-market",async(items,assessments)=>{
      saved.push(...items.map(item=>item.candidateId));
      expect(agent.completedCacheContracts(assessments).get(candidate.candidateId)).toBe(expected.get(candidate.candidateId));
      expect(validCachedAssessment(assessments[0],candidate)).toBe(true);
    })).rejects.toThrow(BudgetDeniedError);
    expect(saved).toEqual([candidate.candidateId]);expect(provider.calls).toHaveLength(1);
  });
  it("reuses only complete consistent cached shapes with current citation bindings",async()=>{
    const [value]=await new LeadQualificationAgent(new FakeProvider()).evaluate([candidate],playbook,"DE","Germany","new-market");
    expect(validCachedAssessment(value,candidate)).toBe(true);
    for(const changed of [null,{candidateId:candidate.candidateId,scoringStatus:"completed"},
      {...value,totalScore:value.totalScore+1},{...value,evidenceIds:["foreign"]},
      {...value,selectedPathId:"missing-path"},{...value,dimensionRationales:Array(7).fill(value.dimensionRationales[0])},
      {...value,primaryRole:"Distributor"}])expect(validCachedAssessment(changed,candidate)).toBe(false);
  });
  it("repairs only the malformed member of a JSON-valid batch, without replaying its valid peer",async()=>{
    class PartialProvider extends FakeProvider {
      override async execute<I,O>(request:StructuredAiRequest<I>):Promise<StructuredAiResponse<O>>{
        const response=await super.execute<I,{assessments:Array<Record<string,unknown>>}>(request);
        const ids=(request.input as {candidates:Array<{candidateId:string}>}).candidates.map(item=>item.candidateId);
        const valid=response.output.assessments[0];
        return {...response,output:{assessments:ids.map(id=>this.calls.length===1&&id==="lead-second"?{candidateId:id}:{...valid,candidateId:id})} as O};
      }
    }
    const provider=new PartialProvider();
    const result=await new LeadQualificationAgent(provider,{batchSize:5,concurrency:1})
      .evaluate([candidate,{...candidate,candidateId:"lead-second"}],playbook,"DE","Germany","new-market");
    expect(result.map(item=>item.scoringStatus)).toEqual(["completed","completed"]);
    expect(provider.calls).toHaveLength(2);
    expect((provider.calls[1].input as {candidates:Array<{candidateId:string}>}).candidates.map(item=>item.candidateId)).toEqual(["lead-second"]);
  });
  it("links completed output to its full request even when provider cost was not reported",async()=>{
    const provider=new CacheableFakeProvider();
    const agent=new LeadQualificationAgent(provider,{routineModel:"model-a",escalationModel:"model-b"});
    const expected=agent.cacheContracts([candidate],playbook,"DE","Germany","new-market");
    let written=0;
    const result=await agent.evaluateWithUsage([candidate],playbook,"DE","Germany","new-market",async(items,assessments)=>{
      expect(items).toEqual([candidate]);
      expect(agent.completedCacheContracts(assessments)).toEqual(expected);written+=1;
    });
    expect(result.assessments[0].scoringStatus).toBe("completed");
    expect(written).toBe(1);expect(provider.calls).toHaveLength(1);
  });
  it("captures batch company inputs and narrows only a missing item repair without changing payloads",async()=>{
    const seen:string[][]=[];
    class AttributedProvider extends FakeProvider {
      override async execute<I,O>(request:StructuredAiRequest<I>):Promise<StructuredAiResponse<O>>{
        seen.push([...(currentSpendContext()?.costAttribution?.companyKeys??[])]);
        const response=await super.execute<I,{assessments:Array<Record<string,unknown>>}>(request);
        const ids=(request.input as {candidates:Array<{candidateId:string}>}).candidates.map(item=>item.candidateId);
        const valid=response.output.assessments[0];
        return {...response,output:{assessments:ids.map(id=>this.calls.length===1&&id==="lead-second"?{candidateId:id}:{...valid,candidateId:id})} as O};
      }
    }
    const provider=new AttributedProvider();
    const result=await withProductSpend("fixture-owner","score",()=>new LeadQualificationAgent(provider,{batchSize:5,concurrency:1})
      .evaluate([candidate,{...candidate,candidateId:"lead-second",domain:"second.example"}],playbook,"DE","Germany","new-market"));
    expect(result.map(item=>item.scoringStatus)).toEqual(["completed","completed"]);
    expect(seen).toEqual([[companyCostKey(candidate.domain,"DE"),companyCostKey("second.example","DE")].sort(),[companyCostKey("second.example","DE")]]);
    expect(JSON.stringify(provider.calls)).not.toContain("company-cost-attribution");
  });
  it("does not replay valid output if the batch persistence callback fails",async()=>{
    const provider=new CacheableFakeProvider();const agent=new LeadQualificationAgent(provider);
    const result=await agent.evaluateWithUsage([candidate],playbook,"DE","Germany","new-market",async()=>{throw new Error("fixture storage failure");});
    expect(result.assessments[0].scoringStatus).toBe("completed");expect(provider.calls).toHaveLength(1);
  });
  it("publishes the first successful batch before a later budget pause",async()=>{
    class PausingProvider extends CacheableFakeProvider {
      override async execute<TInput,TOutput>(request:StructuredAiRequest<TInput>):Promise<StructuredAiResponse<TOutput>>{
        if(this.calls.length)throw new BudgetDeniedError("budget-exhausted");
        return super.execute<TInput,TOutput>(request);
      }
    }
    const provider=new PausingProvider();const agent=new LeadQualificationAgent(provider,{batchSize:1,concurrency:1});
    const saved:string[]=[];
    await expect(agent.evaluateWithUsage([candidate,{...candidate,candidateId:"second"}],playbook,"DE","Germany","new-market",async(_items,assessments)=>{saved.push(...assessments.map(item=>item.candidateId));})).rejects.toThrow(BudgetDeniedError);
    expect(saved).toEqual([candidate.candidateId]);expect(provider.calls).toHaveLength(1);
  });
  it("recomputes the score deterministically and removes invented evidence IDs", async () => {
    const provider = new FakeProvider();
    const agent = new LeadQualificationAgent(provider, { batchSize: 5, concurrency: 1 });
    const [result] = await agent.evaluate([candidate], playbook, "DE", "Germany", "new-market");
    expect(result.totalScore).toBe(82);
    expect(result.roles).toEqual(["VAR", "Reseller"]);
    expect(result.primaryRole).toBe("VAR");
    expect(result.evidenceIds).toEqual(["evidence-valid"]);
    expect(result.warnings).toContain("Model returned unsupported evidence IDs; they were removed.");
    expect(provider.calls).toHaveLength(1);
    expect(JSON.stringify(provider.calls[0].input)).not.toContain("providerScore");
  });

  it("covers every concrete subtype with its own observable evidence and correct family", () => {
    const anchors = Object.entries(CHANNEL_ROLE_FAMILIES).flatMap(([family, roles]) => roles.map(role => {
      const anchor = roleScoringAnchors({ ...candidate.correction, resolvedRoles: [role],
        resolvedFamilies: [family as keyof typeof CHANNEL_ROLE_FAMILIES], primaryRole: role,
        primaryFamily: family as keyof typeof CHANNEL_ROLE_FAMILIES });
      expect(anchor).toMatchObject({ primarySubtype: role, primaryFamily: family });
      expect(anchor?.observableSubtypeEvidence.length).toBeGreaterThan(40);
      return anchor?.observableSubtypeEvidence;
    }));
    expect(new Set(anchors).size).toBe(13);
  });

  it("uses the corrected subtype's anchor independently of the discovery lane", async () => {
    const provider = new FakeProvider();
    await new LeadQualificationAgent(provider).evaluate([{ ...candidate, queryRoles: ["Distributor"] }],
      playbook, "DE", "Germany", "new-market");
    const input = provider.calls[0].input as { candidates: Array<{ roleScoringAnchors: unknown }> };
    expect(input.candidates[0].roleScoringAnchors).toMatchObject({
      primaryFamily: "resale", primarySubtype: "VAR", scorecardKey: "resale-services",
    });
  });

  it("keeps invalid or unresolved roles unscored without contaminating valid batch contracts", async () => {
    const provider = new CacheableFakeProvider();
    const agent = new LeadQualificationAgent(provider);
    const pending = [
      { ...candidate, candidateId: "wrong-family", correction: { ...candidate.correction, primaryFamily: "services" as const } },
      { ...candidate, candidateId: "unresolved", correction: { ...candidate.correction, primaryRole: "Unresolved" as const } },
      { ...candidate, candidateId: "hybrid", correction: { ...candidate.correction, primaryRole: "Hybrid" as const,
        primaryFamily: null, resolvedRoles: ["VAR", "SI"] as Array<"VAR" | "SI">,
        resolvedFamilies: ["resale", "services"] as Array<"resale" | "services"> } },
    ];
    const expected = agent.cacheContracts([candidate], playbook, "DE", "Germany", "new-market");
    expect(agent.cacheContracts([...pending, candidate], playbook, "DE", "Germany", "new-market")).toEqual(expected);
    const result = await agent.evaluateWithUsage([...pending, candidate], playbook, "DE", "Germany", "new-market");
    expect(provider.calls).toHaveLength(1);
    expect(result.assessments.map(item=>item.scoringStatus)).toEqual([
      "retry-required", "retry-required", "retry-required", "completed",
    ]);
    expect(result.assessments.slice(0, 3).every(item=>item.eligibilityStatus === "research-required")).toBe(true);
    expect(agent.completedCacheContracts(result.assessments)).toEqual(expected);
  });

  it("fails the networking gate when the model relies only on generic IT wording", async () => {
    const provider = new FakeProvider();
    const agent = new LeadQualificationAgent(provider, { batchSize: 5, concurrency: 1 });
    const genericCandidate = {
      ...candidate,
      evidence: [{ ...candidate.evidence[0], excerpt: "Cloud connectivity, managed IT and structured cabling",
        contentHash: leadEvidenceContentHash("Cloud connectivity, managed IT and structured cabling") }],
    };
    const [result] = await agent.evaluate([genericCandidate], playbook, "DE", "Germany", "new-market");
    expect(result.gates.networkingRelevant).toBe("conflicting");
    expect(result.eligible).toBe(false);
    expect(result.totalScore).toBe(76);
    expect(result.warnings.join(" ")).toContain("conflicts");
  });

  it("does not use a discovery summary to prove role or networking claims", async () => {
    const provider = new FakeProvider();
    const agent = new LeadQualificationAgent(provider, { batchSize: 5, concurrency: 1 });
    const summaryOnlyCandidate = {
      ...candidate,
      evidence: [
        { ...candidate.evidence[0], id: "evidence-discovery", sourceType: "discovery" as const,
          excerpt: "Search summary: VAR selling routers and PoE switches with business quotations.",
          contentHash: leadEvidenceContentHash("Search summary: VAR selling routers and PoE switches with business quotations.") },
        { ...candidate.evidence[0], id: "evidence-valid", url: "https://example.de/about",
          sourceType: "official-website" as const,
          excerpt: "Example GmbH is a registered local company serving business customers in Germany.",
          contentHash: leadEvidenceContentHash("Example GmbH is a registered local company serving business customers in Germany.") },
      ],
    };
    const [result] = await agent.evaluate([summaryOnlyCandidate], playbook, "DE", "Germany", "new-market");
    expect(result.gates.networkingRelevant).toBe("conflicting");
    expect(result.eligible).toBe(false);
  });

  it("keeps a valuable lead eligible after the correction agent reroutes an originally mismatched lane", async () => {
    const provider = new FakeProvider();
    const agent = new LeadQualificationAgent(provider, { batchSize: 5, concurrency: 1 });
    const rerouted = { ...candidate, queryFamily: "distribution" as const,
      correction: { ...candidate.correction, resolvedFamilies: ["resale" as const], routingChanged: true } };
    const [result] = await agent.evaluate([rerouted], playbook, "DE", "Germany", "new-market");
    expect(result.eligible).toBe(true);
    expect(result.totalScore).toBe(82);
    expect(result.roles).toEqual(["VAR", "Reseller"]);
  });

  it("excludes strong prior-run evidence until it is reacquired or revalidated into the current snapshot", async () => {
    const provider = new FakeProvider();
    const agent = new LeadQualificationAgent(provider, { batchSize: 5, concurrency: 1 });
    const priorRunCandidate = { ...candidate, evidence: [{ ...candidate.evidence[0],
      evidenceRunId: "run-v1-7", priorRunId: "run-v1-7", freshnessStatus: "stale" as const }] };
    const [result] = await agent.evaluate([priorRunCandidate], playbook, "DE", "Germany", "new-market");
    expect(JSON.stringify(provider.calls.map((call) => call.input))).not.toContain("evidence-valid");
    expect(result.evidenceIds).toEqual([]);
    expect(result.gates.networkingRelevant).not.toBe("supported");
    expect(result.eligibilityStatus).not.toBe("eligible");
  });

  it("splits routine batches when the serialized input exceeds the prompt budget", async () => {
    const provider = new FakeProvider();
    const largeCandidate = { ...candidate, evidence: [{ ...candidate.evidence[0],
      excerpt: `${candidate.evidence[0].excerpt} ${"routing portfolio customer scenario ".repeat(350)}`,
      contentHash: leadEvidenceContentHash(`${candidate.evidence[0].excerpt} ${"routing portfolio customer scenario ".repeat(350)}`),
    }] };
    const agent = new LeadQualificationAgent(provider, {
      batchSize: 5,
      maxBatchInputCharacters: 10_000,
      concurrency: 1,
    });
    await agent.evaluate([largeCandidate, largeCandidate], playbook, "DE", "Germany", "new-market");
    const routineCalls = provider.calls.filter((call) => call.modelVersion === "deepseek-v4-flash");
    expect(routineCalls).toHaveLength(2);
    expect(routineCalls.every((call) => (call.input as { candidates: unknown[] }).candidates.length === 1)).toBe(true);
  });

  it("computes path FitScore in code and retains only the best path when all are below 65", async () => {
    const path = (pathId: string, roleFit: number) => ({ pathId,
      pathType: "Direct Downstream Channel Supply", candidateRole: "VAR",
      fitComponents: { roleStructureFit: roleFit, userStageAndSupplyFit: 10,
        productCustomerScenarioFit: 10, procurementAndInfluence: 5, executionFeasibility: 5 },
      findingIds: ["finding-path"], evidenceIds: ["evidence-valid"], reason: `Path ${pathId}`,
      prerequisites: [], risks: [], unknowns: [], allowedInExternalEmail: true });
    const provider = new FakeProvider({ cooperationPaths: [path("lower", 10), path("higher", 20)] });
    const [result] = await new LeadQualificationAgent(provider, { concurrency: 1 })
      .evaluate([candidate], playbook, "DE", "Germany", "new-market");
    expect(result.cooperationPaths).toHaveLength(1);
    expect(result.cooperationPaths[0]).toMatchObject({ pathId: "higher", fitScore: 50, rank: 1 });
    expect(result.cooperationPaths[0]).not.toHaveProperty("confidence");
  });

  it("supports scoring-only evaluation without generating or requiring cooperation paths", async () => {
    const provider = new FakeProvider();
    const [result] = await new LeadQualificationAgent(provider, {
      concurrency: 1,
      includeCooperationPaths: false,
    }).evaluate([candidate], playbook, "DE", "Germany", "search-quality-evaluation");
    expect(result.totalScore).toBe(82);
    expect(result.eligible).toBe(true);
    expect(result.cooperationPaths).toEqual([]);
    expect(result.selectedPathId).toBeNull();
    expect(result.promptVersion).toBe("lead-value-v10-role-anchors-score-only");
    expect(JSON.stringify(provider.calls[0].outputSchema)).not.toContain("cooperationPaths");
    expect(JSON.stringify(provider.calls[0].input)).toContain("scoring-only task");
    expect(provider.calls[0].dataClassification).toBe("public");
  });

  it("keeps qualification private when a playbook contains user path memory", async () => {
    const provider = new FakeProvider();
    await new LeadQualificationAgent(provider, { concurrency: 1, includeCooperationPaths: false })
      .evaluate([candidate], { ...playbook, cooperationPathMemory: [{
        selectedPathType: "Direct Downstream Channel Supply", learnedAt: "2026-09-08T00:00:00Z",
      }] }, "DE", "Germany", "search-quality-evaluation");
    expect(provider.calls[0].dataClassification).toBe("private-workspace");
  });

  it("does not duplicate a semantic escalation when routine and escalation models are identical", async () => {
    const provider = new FakeProvider({ escalation: { required: true, expectedTotalScoreChange: 9,
      criticalStateChanges: [], higherCapabilityCanResolve: true, reason: "Material score ambiguity." } });
    const [result] = await new LeadQualificationAgent(provider, {
      routineModel: "same-model", escalationModel: "same-model", concurrency: 1,
    }).evaluate([candidate], playbook, "DE", "Germany", "new-market");
    expect(provider.calls).toHaveLength(1);
    expect(result.warnings[0]).toContain("identical");
  });

  it("does not promote an infrastructure failure to the Pro model", async () => {
    const provider = new FakeProvider({ fail: true });
    const [result] = await new LeadQualificationAgent(provider, {
      routineModel: "routine-model", escalationModel: "pro-model", concurrency: 1,
    }).evaluate([candidate], playbook, "DE", "Germany", "new-market");
    expect(provider.calls.map((call) => call.modelVersion)).toEqual(["routine-model"]);
    expect(result.scoringStatus).toBe("retry-required");
    expect(result.warnings.join(" ")).toContain("does not qualify for Pro escalation");
  });

  it("uses one same-tier repair for malformed routine output before considering semantic escalation", async () => {
    const provider = new FakeProvider({ malformedFirst: true });
    const [result] = await new LeadQualificationAgent(provider, {
      routineModel: "routine-model", escalationModel: "pro-model", concurrency: 1,
    }).evaluate([candidate], playbook, "DE", "Germany", "new-market");
    expect(provider.calls.map((call) => call.modelVersion)).toEqual(["routine-model", "routine-model"]);
    expect(result.scoringStatus).toBe("completed");
    expect(result.warnings.join(" ")).toContain("Same-tier single-candidate schema repair succeeded");
  });

  it("cannot publish a target-country gate that contradicts correction-stage evidence", async () => {
    const provider = new FakeProvider();
    const wrongCountry = { ...candidate, correction: { ...candidate.correction,
      findings: candidate.correction.findings.map((finding) => finding.kind === "country-presence"
        ? { ...finding, status: "not-supported" as const, statement: "The company operates only in Peru." }
        : finding) } };
    const [result] = await new LeadQualificationAgent(provider, { concurrency: 1, includeCooperationPaths: false })
      .evaluate([wrongCountry], playbook, "CO", "Colombia", "search-quality-evaluation");
    expect(result.gates.targetCountryPresence).toBe("not-supported");
    expect(result.eligible).toBe(false);
    expect(result.warnings.join(" ")).toContain("not corroborated");
  });

  it("caps unsupported maximum scale and weak cooperation influence without treating unknown as zero", async () => {
    const assessment = (await new LeadQualificationAgent(new FakeProvider(), {
      concurrency: 1, includeCooperationPaths: false,
    }).evaluate([candidate], playbook, "DE", "Germany", "search-quality-evaluation"))[0];
    const exaggerated = { ...assessment, companyScaleClass: "Unknown" as const,
      dimensions: { ...assessment.dimensions, scaleAndChannelCoverage: 15,
        cooperationPathAndBuyingInfluence: 15 }, totalScore: 100 };
    const normalized = enforceAssessmentEvidenceCaps(candidate, exaggerated);
    expect(normalized.dimensions.scaleAndChannelCoverage).toBe(8);
    expect(normalized.dimensions.cooperationPathAndBuyingInfluence).toBeLessThan(15);
    expect(normalized.totalScore).toBeLessThan(100);
    expect(normalized.warnings.join(" ")).toContain("neutral 8/15");
  });
});
