import { describe, expect, it } from "vitest";
import {createHash} from "node:crypto";
import {BudgetDeniedError} from "@/lib/billing/policy";
import {currentSpendContext,withProductSpend} from "@/lib/billing/context";
import {companyCostKey} from "@/lib/billing/company-cost-context";

import type { AiProvider, StructuredAiRequest, StructuredAiResponse } from "@/providers/contracts";
import {DeepSeekProvider} from "@/providers/deepseek";
import {OpenAiCompatibleProvider} from "@/providers/openai-compatible";
import {ResilientAiProvider} from "@/providers/resilient-ai";
import { leadEvidenceContentHash } from "@/lib/leads/evidence-snapshot";

import { enforceAssessmentEvidenceCaps, LeadQualificationAgent } from "./qualification-agent";
import {assessmentDependencyFingerprint,validCachedAssessment} from "./assessment-cache";
import { roleScoringAnchors } from "./role-scoring-anchors";
import {validateQualificationPhaseOutput,type QualificationPhaseOutput} from "./qualification-phase-output";
import {planQualificationFactPhases} from "./qualification-phase-plan";
import type {productQualificationPhaseCheckpoint} from "./qualification-phase-checkpoint";
import type {productQualificationFinalCheckpoint} from "./qualification-final-checkpoint";
import type {productQualificationSingletonChunkCheckpoint} from "./qualification-singleton-checkpoint";
import {validateQualificationSingletonChunkOutput} from "./qualification-singleton-chunks";
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

function uniqueFactCandidate(count: number): CorrectedLeadWorkflowCandidate {
  const extras = Array.from({ length: count }, (_, index) => {
    const excerpt = `Evidence ${index}: ${`independent networking fact ${index} `.repeat(7).trim()}`;
    return { ...candidate.evidence[0], id: `unique-${index}`,
      url: `https://example.de/evidence/${index}`, title: `Unique source ${index}`,
      excerpt, contentHash: leadEvidenceContentHash(excerpt) };
  });
  return { ...candidate, evidence: [...candidate.evidence, ...extras], correction: {
    ...candidate.correction, findings: [...candidate.correction.findings,
      ...extras.map((item, index) => ({ ...candidate.correction.findings[2],
        findingId: `unique-finding-${index}`, statement: `Distinct product and customer fact ${index}: ${item.excerpt.slice(0, 90)}`,
        evidenceIds: [item.id] }))] } };
}

function incompressibleCandidate(count=150):CorrectedLeadWorkflowCandidate{
  const large=uniqueFactCandidate(count);
  const extras=large.evidence.slice(1).map((item,index)=>{
    const excerpt=Array.from({length:9},(_,part)=>createHash("sha256")
      .update(`independent-${index}-${part}`).digest("hex")).join(" ");
    return {...item,excerpt,contentHash:leadEvidenceContentHash(excerpt)};
  });
  large.evidence=[large.evidence[0],...extras];
  large.correction.findings=large.correction.findings.map((item,index)=>index<5?item:{...item,
    statement:`Fact ${index}: ${createHash("sha256").update(`finding-${index}`).digest("hex")}`});
  return large;
}

