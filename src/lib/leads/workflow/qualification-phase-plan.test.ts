import {createHash} from "node:crypto";

import {describe,expect,it} from "vitest";

import {leadEvidenceContentHash} from "@/lib/leads/evidence-snapshot";
import {DeepSeekProvider} from "@/providers/deepseek";
import {LeadRequestTooLargeError} from "@/providers/lead-request-bounds";
import {correctedCandidate,playbook} from "../../../../scripts/workflow-recovery-fixtures";

import {planQualificationFactPhases,QUALIFICATION_FACT_PHASE_VERSION} from "./qualification-phase-plan";

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
});
