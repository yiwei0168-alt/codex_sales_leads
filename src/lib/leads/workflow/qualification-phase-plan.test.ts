import {createHash} from "node:crypto";

import {describe,expect,it} from "vitest";

import {leadEvidenceContentHash} from "@/lib/leads/evidence-snapshot";
import {DeepSeekProvider} from "@/providers/deepseek";
import {LeadRequestTooLargeError} from "@/providers/lead-request-bounds";
import {correctedCandidate,playbook} from "../../../../scripts/workflow-recovery-fixtures";

import {OversizedQualificationFactUnitError,planQualificationFactPhases,
  qualificationPhaseSourceFingerprint,QUALIFICATION_FACT_PHASE_VERSION} from "./qualification-phase-plan";
import {assembleQualificationPhaseSynthesis} from "./qualification-phase-synthesis";
import {assembleQualificationSingletonChunks,planQualificationSingletonChunks} from "./qualification-singleton-chunks";
import {LeadQualificationAgent} from "./qualification-agent";

function fixture(count:number){
  const baseExcerpt=correctedCandidate.evidence[0].excerpt;
  const original={...correctedCandidate.evidence[0],evidenceRunId:"run-1",
    freshnessStatus:"fresh" as const,contentHash:leadEvidenceContentHash(baseExcerpt)};
  const extra=Array.from({length:count},(_,index)=>{
    const excerpt=Array.from({length:9},(_,part)=>createHash("sha256")
      .update(`phase-${index}-${part}`).digest("hex")).join(" ");
    return {...original,id:`phase-source-${index}`,url:`https://fixture.invalid/${index}`,
      excerpt,contentHash:leadEvidenceContentHash(excerpt)};
  });
  const orphanExcerpt="Unlinked source remains in the phase plan.";
  const orphan={...original,id:"orphan-source",url:"https://fixture.invalid/orphan",
    excerpt:orphanExcerpt,contentHash:leadEvidenceContentHash(orphanExcerpt)};
  const findings=extra.map((item,index)=>({...correctedCandidate.correction.findings[0],
    findingId:`phase-finding-${index}`,evidenceIds:[item.id],
    statement:`Distinct finding ${index}: ${createHash("sha256").update(`fact-${index}`).digest("hex")}`,
    status:index===25?"conflicting" as const:"supported" as const}));
  return {...correctedCandidate,evidence:[original,...extra,orphan],correction:{...correctedCandidate.correction,
    findings:[correctedCandidate.correction.findings[0],...findings]}};
}