describe("LeadQualificationAgent", () => {
  it("keeps 155 facts and 151 sources inside the actual compatible final wire without model calls",()=>{
    const primary=new DeepSeekProvider({apiKey:"fixture-never-sent",maxAttempts:1,
      fetchImplementation:async()=>{throw new Error("No provider transport is allowed");}});
    const fallback=new OpenAiCompatibleProvider({id:"fixture-compatible",apiKey:"fixture-never-sent",
      baseUrl:"https://example.invalid/v1",maxAttempts:1,
      extraBody:{provider:{require_parameters:true,data_collection:"deny"}},
      fetchImplementation:async()=>{throw new Error("No provider transport is allowed");}});
    const openRouterDeepSeek=new OpenAiCompatibleProvider({id:"fixture-deepseek-compatible",
      apiKey:"fixture-never-sent",baseUrl:"https://example.invalid/v1",maxAttempts:1,
      extraBody:{provider:{require_parameters:true,data_collection:"deny"},
        reasoning:{effort:"none"}},
      fetchImplementation:async()=>{throw new Error("No provider transport is allowed");}});
    const compatibleRequest=(request:StructuredAiRequest<unknown>)=>({...request,
      modelVersion:"openai/gpt-4o-mini"});
    const provider=new ResilientAiProvider(primary,{fallbacks:[
      {provider:openRouterDeepSeek,routineModel:"deepseek/deepseek-v4-flash",
        escalationModel:"deepseek/deepseek-v4-pro",approvedDataClassifications:["public"]},
      {provider:fallback,routineModel:"openai/gpt-4o-mini",escalationModel:"openai/gpt-4o",
        approvedDataClassifications:["public"]}]});
    const requestBytes=provider.requestBytes.bind(provider);
    const large=incompressibleCandidate(150),agent=new LeadQualificationAgent(provider,
      {includeCooperationPaths:true,batchSize:1,concurrency:1});
    const plan=planQualificationFactPhases({candidate:large,playbook,countryCode:"DE",
      countryName:"Germany",objective:"new-market",modelVersion:"deepseek-v4-flash",requestBytes});
    const outputs=plan.phases.map(request=>{
      const input=request.input as {candidate:{findings:Array<{findingId:string;evidenceIds:string[]}>};
        unlinkedEvidenceIds:string[]};
      return {facts:input.candidate.findings.map(item=>({findingId:item.findingId,
        materiality:"material" as const,summary:`Screened ${item.findingId} ${"context ".repeat(2)}`,
        evidenceIds:item.evidenceIds})),
        sources:input.unlinkedEvidenceIds.map(id=>({evidenceId:id,materiality:"context" as const,
          summary:`Screened ${id} ${"context ".repeat(2)}`}))};
    });
    const final=agent.planPhasedFinalRequest(large,playbook,"DE","Germany","new-market",outputs);
    expect(final.synthesis.facts).toHaveLength(large.correction.findings.length);
    expect(final.synthesis.sources).toHaveLength(large.evidence.length);
    expect(fallback.requestBytes(compatibleRequest(final.request))).toBeLessThanOrEqual(61_440);
    expect(fallback.requestBytes({...final.request,modelVersion:"openai/gpt-4o"}))
      .toBeLessThanOrEqual(61_440);
    expect(openRouterDeepSeek.requestBytes({...final.request,
      modelVersion:"deepseek/deepseek-v4-flash"})).toBeLessThanOrEqual(61_440);
    expect(primary.requestBytes(final.request)).toBeLessThanOrEqual(61_440);
    expect(provider.requestBytes(final.request)).toBeLessThanOrEqual(61_440);
    expect(final.request.preparation?.originalMaximumWireBytes).toBeGreaterThan(61_440);
    expect((final.request.input as {phaseScreening:{sourceReferenceEncoding?:string}})
      .phaseScreening.sourceReferenceEncoding).toBe("source-row-index-v1");
  });

  it("saves every oversized fact phase before a bounded final score and derives its durable cache contract",async()=>{
    class PhaseProvider extends FakeProvider {
      private readonly wire=new DeepSeekProvider({apiKey:"fixture-never-sent",maxAttempts:1,
        fetchImplementation:async()=>{throw new Error("Synthetic phase test must not use transport");}});
      phaseCalls=0;failPhaseAt=0;fallbackPhaseAt=0;invalidPhaseAt=0;
      finalFallback=false;finalInvalid=false;approvedFallback=false;
      private fallbackRequest(request:StructuredAiRequest<unknown>){return {...request,
        modelVersion:request.modelVersion.includes("pro")?"fallback-pro":"fallback-routine"};}
      requestBytes(request:StructuredAiRequest<unknown>){return Math.max(this.wire.requestBytes(request),
        this.approvedFallback?this.wire.requestBytes(this.fallbackRequest(request)):0);}
      cacheIdentity(request:StructuredAiRequest<unknown>){return this.wire.cacheIdentity(request);}
      paidRequestFingerprint(request:StructuredAiRequest<unknown>){return this.wire.paidRequestFingerprint(request);}
      executionRoutes(request:StructuredAiRequest<unknown>){
        const primary={providerId:"fake",request,cacheIdentity:this.cacheIdentity(request),
          paidRequestFingerprint:this.paidRequestFingerprint(request)};
        if(!this.approvedFallback)return [primary];
        const alternate=this.fallbackRequest(request);
        return [primary,{providerId:"fallback",request:alternate,
          cacheIdentity:this.cacheIdentity(alternate),paidRequestFingerprint:this.paidRequestFingerprint(alternate)}];
      }
      override async execute<I,O>(request:StructuredAiRequest<I>):Promise<StructuredAiResponse<O>>{
        if(request.promptVersion!=="qualification-fact-phase-v1"){
          const response=await super.execute<I,O>(request);
          return {...response,output:this.finalInvalid?{assessments:[]} as O:response.output,
            actualProviderId:this.finalFallback?"fallback":"fake",
            modelVersion:this.finalFallback&&this.approvedFallback
              ?this.fallbackRequest(request).modelVersion:response.modelVersion,
            requestedModelVersion:this.finalFallback&&this.approvedFallback
              ?request.modelVersion:undefined};
        }
        this.calls.push(request as StructuredAiRequest<unknown>);this.phaseCalls++;
        if(this.phaseCalls===this.failPhaseAt)throw new BudgetDeniedError("budget-exhausted");
        const input=request.input as {candidate:{findings:Array<{findingId:string;evidenceIds:string[]}>};
          unlinkedEvidenceIds:string[]};
        const fallback=this.phaseCalls===this.fallbackPhaseAt;
        return {output:{facts:(this.phaseCalls===this.invalidPhaseAt?[]:input.candidate.findings)
          .map(item=>({findingId:item.findingId,
          materiality:"material",summary:`Screened ${item.findingId}`,evidenceIds:item.evidenceIds})),
          sources:input.unlinkedEvidenceIds.map(id=>({evidenceId:id,materiality:"context",
            summary:`Screened ${id}`}))} as O,modelVersion:fallback&&this.approvedFallback
              ?this.fallbackRequest(request).modelVersion:request.modelVersion,
          promptVersion:request.promptVersion,latencyMs:5,warnings:[],
          actualProviderId:fallback?"fallback":"fake",
          requestedModelVersion:fallback&&this.approvedFallback?request.modelVersion:undefined,
          usage:{promptTokens:10,completionTokens:5,reasoningTokens:0,totalTokens:15}};
      }
    }
    const records=new Map<string,StructuredAiResponse<QualificationPhaseOutput>>();
    let checkpointWriteFails=false;
    const checkpointFactory=((scope:{userId:string;workspaceId:string;actionId:string;countryCode:string;
      expectedProviderId:string})=>({
      load:async(request:StructuredAiRequest<unknown>,contract:string,paid:string)=>
        records.get(`${scope.actionId}:${scope.countryCode}:${contract}:${paid}`)??null,
      save:async(request:StructuredAiRequest<unknown>,contract:string,paid:string,
        response:StructuredAiResponse<unknown>)=>{
        if(response.actualProviderId!==scope.expectedProviderId)throw new Error("actual route differs");
        const output=validateQualificationPhaseOutput(request,response.output);
        if(checkpointWriteFails)throw new Error("synthetic checkpoint unavailable");
        const key=`${scope.actionId}:${scope.countryCode}:${contract}:${paid}`;
        if(records.has(key))throw new Error("duplicate phase paid request");
        records.set(key,{...response,output});
      },
    })) as typeof productQualificationPhaseCheckpoint;
    const finalRecords=new Map<string,StructuredAiResponse<unknown>>();
    let finalWriteFails=false,proWriteFails=false;
    const finalCheckpointFactory=((scope:{userId:string;workspaceId:string;actionId:string;
      countryCode:string;expectedProviderId:string})=>({
      load:async(_request:StructuredAiRequest<unknown>,contract:string,paid:string)=>
        finalRecords.get(`${scope.actionId}:${scope.countryCode}:${contract}:${paid}`)??null,
      save:async(_request:StructuredAiRequest<unknown>,contract:string,paid:string,
        response:StructuredAiResponse<unknown>)=>{
        if(response.actualProviderId!==scope.expectedProviderId)throw new Error("final actual route differs");
        if(finalWriteFails||(proWriteFails&&response.modelVersion==="deepseek-v4-pro"))
          throw new Error("synthetic final checkpoint unavailable");
        const key=`${scope.actionId}:${scope.countryCode}:${contract}:${paid}`;
        if(finalRecords.has(key))throw new Error("duplicate final paid request");
        finalRecords.set(key,response);
      },
    })) as typeof productQualificationFinalCheckpoint;
    const provider=new PhaseProvider(),large=incompressibleCandidate(150);
    const agent=new LeadQualificationAgent(provider,{batchSize:1,concurrency:1,
      includeCooperationPaths:false,phaseCheckpointFactory:checkpointFactory,
      finalCheckpointFactory});
    const scope={userId:"fixture-owner",workspaceId:"fixture-workspace",actionId:"fixture-action"};
    provider.failPhaseAt=2;
    await expect(agent.evaluateWithUsage([large],playbook,"DE","Germany","new-market",undefined,scope))
      .rejects.toThrow(BudgetDeniedError);
    expect(records.size).toBe(1);
    const firstContract=provider.cacheIdentity(provider.calls[0]);
    provider.failPhaseAt=0;
    const published:string[]=[];
    const result=await agent.evaluateWithUsage([large],playbook,"DE","Germany","new-market",
      async(_items,assessments)=>{published.push(...assessments.map(item=>item.candidateId));},scope);
    expect(result.assessments[0].scoringStatus).toBe("completed");
    expect(records.size).toBeGreaterThan(1);
    expect(provider.calls.filter(request=>provider.cacheIdentity(request)===firstContract)).toHaveLength(1);
    expect(provider.calls.at(-1)?.promptVersion).not.toBe("qualification-fact-phase-v1");
    expect(provider.requestBytes(provider.calls.at(-1)!)).toBeLessThanOrEqual(57_344);
    expect(result.usage).toHaveLength(provider.calls.length-2);
    expect(published).toEqual([large.candidateId]);
    const completed=agent.completedCacheContracts(result.assessments).get(large.candidateId);
    expect(completed).toMatch(/^[a-f0-9]{64}$/);
    expect((await agent.phasedCacheContracts([large],playbook,"DE","Germany","new-market",scope))
      .get(large.candidateId)).toBe(completed);
    expect(finalRecords.size).toBe(1);
    const priorCalls=provider.calls.length;
    const reused=await agent.evaluateWithUsage([large],playbook,"DE","Germany","new-market",undefined,scope);
    expect(reused.assessments[0].scoringStatus).toBe("completed");
    expect(reused.usage).toHaveLength(0);
    expect(provider.calls).toHaveLength(priorCalls);
    for(const mode of ["fallback","invalid","write-failure"] as const){
      records.clear();provider.calls.length=0;provider.phaseCalls=0;
      provider.fallbackPhaseAt=mode==="fallback"?1:0;
      provider.invalidPhaseAt=mode==="invalid"?1:0;
      checkpointWriteFails=mode==="write-failure";
      await expect(agent.evaluateWithUsage([large],playbook,"DE","Germany","new-market",
        undefined,scope)).rejects.toThrow(mode==="fallback"?/actual route differs/
        :mode==="invalid"?/missing or extra/:/checkpoint unavailable/);
      expect(provider.calls).toHaveLength(1);
      expect(records.size).toBe(0);
    }
    records.clear();finalRecords.clear();provider.calls.length=0;provider.phaseCalls=0;
    provider.fallbackPhaseAt=0;provider.invalidPhaseAt=0;checkpointWriteFails=false;
    await agent.evaluateWithUsage([large],playbook,"DE","Germany","new-market",undefined,scope);
    expect(finalRecords.size).toBe(1);
    for(const mode of ["fallback","write-failure","invalid"] as const){
      finalRecords.clear();provider.calls.length=0;
      provider.finalFallback=mode==="fallback";
      provider.finalInvalid=mode==="invalid";
      finalWriteFails=mode==="write-failure";
      if(mode==="invalid"){
        const failed=await agent.evaluateWithUsage([large],playbook,"DE","Germany","new-market",undefined,scope);
        expect(failed.assessments[0].scoringStatus).toBe("retry-required");
        expect(finalRecords.size).toBe(1);
        const calls=provider.calls.length;
        await agent.evaluateWithUsage([large],playbook,"DE","Germany","new-market",undefined,scope);
        expect(provider.calls).toHaveLength(calls);
      }else{
        await expect(agent.evaluateWithUsage([large],playbook,"DE","Germany","new-market",
          undefined,scope)).rejects.toThrow(mode==="fallback"?/actual route differs/
          :/final checkpoint unavailable/);
        expect(provider.calls).toHaveLength(1);
        expect(finalRecords.size).toBe(0);
      }
    }
    const semantic={required:true,expectedTotalScoreChange:8,criticalStateChanges:[],
      higherCapabilityCanResolve:true,reason:"Material evidence conflict"};
    const proProvider=new PhaseProvider({escalation:semantic});
    const proAgent=new LeadQualificationAgent(proProvider,{routineModel:"deepseek-v4-flash",
      escalationModel:"deepseek-v4-pro",includeCooperationPaths:false,batchSize:1,concurrency:1,
      phaseCheckpointFactory:checkpointFactory,finalCheckpointFactory});
    const proScope={...scope,actionId:"fixture-pro-write-failure"};
    proWriteFails=true;
    await expect(proAgent.evaluateWithUsage([large],playbook,"DE","Germany","new-market",
      undefined,proScope)).rejects.toThrow(/final checkpoint unavailable/);
    expect(proProvider.calls.at(-2)?.modelVersion).toBe("deepseek-v4-flash");
    expect(proProvider.calls.at(-1)?.modelVersion).toBe("deepseek-v4-pro");
    expect(proProvider.requestBytes(proProvider.calls.at(-1)!)).toBeLessThanOrEqual(57_344);
    proWriteFails=false;
    const successfulProScope={...scope,actionId:"fixture-pro-complete"};
    const proResult=await proAgent.evaluateWithUsage([large],playbook,"DE","Germany",
      "new-market",undefined,successfulProScope);
    expect(proProvider.calls.at(-1)?.modelVersion).toBe("deepseek-v4-pro");
    expect(proResult.assessments[0].scoringStatus).toBe("completed");
    expect(proResult.assessments[0].escalated).toBe(true);
    const proContract=proAgent.completedCacheContracts(proResult.assessments).get(large.candidateId);
    expect(proContract).toMatch(/^[a-f0-9]{64}$/);
    expect((await proAgent.phasedCacheContracts([large],playbook,"DE","Germany","new-market",successfulProScope))
      .get(large.candidateId)).toBe(proContract);
    const completeProCalls=proProvider.calls.length;
    const reusedPro=await proAgent.evaluateWithUsage([large],playbook,"DE","Germany",
      "new-market",undefined,successfulProScope);
    expect(reusedPro.assessments[0].scoringStatus).toBe("completed");
    expect(reusedPro.usage).toHaveLength(0);
    expect(proProvider.calls).toHaveLength(completeProCalls);
    const subthresholdProvider=new PhaseProvider({escalation:{...semantic,expectedTotalScoreChange:7}});
    const subthresholdAgent=new LeadQualificationAgent(subthresholdProvider,{
      routineModel:"deepseek-v4-flash",escalationModel:"deepseek-v4-pro",
      includeCooperationPaths:false,batchSize:1,concurrency:1,
      phaseCheckpointFactory:checkpointFactory,finalCheckpointFactory});
    const subthreshold=await subthresholdAgent.evaluateWithUsage([large],playbook,"DE","Germany",
      "new-market",undefined,{...scope,actionId:"fixture-below-threshold"});
    expect(subthreshold.assessments[0].escalated).toBe(false);
    expect(subthresholdProvider.calls.filter(request=>request.promptVersion!=="qualification-fact-phase-v1")
      .map(request=>request.modelVersion)).toEqual(["deepseek-v4-flash"]);
    const fallbackProvider=new PhaseProvider();
    fallbackProvider.approvedFallback=true;
    fallbackProvider.fallbackPhaseAt=2;
    fallbackProvider.finalFallback=true;
    const fallbackScope={...scope,actionId:"fixture-approved-fallback"};
    const fallbackAgent=new LeadQualificationAgent(fallbackProvider,{includeCooperationPaths:false,
      batchSize:1,concurrency:1,phaseCheckpointFactory:checkpointFactory,finalCheckpointFactory});
    const fallbackResult=await fallbackAgent.evaluateWithUsage([large],playbook,"DE","Germany",
      "new-market",undefined,fallbackScope);
    expect(fallbackResult.assessments[0].scoringStatus).toBe("completed");
    expect(fallbackResult.usage.some(item=>item.providerId==="fallback")).toBe(true);
    const fallbackContract=fallbackAgent.completedCacheContracts(fallbackResult.assessments)
      .get(large.candidateId);
    expect(fallbackContract).toMatch(/^[a-f0-9]{64}$/);
    expect((await fallbackAgent.phasedCacheContracts([large],playbook,"DE","Germany",
      "new-market",fallbackScope)).get(large.candidateId)).toBe(fallbackContract);
    const fallbackCalls=fallbackProvider.calls.length;
    const fallbackReplay=await fallbackAgent.evaluateWithUsage([large],playbook,"DE","Germany",
      "new-market",undefined,fallbackScope);
    expect(fallbackReplay.assessments[0].scoringStatus).toBe("completed");
    expect(fallbackReplay.usage).toHaveLength(0);
    expect(fallbackProvider.calls).toHaveLength(fallbackCalls);
    class AmbiguousProvider extends PhaseProvider {
      override executionRoutes(request:StructuredAiRequest<unknown>){
        const routes=super.executionRoutes(request);
        return [...routes,routes[0]];
      }
    }
    const ambiguousProvider=new AmbiguousProvider();
    const ambiguousAgent=new LeadQualificationAgent(ambiguousProvider,{includeCooperationPaths:false,
      batchSize:1,concurrency:1,phaseCheckpointFactory:checkpointFactory,finalCheckpointFactory});
    await expect(ambiguousAgent.evaluateWithUsage([large],playbook,"DE","Germany",
      "new-market",undefined,{...scope,actionId:"fixture-ambiguous-route"}))
      .rejects.toThrow(/route identity unavailable/);
    expect(ambiguousProvider.calls).toHaveLength(0);
  },15_000);
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
  it("checkpoints a completed batch before starting more paid scoring after persistence fails",async()=>{
    const provider=new CacheableFakeProvider();const agent=new LeadQualificationAgent(provider,{batchSize:1,concurrency:1});
    const second={...candidate,candidateId:"lead-second"};
    const result=await agent.evaluateWithUsage([candidate,second],playbook,"DE","Germany","new-market",
      async()=>{throw new Error("fixture storage failure");});
    expect(result.assessments.map(item=>item.scoringStatus)).toEqual(["completed","retry-required"]);
    expect(result.assessments[1].eligible).toBe(false);
    expect(result.assessments[1].warnings).toContain(
      "Scoring was deferred after a completed batch could not be saved; no request was sent for this candidate.");
    expect(provider.calls).toHaveLength(1);
  });
  it("defers later batches when a completed fallback score has no reusable cache contract",async()=>{
    const provider=new FakeProvider();const agent=new LeadQualificationAgent(provider,{batchSize:1,concurrency:1});
    const result=await agent.evaluateWithUsage([candidate,{...candidate,candidateId:"lead-second"}],
      playbook,"DE","Germany","new-market",async(_items,assessments)=>{
        expect(agent.completedCacheContracts(assessments).size).toBe(0);
        throw new Error("No safe reusable contract");
      });
    expect(result.assessments.map(item=>item.scoringStatus)).toEqual(["completed","retry-required"]);
    expect(provider.calls).toHaveLength(1);
  });
  it("lets an already in-flight peer settle but starts no third batch after a cache failure",async()=>{
    let releaseSecond:()=>void=()=>{};
    const secondGate=new Promise<void>(resolve=>{releaseSecond=resolve;});
    class InFlightProvider extends CacheableFakeProvider {
      attempts=0;
      override async execute<I,O>(request:StructuredAiRequest<I>):Promise<StructuredAiResponse<O>>{
        if(++this.attempts===2)await secondGate;
        return super.execute<I,O>(request);
      }
    }
    const provider=new InFlightProvider();const agent=new LeadQualificationAgent(provider,{batchSize:1,concurrency:2});
    const result=await agent.evaluateWithUsage([candidate,{...candidate,candidateId:"second"},
      {...candidate,candidateId:"third"}],playbook,"DE","Germany","new-market",async()=>{
        releaseSecond();throw new Error("fixture cache unavailable");
      });
    expect(provider.attempts).toBe(2);
    expect(result.assessments.map(item=>item.scoringStatus)).toEqual(["completed","retry-required","retry-required"]);
  });
  it("defers a missing peer's repair when the complete peer cannot be persisted",async()=>{
    const provider=new CacheableFakeProvider();const agent=new LeadQualificationAgent(provider,{batchSize:5,concurrency:1});
    const result=await agent.evaluateWithUsage([candidate,{...candidate,candidateId:"lead-second"}],
      playbook,"DE","Germany","new-market",async()=>{throw new Error("fixture storage failure");});
    expect(result.assessments.map(item=>item.scoringStatus)).toEqual(["completed","retry-required"]);
    expect(provider.calls).toHaveLength(1);
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

  it("scores an oversized singleton after lossless duplicate evidence compression", async () => {
    const provider = new CacheableFakeProvider();
    const repeated = Array.from({ length: 60 }, (_, index) => ({ ...candidate.evidence[0],
      id: `repeat-${index}`, url: `https://example.de/evidence/${index}` }));
    const large = { ...candidate, evidence: [...candidate.evidence, ...repeated], correction: {
      ...candidate.correction, findings: candidate.correction.findings.map(finding => ({ ...finding,
        evidenceIds: [...finding.evidenceIds, ...repeated.map(item => item.id)] })) } };
    // Increase each repeated source excerpt without changing its stored identity or source ownership.
    large.evidence = large.evidence.map(item => {
      const excerpt = `${item.excerpt} ${"network routers and business customers. ".repeat(90)}`;
      return { ...item, excerpt, contentHash: leadEvidenceContentHash(excerpt) };
    });
    const before = JSON.stringify(large);
    const agent = new LeadQualificationAgent(provider);
    const expected = agent.cacheContracts([large], playbook, "DE", "Germany", "new-market");
    const result = await agent.evaluate([large], playbook, "DE", "Germany", "new-market");
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0].input).toHaveProperty("evidenceTextEncoding", "exact-duplicate-text-v1");
    expect(result[0].scoringStatus).toBe("completed");
    expect(agent.completedCacheContracts(result)).toEqual(expected);
    expect(JSON.stringify(large)).toBe(before);
  });

  it("keeps unique finding-linked evidence through the actual scoring agent's singleton preparation", async () => {
    const provider = new CacheableFakeProvider();
    const large = uniqueFactCandidate(60);
    const original = JSON.stringify(large);
    const agent = new LeadQualificationAgent(provider);
    const result = await agent.evaluate([large], playbook, "DE", "Germany", "new-market");
    expect(result[0].scoringStatus).toBe("completed");
    expect(provider.calls).toHaveLength(1);
    const prepared = provider.calls[0];
    const input = prepared.input as { candidateTableEncoding?: string;
      candidates: Array<{ evidenceTable?: { columns: string[]; rows: unknown[][] };
        findingsTable?: { columns: string[]; rows: unknown[][] } }> };
    expect(input.candidateTableEncoding).toBe("exact-field-table-v1");
    expect(prepared.preparation?.originalMaximumWireBytes).toBeGreaterThan(61_440);
    expect(prepared.preparation?.preparedMaximumWireBytes).toBeLessThanOrEqual(61_440);
    expect(prepared.evidenceIds).toEqual(large.evidence.map(item => item.id));
    const decode = (table: { columns: string[]; rows: unknown[][] }) => table.rows.map(row =>
      Object.fromEntries(table.columns.map((column, index) => [column, row[index]])));
    expect(decode(input.candidates[0].evidenceTable!)).toEqual(large.evidence.map(item => ({
      evidenceId: item.id, sourceType: item.sourceType, url: item.url, title: item.title, excerpt: item.excerpt,
    })));
    expect(decode(input.candidates[0].findingsTable!)).toEqual(large.correction.findings);
    expect(JSON.stringify(large)).toBe(original);
  });

  it("sends 100 distinct finding-linked facts through an exact shared-phrase dictionary", async () => {
    const provider = new CacheableFakeProvider();
    const large = uniqueFactCandidate(100);
    const original = JSON.stringify(large);
    const agent=new LeadQualificationAgent(provider);
    const expected=agent.cacheContracts([large],playbook,"DE","Germany","new-market");
    const result=await agent.evaluate([large],playbook,"DE","Germany","new-market");
    expect(result[0].scoringStatus).toBe("completed");
    expect(provider.calls).toHaveLength(1);
    const prepared=provider.calls[0];
    expect(prepared.preparation?.encoding).toContain("exact-shared-phrase-v1");
    expect(prepared.preparation?.originalMaximumWireBytes).toBeGreaterThan(61_440);
    expect(prepared.preparation?.preparedMaximumWireBytes).toBeLessThanOrEqual(61_440);
    expect(prepared.preparation).toMatchObject({evidenceItems:101,findingItems:105});
    const actualWire=new DeepSeekProvider({apiKey:"fixture",maxAttempts:1});
    expect(actualWire.requestBytes(prepared)).toBe(prepared.preparation?.preparedMaximumWireBytes);
    expect(prepared.evidenceIds).toEqual(large.evidence.map(item=>item.id));
    const input=prepared.input as {sharedPhraseDictionary:Record<string,string>;candidates:Array<{
      evidenceTable:{columns:string[];rows:unknown[][]};findingsTable:{columns:string[];rows:unknown[][]}}>} ;
    const expand=(value:unknown):unknown=>typeof value==="string"
      ?Object.entries(input.sharedPhraseDictionary).reduce((text,[marker,phrase])=>text.replaceAll(marker,phrase),value):value;
    const decode=(table:{columns:string[];rows:unknown[][]})=>table.rows.map(row=>
      Object.fromEntries(table.columns.map((column,index)=>[column,expand(row[index])])));
    expect(decode(input.candidates[0].evidenceTable)).toEqual(large.evidence.map(item=>({
      evidenceId:item.id,sourceType:item.sourceType,url:item.url,title:item.title,excerpt:item.excerpt,
    })));
    expect(decode(input.candidates[0].findingsTable)).toEqual(large.correction.findings);
    expect(agent.completedCacheContracts(result)).toEqual(expected);
    expect(JSON.stringify(large)).toBe(original);
  });

  it("keeps a truly incompressible full-agent singleton incomplete before any model request", async () => {
    const provider=new CacheableFakeProvider();
    const large=incompressibleCandidate();
    const original=JSON.stringify(large);
    const result=await new LeadQualificationAgent(provider).evaluate([large],playbook,"DE","Germany","new-market");
    expect(result[0]).toMatchObject({candidateId:large.candidateId,eligible:false,
      scoringStatus:"retry-required",eligibilityStatus:"research-required"});
    expect(result[0].warnings.join(" ")).toContain("exceeds the approved byte limit");
    expect(provider.calls).toHaveLength(0);
    expect(JSON.stringify(large)).toBe(original);
  });

  it("resumes an oversized critical finding at saved chunks and then reaches the bounded final score",async()=>{
    class ChunkProvider extends FakeProvider {
      private readonly wire=new DeepSeekProvider({apiKey:"fixture-never-sent",maxAttempts:1,
        fetchImplementation:async()=>{throw new Error("Synthetic chunk test must not use transport");}});
      private readonly fallbackWire=new OpenAiCompatibleProvider({id:"fallback",
        apiKey:"fixture-never-sent",baseUrl:"https://fixture.invalid/v1",maxAttempts:1,
        fetchImplementation:async()=>{throw new Error("Synthetic fallback must not use transport");}});
      failChunkAt=0;chunkAttempts=0;finalTooLarge=false;uncertainChunk=false;
      approvedFallback=false;fallbackChunkAt=0;
      requestBytes(request:StructuredAiRequest<unknown>){
        if(this.finalTooLarge&&(request.input as {phaseScreening?:unknown}|null)?.phaseScreening)
          return 1_000_000;
        return this.approvedFallback?Math.max(this.wire.requestBytes(request),
          this.fallbackChunkBytes(request)):this.wire.requestBytes(request);
      }
      fallbackChunkBytes(request:StructuredAiRequest<unknown>){return this.fallbackWire.requestBytes({
        ...request,modelVersion:"openai/gpt-4o"});}
      cacheIdentity(request:StructuredAiRequest<unknown>){return this.wire.cacheIdentity(request);}
      paidRequestFingerprint(request:StructuredAiRequest<unknown>){return this.wire.paidRequestFingerprint(request);}
      executionRoutes(request:StructuredAiRequest<unknown>){
        const primary={providerId:"fake",request,cacheIdentity:this.cacheIdentity(request),
          paidRequestFingerprint:this.paidRequestFingerprint(request)};
        if(!this.approvedFallback)return [primary];
        const alternate={...request,modelVersion:"openai/gpt-4o"};
        return [primary,{providerId:"fallback",request:alternate,
          cacheIdentity:this.fallbackWire.cacheIdentity(alternate),
          paidRequestFingerprint:this.fallbackWire.paidRequestFingerprint(alternate)}];
      }
      override async execute<I,O>(request:StructuredAiRequest<I>):Promise<StructuredAiResponse<O>>{
        if(request.promptVersion==="qualification-singleton-chunk-v1"){
          this.chunkAttempts++;
          if(this.chunkAttempts===this.failChunkAt)throw new BudgetDeniedError("budget-exhausted");
          this.calls.push(request as StructuredAiRequest<unknown>);
          const input=request.input as {unitKind:"finding"|"evidence";unitId:string;chunkIndex:number;
            evidenceIds:string[]};
          const fallback=this.approvedFallback&&this.chunkAttempts===this.fallbackChunkAt;
          return {output:{unitKind:input.unitKind,unitId:input.unitId,chunkIndex:input.chunkIndex,
            materiality:this.uncertainChunk?"uncertain":"material",
            summary:`Segment ${input.chunkIndex} screened for role review`,
            citedEvidenceIds:input.evidenceIds} as O,
            modelVersion:fallback?"openai/gpt-4o":request.modelVersion,
            requestedModelVersion:fallback?request.modelVersion:undefined,
            promptVersion:request.promptVersion,actualProviderId:fallback?"fallback":"fake",
            latencyMs:5,warnings:[]};
        }
        if(request.promptVersion==="qualification-fact-phase-v1"){
          this.calls.push(request as StructuredAiRequest<unknown>);
          const input=request.input as {candidate:{findings:Array<{findingId:string;evidenceIds:string[]}>};
            unlinkedEvidenceIds:string[]};
          return {output:{facts:input.candidate.findings.map(item=>({findingId:item.findingId,
            materiality:"uncertain",summary:"Role remains uncertain",evidenceIds:item.evidenceIds})),
            sources:input.unlinkedEvidenceIds.map(evidenceId=>({evidenceId,materiality:"uncertain",
              summary:"Source needs review"}))} as O,modelVersion:request.modelVersion,
            promptVersion:request.promptVersion,actualProviderId:"fake",latencyMs:5,warnings:[]};
        }
        return {...await super.execute<I,O>(request),actualProviderId:"fake"};
      }
    }
    const long=structuredClone(candidate);
    long.correction.findings.find(item=>item.findingId==="finding-role")!.statement=
      Array.from({length:2_000},(_,index)=>createHash("sha256").update(`long-role-${index}`)
        .digest("hex")).join("");
    const original=JSON.stringify(long);
    const provider=new ChunkProvider();
    const chunks=new Map<string,StructuredAiResponse<unknown>>();
    const phases=new Map<string,StructuredAiResponse<unknown>>();
    const finals=new Map<string,StructuredAiResponse<unknown>>();
    const key=(contract:string,paid:string)=>`${contract}:${paid}`;
    const chunkFactory=(()=>({
      load:async(_request:StructuredAiRequest<unknown>,contract:string,paid:string)=>
        chunks.get(key(contract,paid))??null,
      assertNoOtherCompleted:async()=>{},
      save:async(request:StructuredAiRequest<unknown>,contract:string,paid:string,
        response:StructuredAiResponse<unknown>)=>{validateQualificationSingletonChunkOutput(request,response.output);
        chunks.set(key(contract,paid),response);},
    })) as typeof productQualificationSingletonChunkCheckpoint;
    const phaseFactory=(()=>({
      load:async(_request:StructuredAiRequest<unknown>,contract:string,paid:string)=>
        phases.get(key(contract,paid))??null,
      assertNoOtherCompleted:async()=>{},
      save:async(request:StructuredAiRequest<unknown>,contract:string,paid:string,
        response:StructuredAiResponse<unknown>)=>{validateQualificationPhaseOutput(request,response.output);
        phases.set(key(contract,paid),response);},
    })) as typeof productQualificationPhaseCheckpoint;
    const finalFactory=(()=>({
      load:async(_request:StructuredAiRequest<unknown>,contract:string,paid:string)=>
        finals.get(key(contract,paid))??null,
      assertNoOtherCompleted:async()=>{},
      save:async(_request:StructuredAiRequest<unknown>,contract:string,paid:string,
        response:StructuredAiResponse<unknown>)=>{finals.set(key(contract,paid),response);},
    })) as typeof productQualificationFinalCheckpoint;
    const agent=new LeadQualificationAgent(provider,{batchSize:1,concurrency:1,
      routineModel:"deepseek-v4-pro",escalationModel:"deepseek-v4-pro",
      singletonChunkCheckpointFactory:chunkFactory,phaseCheckpointFactory:phaseFactory,
      finalCheckpointFactory:finalFactory});
    const scope={userId:"fixture-owner",workspaceId:"fixture-workspace",actionId:"fixture-action"};
    provider.failChunkAt=2;
    await expect(agent.evaluateWithUsage([long],playbook,"DE","Germany","new-market",
      undefined,scope)).rejects.toThrow(BudgetDeniedError);
    expect(chunks.size).toBe(1);
    const firstChunk=provider.calls[0];
    expect(firstChunk.promptVersion).toBe("qualification-singleton-chunk-v1");
    expect((await agent.phasedCacheContracts([long],playbook,"DE","Germany","new-market",scope))
      .has(long.candidateId)).toBe(false);
    expect(provider.calls).toHaveLength(1);
    provider.failChunkAt=0;
    const completed=await agent.evaluateWithUsage([long],playbook,"DE","Germany",
      "new-market",undefined,scope);
    expect(completed.assessments[0].scoringStatus).toBe("completed");
    expect(chunks.size).toBeGreaterThan(1);
    expect(phases.size).toBeGreaterThan(0);
    expect(finals.size).toBe(1);
    expect((await agent.phasedCacheContracts([long],playbook,"DE","Germany","new-market",scope))
      .get(long.candidateId)).toBe(agent.completedCacheContracts(completed.assessments)
        .get(long.candidateId));
    expect(provider.calls.filter(item=>provider.cacheIdentity(item)===provider.cacheIdentity(firstChunk)))
      .toHaveLength(1);
    expect(provider.calls.at(-1)?.promptVersion).toBe("lead-value-v7-role-anchors-five-paths");
    const callCount=provider.calls.length;
    const reused=await agent.evaluateWithUsage([long],playbook,"DE","Germany",
      "new-market",undefined,scope);
    expect(reused.assessments[0].scoringStatus).toBe("completed");
    expect(reused.usage).toHaveLength(0);
    expect(provider.calls).toHaveLength(callCount);
    expect(JSON.stringify(long)).toBe(original);
    const preflightProvider=new ChunkProvider();preflightProvider.finalTooLarge=true;
    const preflightAgent=new LeadQualificationAgent(preflightProvider,{batchSize:1,concurrency:1,
      routineModel:"deepseek-v4-pro",escalationModel:"deepseek-v4-pro",
      singletonChunkCheckpointFactory:chunkFactory,phaseCheckpointFactory:phaseFactory,
      finalCheckpointFactory:finalFactory});
    const held=await preflightAgent.evaluateWithUsage([long],playbook,"DE","Germany",
      "new-market",undefined,{...scope,actionId:"fixture-final-too-large"});
    expect(held.assessments[0].scoringStatus).toBe("retry-required");
    expect(held.assessments[0].warnings.join(" ")).toContain("no chunk request was sent");
    expect(preflightProvider.calls).toHaveLength(0);
    chunks.clear();phases.clear();finals.clear();
    const uncertainProvider=new ChunkProvider();uncertainProvider.uncertainChunk=true;
    const uncertainAgent=new LeadQualificationAgent(uncertainProvider,{batchSize:1,concurrency:1,
      routineModel:"deepseek-v4-pro",escalationModel:"deepseek-v4-pro",
      singletonChunkCheckpointFactory:chunkFactory,phaseCheckpointFactory:phaseFactory,
      finalCheckpointFactory:finalFactory});
    const uncertain=await uncertainAgent.evaluateWithUsage([long],playbook,"DE","Germany",
      "new-market",undefined,{...scope,actionId:"fixture-uncertain-critical"});
    expect(uncertain.assessments[0].scoringStatus).toBe("retry-required");
    expect(uncertain.assessments[0].warnings.join(" ")).toContain("remain uncertain");
    expect(chunks.size).toBeGreaterThan(0);
    expect(phases.size).toBe(0);
    expect(finals.size).toBe(0);
    chunks.clear();phases.clear();finals.clear();
    const fallbackProvider=new ChunkProvider();fallbackProvider.approvedFallback=true;
    fallbackProvider.fallbackChunkAt=1;
    const fallbackAgent=new LeadQualificationAgent(fallbackProvider,{batchSize:1,concurrency:1,
      routineModel:"deepseek-v4-pro",escalationModel:"deepseek-v4-pro",
      singletonChunkCheckpointFactory:chunkFactory,phaseCheckpointFactory:phaseFactory,
      finalCheckpointFactory:finalFactory});
    const fallback=await fallbackAgent.evaluateWithUsage([long],playbook,"DE","Germany",
      "new-market",undefined,{...scope,actionId:"fixture-approved-chunk-fallback"});
    expect(fallback.assessments[0].scoringStatus).toBe("completed");
    expect(fallback.usage.some(item=>item.providerId==="fallback"&&item.fallbackUsed)).toBe(true);
    expect(fallbackProvider.calls.filter(item=>item.promptVersion==="qualification-singleton-chunk-v1")
      .every(item=>fallbackProvider.fallbackChunkBytes(item)<=57_344)).toBe(true);
    const fallbackCalls=fallbackProvider.calls.length;
    const fallbackReplay=await fallbackAgent.evaluateWithUsage([long],playbook,"DE","Germany",
      "new-market",undefined,{...scope,actionId:"fixture-approved-chunk-fallback"});
    expect(fallbackReplay.assessments[0].scoringStatus).toBe("completed");
    expect(fallbackReplay.usage).toHaveLength(0);
    expect(fallbackProvider.calls).toHaveLength(fallbackCalls);
  },15_000);

  it("folds only supported-fact source prose while retaining every finding and citation for a large singleton",async()=>{
    class ContractProvider extends FakeProvider {
      private readonly wire=new DeepSeekProvider({apiKey:"fixture",maxAttempts:1,
        fetchImplementation:async()=>{throw new Error("Synthetic scoring must not use transport");}});
      requestBytes(request:StructuredAiRequest<unknown>){return this.wire.requestBytes(request);}
      cacheIdentity(request:StructuredAiRequest<unknown>){return this.wire.cacheIdentity(request);}
    }
    const provider=new ContractProvider();
    const agent=new LeadQualificationAgent(provider);
    const large=incompressibleCandidate(55);
    const protectedFact=large.correction.findings.find(item=>item.evidenceIds.includes("unique-25"))!;
    protectedFact.status="conflicting";
    const original=JSON.stringify(large);
    const expected=agent.cacheContracts([large],playbook,"DE","Germany","new-market");
    const result=await agent.evaluate([large],playbook,"DE","Germany","new-market");
    expect(result[0].scoringStatus).toBe("completed");
    expect(provider.calls).toHaveLength(1);
    const sent=provider.calls[0];
    expect(provider.requestBytes(sent)).toBeLessThanOrEqual(61_440);
    expect(sent.preparation?.encoding).toBe("supported-excerpt-fold-v1");
    expect(sent.preparation?.omittedEvidenceExcerpts).toBeGreaterThan(0);
    expect(sent.evidenceIds).toEqual(large.evidence.map(item=>item.id));
    const payload=sent.input as {instructions:string[];candidates:Array<{findings:typeof large.correction.findings;
      evidence:Array<{evidenceId:string;url:string;title:string;excerpt:string;excerptFolded?:boolean}>}>};
    expect(payload.instructions.join(" ")).toContain("not independent corroboration");
    expect(payload.candidates[0].findings).toEqual(large.correction.findings);
    expect(payload.candidates[0].evidence.map(item=>item.evidenceId)).toEqual(large.evidence.map(item=>item.id));
    expect(payload.candidates[0].evidence.map(item=>item.url)).toEqual(large.evidence.map(item=>item.url));
    expect(payload.candidates[0].evidence.find(item=>item.evidenceId==="unique-25")?.excerpt)
      .toBe(large.evidence.find(item=>item.id==="unique-25")?.excerpt);
    expect(payload.candidates[0].evidence.filter(item=>item.excerptFolded).every(item=>
      !large.correction.findings.some(finding=>finding.status!=="supported"
        &&finding.evidenceIds.includes(item.evidenceId)))).toBe(true);
    expect(agent.completedCacheContracts(result)).toEqual(expected);
    const omittedId=payload.candidates[0].evidence.find(item=>item.excerptFolded)!.evidenceId;
    const changed=structuredClone(large);
    const source=changed.evidence.find(item=>item.id===omittedId)!;
    source.excerpt=`${source.excerpt.slice(0,-1)}X`;
    source.contentHash=leadEvidenceContentHash(source.excerpt);
    const context={countryCode:"DE",countryName:"Germany",executionContract:expected.get(large.candidateId)!};
    expect(assessmentDependencyFingerprint(changed,playbook,"new-market",context))
      .not.toBe(assessmentDependencyFingerprint(large,playbook,"new-market",context));
    expect(JSON.stringify(large)).toBe(original);
  });

  it("combines supported excerpt folding with exact tables for a larger singleton",async()=>{
    class ContractProvider extends FakeProvider {
      private readonly wire=new DeepSeekProvider({apiKey:"fixture",maxAttempts:1,
        fetchImplementation:async()=>{throw new Error("Synthetic scoring must not use transport");}});
      requestBytes(request:StructuredAiRequest<unknown>){return this.wire.requestBytes(request);}
      cacheIdentity(request:StructuredAiRequest<unknown>){return this.wire.cacheIdentity(request);}
    }
    const provider=new ContractProvider();
    const large=incompressibleCandidate(110);
    large.correction.findings.find(item=>item.evidenceIds.includes("unique-25"))!.status="conflicting";
    const original=JSON.stringify(large);
    const result=await new LeadQualificationAgent(provider).evaluate([large],playbook,"DE","Germany","new-market");
    expect(result[0].scoringStatus).toBe("completed");
    expect(provider.calls).toHaveLength(1);
    const sent=provider.calls[0];
    expect(sent.preparation?.encoding).toContain("supported-excerpt-fold-v1+exact-field-table-v1");
    expect(sent.preparation?.omittedEvidenceExcerpts).toBeGreaterThan(0);
    expect(provider.requestBytes(sent)).toBeLessThanOrEqual(61_440);
    expect(sent.preparation?.preparedMaximumWireBytes).toBe(provider.requestBytes(sent));
    expect(sent.evidenceIds).toEqual(large.evidence.map(item=>item.id));
    const input=sent.input as {sharedPhraseDictionary?:Record<string,string>;candidates:Array<{
      evidenceTable:{columns:string[];rows:unknown[][]};findingsTable:{columns:string[];rows:unknown[][]}}>};
    const expand=(value:unknown)=>typeof value==="string"
      ?Object.entries(input.sharedPhraseDictionary??{}).reduce((text,[marker,phrase])=>
        text.replaceAll(marker,phrase),value):value;
    const decode=(table:{columns:string[];rows:unknown[][]})=>table.rows.map(row=>
      Object.fromEntries(table.columns.map((column,index)=>[column,expand(row[index])])));
    const evidence=decode(input.candidates[0].evidenceTable);
    expect(decode(input.candidates[0].findingsTable)).toEqual(large.correction.findings);
    expect(evidence.map(item=>item.evidenceId)).toEqual(large.evidence.map(item=>item.id));
    expect(evidence.map(item=>item.url)).toEqual(large.evidence.map(item=>item.url));
    expect(evidence.find(item=>item.evidenceId==="unique-25")?.excerpt)
      .toBe(large.evidence.find(item=>item.id==="unique-25")?.excerpt);
    expect(evidence.filter(item=>item.excerptFolded).every(item=>
      !large.correction.findings.some(finding=>finding.status!=="supported"
        &&finding.evidenceIds.includes(item.evidenceId as string)))).toBe(true);
    expect(JSON.stringify(large)).toBe(original);
    const stillLarge=incompressibleCandidate(125);
    stillLarge.correction.findings.find(item=>item.evidenceIds.includes("unique-25"))!.status="conflicting";
    const pending=await new LeadQualificationAgent(provider).evaluate([stillLarge],playbook,"DE","Germany","new-market");
    expect(pending[0].scoringStatus).toBe("retry-required");
    expect(provider.calls).toHaveLength(1);
  });

  it("does not fold unresolved source prose merely to force an oversized score",async()=>{
    const provider=new CacheableFakeProvider();
    const large=incompressibleCandidate(55);
    large.correction.findings=large.correction.findings.map(item=>({...item,status:"conflicting"}));
    const original=JSON.stringify(large);
    const result=await new LeadQualificationAgent(provider).evaluate([large],playbook,"DE","Germany","new-market");
    expect(result[0]).toMatchObject({scoringStatus:"retry-required",eligibilityStatus:"research-required"});
    expect(provider.calls).toHaveLength(0);
    expect(JSON.stringify(large)).toBe(original);
  });

  it.each(["oversize-first","oversize-last"])("scores a valid peer beside an %s singleton without contaminating its cache contract",async order=>{
    const provider=new CacheableFakeProvider();
    const agent=new LeadQualificationAgent(provider);
    const large={...incompressibleCandidate(),candidateId:"oversized-peer"};
    const inputs=order==="oversize-first"?[large,candidate]:[candidate,large];
    const original=JSON.stringify(inputs);
    const expected=agent.cacheContracts([candidate],playbook,"DE","Germany","new-market");
    expect(agent.cacheContracts(inputs,playbook,"DE","Germany","new-market")).toEqual(expected);
    const published:string[]=[];
    const result=await agent.evaluateWithUsage(inputs,playbook,"DE","Germany","new-market",async(items)=>{
      published.push(...items.map(item=>item.candidateId));
    });
    expect(result.assessments.map(item=>item.candidateId)).toEqual(inputs.map(item=>item.candidateId));
    expect(result.assessments.find(item=>item.candidateId===large.candidateId)).toMatchObject({
      eligible:false,scoringStatus:"retry-required",eligibilityStatus:"research-required"});
    const valid=result.assessments.find(item=>item.candidateId===candidate.candidateId)!;
    expect(valid.scoringStatus).toBe("completed");
    expect(agent.completedCacheContracts([valid])).toEqual(expected);
    expect(published).toEqual([candidate.candidateId]);
    expect(provider.calls).toHaveLength(1);
    expect(JSON.stringify(inputs)).toBe(original);
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