describe("qualification fact phase plan",()=>{
  const wire=new DeepSeekProvider({apiKey:"fixture-never-sent",maxAttempts:1,
    fetchImplementation:async()=>{throw new Error("Phase planner must not use transport");}});

  it("partitions 150 unique facts and every source into bounded, citation-closed requests",()=>{
    const candidate=fixture(150);
    const original=JSON.stringify(candidate);
    const result=planQualificationFactPhases({candidate,playbook,countryCode:"DE",countryName:"Germany",
      objective:"new-market",modelVersion:"deepseek-v4-pro",requestBytes:request=>wire.requestBytes(request)});
    expect(result.phases.length).toBeGreaterThan(1);
    const factIds:string[]=[],sourceIds:string[]=[];
    for(const [index,phase] of result.phases.entries()){
      expect(phase.promptVersion).toBe(QUALIFICATION_FACT_PHASE_VERSION);
      expect(phase.task).toBe("lead-qualification");
      expect(wire.requestBytes(phase)).toBeLessThanOrEqual(57_344);
      const input=phase.input as {phaseIndex:number;sourceFingerprint:string;
        candidate:{findings:typeof candidate.correction.findings;
          evidence:Array<{evidenceId:string;excerpt:string}>}};
      expect(input.phaseIndex).toBe(index);
      expect(input.sourceFingerprint).toBe(result.sourceFingerprint);
      const inPhase=new Set(input.candidate.evidence.map(item=>item.evidenceId));
      for(const fact of input.candidate.findings){
        factIds.push(fact.findingId);
        expect(fact.evidenceIds.every(id=>inPhase.has(id))).toBe(true);
      }
      sourceIds.push(...input.candidate.evidence.map(item=>item.evidenceId));
      const conflict=input.candidate.evidence.find(item=>item.evidenceId==="phase-source-25");
      if(conflict)expect(conflict.excerpt).toBe(candidate.evidence.find(item=>item.id==="phase-source-25")?.excerpt);
    }
    expect(factIds).toEqual(candidate.correction.findings.map(item=>item.findingId));
    expect(new Set(sourceIds)).toEqual(new Set(candidate.evidence.map(item=>item.id)));
    expect(sourceIds).toContain("orphan-source");
    expect(JSON.stringify(candidate)).toBe(original);
    const changed=structuredClone(candidate);
    changed.evidence[1].excerpt+=" changed";
    expect(planQualificationFactPhases({candidate:changed,playbook,countryCode:"DE",countryName:"Germany",
      objective:"new-market",modelVersion:"deepseek-v4-pro",requestBytes:request=>wire.requestBytes(request)}).sourceFingerprint)
      .not.toBe(result.sourceFingerprint);
    expect(planQualificationFactPhases({candidate,playbook,countryCode:"CO",countryName:"Colombia",
      objective:"new-market",modelVersion:"deepseek-v4-pro",requestBytes:request=>wire.requestBytes(request)}).sourceFingerprint)
      .not.toBe(result.sourceFingerprint);
  });

  it("stops before transport when even one atomic fact and source exceed the limit",()=>{
    const candidate=fixture(1);
    candidate.evidence[1].excerpt="x".repeat(100_000);
    candidate.evidence[1].contentHash=leadEvidenceContentHash(candidate.evidence[1].excerpt);
    expect(()=>planQualificationFactPhases({candidate,playbook,countryCode:"DE",countryName:"Germany",
      objective:"new-market",modelVersion:"deepseek-v4-pro",requestBytes:request=>wire.requestBytes(request)}))
      .toThrow(LeadRequestTooLargeError);
  });

  it("identifies the original long source or finding and its citation closure for chunk recovery",()=>{
    const source=fixture(1);
    source.evidence[1].excerpt="source "+"x".repeat(100_000);
    source.evidence[1].contentHash=leadEvidenceContentHash(source.evidence[1].excerpt);
    let sourceFailure:unknown;
    try{planQualificationFactPhases({candidate:source,playbook,countryCode:"DE",countryName:"Germany",
      objective:"new-market",modelVersion:"deepseek-v4-pro",requestBytes:request=>wire.requestBytes(request)});}
    catch(error){sourceFailure=error;}
    expect(sourceFailure).toBeInstanceOf(OversizedQualificationFactUnitError);
    const sourceUnit=(sourceFailure as OversizedQualificationFactUnitError).unit;
    expect(sourceUnit).toEqual({kind:"evidence",id:"phase-source-0",text:source.evidence[1].excerpt,
      evidenceIds:["phase-source-0"]});
    expect((sourceFailure as OversizedQualificationFactUnitError).sourceFingerprint)
      .toMatch(/^[a-f0-9]{64}$/);

    const finding=fixture(1);
    finding.correction.findings[1].statement="claim "+"y".repeat(100_000);
    let findingFailure:unknown;
    try{planQualificationFactPhases({candidate:finding,playbook,countryCode:"DE",countryName:"Germany",
      objective:"new-market",modelVersion:"deepseek-v4-pro",requestBytes:request=>wire.requestBytes(request)});}
    catch(error){findingFailure=error;}
    expect(findingFailure).toBeInstanceOf(OversizedQualificationFactUnitError);
    expect((findingFailure as OversizedQualificationFactUnitError).unit).toEqual({
      kind:"finding",id:"phase-finding-0",text:finding.correction.findings[1].statement,
      evidenceIds:["phase-source-0"],
    });

    const foldedAndCritical=fixture(1);
    foldedAndCritical.correction.findings[1].kind="product-family";
    foldedAndCritical.correction.findings[1].statement="claim "+"z".repeat(100_000);
    foldedAndCritical.evidence[1].excerpt="source "+"x".repeat(120_000);
    foldedAndCritical.evidence[1].contentHash=leadEvidenceContentHash(foldedAndCritical.evidence[1].excerpt);
    let mixedFailure:unknown;
    try{planQualificationFactPhases({candidate:foldedAndCritical,playbook,countryCode:"DE",
      countryName:"Germany",objective:"new-market",modelVersion:"deepseek-v4-pro",
      requestBytes:request=>wire.requestBytes(request)});}
    catch(error){mixedFailure=error;}
    expect(mixedFailure).toBeInstanceOf(OversizedQualificationFactUnitError);
    expect((mixedFailure as OversizedQualificationFactUnitError).unit.kind).toBe("finding");
    expect((mixedFailure as OversizedQualificationFactUnitError).unit.id).toBe("phase-finding-0");
  });

  it("presents complete long-source chunk screenings without changing the original evidence snapshot",()=>{
    const candidate=fixture(1);
    candidate.evidence[1].excerpt="original "+"x".repeat(100_000);
    candidate.evidence[1].contentHash=leadEvidenceContentHash(candidate.evidence[1].excerpt);
    const original=JSON.stringify(candidate);
    const base=qualificationPhaseSourceFingerprint({candidate,playbook,countryCode:"DE",
      countryName:"Germany",objective:"new-market",modelVersion:"deepseek-v4-pro"});
    const unit={kind:"evidence" as const,id:candidate.evidence[1].id,
      text:candidate.evidence[1].excerpt,evidenceIds:[candidate.evidence[1].id]};
    const chunkPlan=planQualificationSingletonChunks({candidateId:candidate.candidateId,
      countryCode:"DE",countryName:"Germany",objective:"new-market",sourceFingerprint:base,
      modelVersion:"deepseek-v4-pro",dataClassification:"public",unit,
      requestBytes:request=>wire.requestBytes(request)});
    const screening=assembleQualificationSingletonChunks({plan:chunkPlan,unit,
      outputs:chunkPlan.requests.map((_,chunkIndex)=>({unitKind:"evidence",unitId:unit.id,
        chunkIndex,materiality:"uncertain",summary:`Segment ${chunkIndex} needs context`,
        citedEvidenceIds:[unit.id]}))});
    const phase=planQualificationFactPhases({candidate,playbook,countryCode:"DE",countryName:"Germany",
      objective:"new-market",modelVersion:"deepseek-v4-pro",singletonScreenings:[screening],
      requestBytes:request=>wire.requestBytes(request)});
    expect(phase.phases.length).toBeGreaterThan(0);
    expect(phase.phases.every(request=>wire.requestBytes(request)<=57_344)).toBe(true);
    const derived=phase.phases.map(request=>request.input as {derivedSingletonUnits?:string[];
      candidate:{evidence:Array<{evidenceId:string;excerpt:string}>}})
      .find(input=>input.derivedSingletonUnits?.includes(`evidence:${unit.id}`));
    const excerpt=derived?.candidate.evidence.find(item=>item.evidenceId===unit.id)?.excerpt;
    expect(excerpt).toContain(screening.contentSha256);
    expect(excerpt).toContain("These are interpretations, not new source facts");
    expect(excerpt).not.toContain("x".repeat(1_000));
    const outputs=phase.phases.map(request=>{
      const input=request.input as {candidate:{findings:Array<{findingId:string;evidenceIds:string[]}>};
        unlinkedEvidenceIds:string[]};
      return {facts:input.candidate.findings.map(item=>({findingId:item.findingId,
        materiality:"uncertain" as const,summary:"Original evidence remains uncertain",
        evidenceIds:item.evidenceIds})),
      sources:input.unlinkedEvidenceIds.map(evidenceId=>({evidenceId,
        materiality:"uncertain" as const,summary:"Original evidence remains uncertain"}))};
    });
    const synthesis=assembleQualificationPhaseSynthesis({candidate,playbook,countryCode:"DE",
      countryName:"Germany",objective:"new-market",modelVersion:"deepseek-v4-pro",plan:phase,
      outputs,singletonScreenings:[screening]});
    expect(synthesis.chunkedEvidenceIds).toEqual([unit.id]);
    expect(synthesis.sourceFingerprint).toBe(phase.sourceFingerprint);
    const final=new LeadQualificationAgent(wire,{routineModel:"deepseek-v4-pro",
      escalationModel:"deepseek-v4-pro"}).planPhasedFinalRequest(candidate,playbook,"DE",
      "Germany","new-market",outputs,"deepseek-v4-pro",[screening]);
    expect((final.request.input as {phaseScreening:{chunkedUnitHashes:Record<string,string>}})
      .phaseScreening.chunkedUnitHashes[`evidence:${unit.id}`]).toBe(screening.contentSha256);
    expect(JSON.stringify(candidate)).toBe(original);
    const changed=structuredClone(candidate);
    changed.evidence[1].excerpt+=" changed";
    changed.evidence[1].contentHash=leadEvidenceContentHash(changed.evidence[1].excerpt);
    expect(qualificationPhaseSourceFingerprint({candidate:changed,playbook,countryCode:"DE",
      countryName:"Germany",objective:"new-market",modelVersion:"deepseek-v4-pro"}))
      .not.toBe(base);
    expect(()=>planQualificationFactPhases({candidate:changed,playbook,countryCode:"DE",
      countryName:"Germany",objective:"new-market",modelVersion:"deepseek-v4-pro",
      singletonScreenings:[screening],requestBytes:request=>wire.requestBytes(request)}))
      .toThrow("screening identity or coverage differs");
  });

  it("passes a complete long critical finding screening to a bounded final score request",()=>{
    const candidate=fixture(1);
    candidate.correction.findings[1].kind="role";
    candidate.correction.findings[1].statement="critical "+"z".repeat(100_000);
    const original=JSON.stringify(candidate);
    const base=qualificationPhaseSourceFingerprint({candidate,playbook,countryCode:"DE",
      countryName:"Germany",objective:"new-market",modelVersion:"deepseek-v4-pro"});
    const finding=candidate.correction.findings[1];
    const unit={kind:"finding" as const,id:finding.findingId,text:finding.statement,
      evidenceIds:[...finding.evidenceIds]};
    const chunks=planQualificationSingletonChunks({candidateId:candidate.candidateId,
      countryCode:"DE",countryName:"Germany",objective:"new-market",sourceFingerprint:base,
      modelVersion:"deepseek-v4-pro",dataClassification:"public",unit,
      requestBytes:request=>wire.requestBytes(request)});
    const screening=assembleQualificationSingletonChunks({plan:chunks,unit,
      outputs:chunks.requests.map((_,chunkIndex)=>({unitKind:"finding",unitId:unit.id,chunkIndex,
        materiality:"uncertain",summary:`Segment ${chunkIndex} leaves role uncertain`,
        citedEvidenceIds:[...unit.evidenceIds]}))});
    const phase=planQualificationFactPhases({candidate,playbook,countryCode:"DE",countryName:"Germany",
      objective:"new-market",modelVersion:"deepseek-v4-pro",singletonScreenings:[screening],
      requestBytes:request=>wire.requestBytes(request)});
    const outputs=phase.phases.map(request=>{
      const input=request.input as {candidate:{findings:Array<{findingId:string;evidenceIds:string[]}>};
        unlinkedEvidenceIds:string[]};
      return {facts:input.candidate.findings.map(item=>({findingId:item.findingId,
        materiality:"uncertain" as const,summary:"Critical role needs review",evidenceIds:item.evidenceIds})),
      sources:input.unlinkedEvidenceIds.map(evidenceId=>({evidenceId,
        materiality:"uncertain" as const,summary:"Source needs review"}))};
    });
    const agent=new LeadQualificationAgent(wire,{routineModel:"deepseek-v4-pro",
      escalationModel:"deepseek-v4-pro"});
    const final=agent.planPhasedFinalRequest(candidate,playbook,"DE","Germany","new-market",
      outputs,"deepseek-v4-pro",[screening]);
    expect(final.synthesis.chunkedFindingIds).toEqual([unit.id]);
    expect(final.synthesis.facts.find(item=>item.findingId===unit.id)?.statement)
      .toContain(screening.contentSha256);
    expect(wire.requestBytes(final.request)).toBeLessThanOrEqual(61_440);
    expect(JSON.stringify(final.request.input)).not.toContain("z".repeat(1_000));
    expect(JSON.stringify(candidate)).toBe(original);
  });

  it("folds only a supported noncritical oversized excerpt while retaining exact fact and source identity",()=>{
    const candidate=fixture(1),originalExcerpt="opening "+"x".repeat(100_000)+" closing";
    candidate.correction.findings[1].kind="product-family";
    candidate.evidence[1].excerpt=originalExcerpt;
    candidate.evidence[1].contentHash=leadEvidenceContentHash(originalExcerpt);
    const original=JSON.stringify(candidate);
    const plan=planQualificationFactPhases({candidate,playbook,countryCode:"DE",countryName:"Germany",
      objective:"new-market",modelVersion:"deepseek-v4-pro",requestBytes:request=>wire.requestBytes(request)});
    const folded=plan.phases.map(phase=>phase.input as {foldedEvidenceIds?:string[];
      candidate:{findings:typeof candidate.correction.findings;
        evidence:Array<{evidenceId:string;sourceType:string;url:string;excerpt:string;excerptFolded?:boolean}>}})
      .find(input=>input.foldedEvidenceIds?.includes("phase-source-0"));
    expect(folded).toBeDefined();
    expect(folded?.candidate.findings.find(item=>item.findingId==="phase-finding-0")?.statement)
      .toBe(candidate.correction.findings[1].statement);
    const source=folded?.candidate.evidence.find(item=>item.evidenceId==="phase-source-0");
    expect(source).toMatchObject({sourceType:candidate.evidence[1].sourceType,
      url:candidate.evidence[1].url,excerptFolded:true});
    expect(source?.excerpt).toContain(createHash("sha256").update(originalExcerpt).digest("hex"));
    expect(source?.excerpt).toContain("opening ");
    expect(source?.excerpt).toContain(" closing");
    expect(source?.excerpt.length).toBeLessThan(originalExcerpt.length);
    expect(plan.phases.every(phase=>wire.requestBytes(phase)<=57_344)).toBe(true);
    expect(JSON.stringify(candidate)).toBe(original);
    const changed=structuredClone(candidate);
    changed.evidence[1].excerpt=changed.evidence[1].excerpt.slice(0,50_000)+"y"
      +changed.evidence[1].excerpt.slice(50_001);
    changed.evidence[1].contentHash=leadEvidenceContentHash(changed.evidence[1].excerpt);
    const changedPlan=planQualificationFactPhases({candidate:changed,playbook,countryCode:"DE",
      countryName:"Germany",objective:"new-market",modelVersion:"deepseek-v4-pro",
      requestBytes:request=>wire.requestBytes(request)});
    expect(changedPlan.sourceFingerprint).not.toBe(plan.sourceFingerprint);
    const foldedPhase=plan.phases.find(phase=>(phase.input as {foldedEvidenceIds?:string[]})
      .foldedEvidenceIds?.includes("phase-source-0"));
    const changedFoldedPhase=changedPlan.phases.find(phase=>(phase.input as {foldedEvidenceIds?:string[]})
      .foldedEvidenceIds?.includes("phase-source-0"));
    expect(foldedPhase).toBeDefined();
    expect(changedFoldedPhase).toBeDefined();
    expect(wire.cacheIdentity(changedFoldedPhase!)).not.toBe(wire.cacheIdentity(foldedPhase!));
    expect(wire.paidRequestFingerprint(changedFoldedPhase!))
      .not.toBe(wire.paidRequestFingerprint(foldedPhase!));
  });

  it("keeps conflict, unknown kind and unlinked oversized sources in technical pending state",()=>{
    for(const kind of ["role","other","product-family"] as const){
      const candidate=fixture(1);
      candidate.correction.findings[1].kind=kind;
      candidate.correction.findings[1].status=kind==="product-family"?"conflicting":"supported";
      candidate.evidence[1].excerpt="x".repeat(100_000);
      candidate.evidence[1].contentHash=leadEvidenceContentHash(candidate.evidence[1].excerpt);
      expect(()=>planQualificationFactPhases({candidate,playbook,countryCode:"DE",countryName:"Germany",
        objective:"new-market",modelVersion:"deepseek-v4-pro",requestBytes:request=>wire.requestBytes(request)}))
        .toThrow(LeadRequestTooLargeError);
    }
    const orphan=fixture(1);
    orphan.evidence[2].excerpt="x".repeat(100_000);
    orphan.evidence[2].contentHash=leadEvidenceContentHash(orphan.evidence[2].excerpt);
    expect(()=>planQualificationFactPhases({candidate:orphan,playbook,countryCode:"DE",countryName:"Germany",
      objective:"new-market",modelVersion:"deepseek-v4-pro",requestBytes:request=>wire.requestBytes(request)}))
      .toThrow(LeadRequestTooLargeError);
  });
});
