import {createHash} from "node:crypto";
import {describe,expect,it} from "vitest";

import {leadEvidenceContentHash} from "@/lib/leads/evidence-snapshot";
import {DeepSeekProvider} from "@/providers/deepseek";
import {LeadRequestTooLargeError} from "@/providers/lead-request-bounds";
import {correctedCandidate,playbook} from "../../../../scripts/workflow-recovery-fixtures";

import {planQualificationFactPhases} from "./qualification-phase-plan";
import {assembleQualificationPhaseSynthesis} from "./qualification-phase-synthesis";
import {LeadQualificationAgent} from "./qualification-agent";
import type {QualificationPhaseOutput} from "./qualification-phase-output";

function fixture(count:number){
  const originalExcerpt=correctedCandidate.evidence[0].excerpt;
  const original={...correctedCandidate.evidence[0],evidenceRunId:"run-1",
    freshnessStatus:"fresh" as const,contentHash:leadEvidenceContentHash(originalExcerpt)};
  const extra=Array.from({length:count},(_,index)=>{
    const excerpt=Array.from({length:9},(_,part)=>createHash("sha256")
      .update(`synthesis-${index}-${part}`).digest("hex")).join(" ");
    return {...original,id:`synthesis-source-${index}`,url:`https://fixture.invalid/${index}`,
      excerpt,contentHash:leadEvidenceContentHash(excerpt)};
  });
  const orphanExcerpt="An unlinked current-run source must remain visible.";
  const orphan={...original,id:"synthesis-orphan",url:"https://fixture.invalid/orphan",
    excerpt:orphanExcerpt,contentHash:leadEvidenceContentHash(orphanExcerpt)};
  const findings=extra.map((item,index)=>({...correctedCandidate.correction.findings[0],
    findingId:`synthesis-finding-${index}`,evidenceIds:[item.id],
    statement:`Corrected fact ${index}: ${createHash("sha256").update(`fact-${index}`).digest("hex")}`,
    kind:"product-family" as const,
    status:index===25?"conflicting" as const:"supported" as const}));
  return {...correctedCandidate,evidence:[original,...extra,orphan],correction:{...correctedCandidate.correction,
    findings:[...correctedCandidate.correction.findings,...findings]}};
}

describe("qualification phase synthesis",()=>{
  const wire=new DeepSeekProvider({apiKey:"fixture-never-sent",maxAttempts:1,
    fetchImplementation:async()=>{throw new Error("Synthesis fixture must not use transport");}});
  const market={countryCode:"DE",countryName:"Germany",objective:"new-market",modelVersion:"deepseek-v4-pro"};
  it("joins 150 screened facts, original corrected statements, citations and every current source",()=>{
    const candidate=fixture(150),original=JSON.stringify(candidate);
    const plan=planQualificationFactPhases({candidate,playbook,...market,
      requestBytes:request=>wire.requestBytes(request)});
    const outputs:QualificationPhaseOutput[]=plan.phases.map((phase,index)=>{
      const input=phase.input as {candidate:{findings:Array<{findingId:string;evidenceIds:string[]}>};
        unlinkedEvidenceIds:string[]};
      return {facts:input.candidate.findings.map(item=>({findingId:item.findingId,
        materiality:index===0?"uncertain":"material",summary:`Screened ${item.findingId}`,
        evidenceIds:item.evidenceIds})),
      sources:input.unlinkedEvidenceIds.map(id=>({evidenceId:id,materiality:"context",
        summary:`Screened ${id}`}))};
    });
    const assemble=(subject=candidate,results=outputs)=>assembleQualificationPhaseSynthesis({
      candidate:subject,playbook,...market,plan,outputs:results});
    const result=assemble();
    expect(plan.phases.length).toBeGreaterThan(1);
    expect(result.facts.map(item=>item.findingId)).toEqual(candidate.correction.findings.map(item=>item.findingId));
    expect(result.sources.map(item=>item.evidenceId)).toEqual(candidate.evidence.map(item=>item.id));
    expect(result.facts.find(item=>item.findingId==="synthesis-finding-25")?.status).toBe("conflicting");
    expect(result.facts.find(item=>item.findingId==="synthesis-finding-25")?.evidenceIds)
      .toEqual(["synthesis-source-25"]);
    expect(result.sources.find(item=>item.evidenceId==="synthesis-orphan")?.screeningSummary)
      .toBe("Screened synthesis-orphan");
    expect(JSON.stringify(result)).not.toContain(candidate.evidence[1].excerpt);
    expect(JSON.stringify(candidate)).toBe(original);
    const final=new LeadQualificationAgent(wire,{routineModel:market.modelVersion,
      escalationModel:market.modelVersion,includeCooperationPaths:false})
      .planPhasedFinalRequest(candidate,playbook,market.countryCode,market.countryName,
        market.objective,outputs);
    expect(wire.requestBytes(final.request)).toBeLessThanOrEqual(57_344);
    expect(final.request.evidenceIds).toEqual(candidate.evidence.map(item=>item.id));
    const finalInput=final.request.input as {phaseScreening:{factColumns:string[];factRows:unknown[][];
      sourceColumns:string[];sourceRows:unknown[][]};candidates:Array<{findings:unknown[]}>};
    const decode=(columns:string[],rows:unknown[][])=>rows.map(row=>
      Object.fromEntries(columns.map((column,index)=>[column,row[index]])));
    const facts=decode(finalInput.phaseScreening.factColumns,finalInput.phaseScreening.factRows);
    const sources=decode(finalInput.phaseScreening.sourceColumns,finalInput.phaseScreening.sourceRows);
    expect(facts.map(item=>item.findingId))
      .toEqual(candidate.correction.findings.map(item=>item.findingId));
    expect(sources.map(item=>item.evidenceId)).toEqual(candidate.evidence.map(item=>item.id));
    expect(sources.filter(item=>item.unlinkedPhaseSummary).map(item=>item.evidenceId))
      .toEqual(["synthesis-orphan"]);
    expect(finalInput.candidates[0].findings).toHaveLength(0);
    const withPaths=new LeadQualificationAgent(wire,{routineModel:market.modelVersion,
      escalationModel:market.modelVersion,includeCooperationPaths:true})
      .planPhasedFinalRequest(candidate,playbook,market.countryCode,market.countryName,
        market.objective,outputs);
    expect(wire.requestBytes(withPaths.request)).toBeLessThanOrEqual(61_440);
    expect(facts.find(item=>item.findingId==="synthesis-finding-25")?.retainedCorrectedStatement)
      .toBe(candidate.correction.findings.find(item=>item.findingId==="synthesis-finding-25")?.statement);
    const verbose=structuredClone(outputs);
    for(const output of verbose)for(const fact of output.facts)fact.summary="X".repeat(240);
    expect(()=>new LeadQualificationAgent(wire,{routineModel:market.modelVersion,
      includeCooperationPaths:false}).planPhasedFinalRequest(candidate,playbook,
      market.countryCode,market.countryName,market.objective,verbose))
      .toThrow(LeadRequestTooLargeError);
    expect(()=>assemble(candidate,outputs.slice(1))).toThrow(/source or output count/);
    const altered=structuredClone(candidate);altered.evidence[1].excerpt+=" changed";
    altered.evidence[1].contentHash=leadEvidenceContentHash(altered.evidence[1].excerpt);
    expect(()=>assemble(altered)).toThrow(/source or output count/);
    const incomplete=structuredClone(outputs);incomplete[0].facts.pop();
    expect(()=>assemble(candidate,incomplete)).toThrow(/missing or extra/);
  });

  it("carries a folded source disclosure into final scoring without changing the original snapshot",()=>{
    const candidate=fixture(1);
    candidate.correction.findings[1].kind="product-family";
    candidate.evidence[1].excerpt="head "+"x".repeat(100_000)+" tail";
    candidate.evidence[1].contentHash=leadEvidenceContentHash(candidate.evidence[1].excerpt);
    const original=JSON.stringify(candidate);
    const plan=planQualificationFactPhases({candidate,playbook,...market,
      requestBytes:request=>wire.requestBytes(request)});
    const outputs:QualificationPhaseOutput[]=plan.phases.map(phase=>{
      const input=phase.input as {candidate:{findings:Array<{findingId:string;evidenceIds:string[]}>};
        unlinkedEvidenceIds:string[]};
      return {facts:input.candidate.findings.map(item=>({findingId:item.findingId,
        materiality:"uncertain",summary:"Original corrected fact retained; omitted raw middle not reviewed.",
        evidenceIds:item.evidenceIds})),sources:input.unlinkedEvidenceIds.map(id=>({
        evidenceId:id,materiality:"context",summary:"Unlinked source retained."}))};
    });
    const synthesis=assembleQualificationPhaseSynthesis({candidate,playbook,...market,plan,outputs});
    expect(synthesis.foldedEvidenceIds).toEqual(["synthesis-source-0"]);
    expect(synthesis.facts.find(item=>item.findingId==="synthesis-finding-0")?.statement)
      .toBe(candidate.correction.findings[1].statement);
    const final=new LeadQualificationAgent(wire,{routineModel:market.modelVersion,
      escalationModel:market.modelVersion,includeCooperationPaths:false})
      .planPhasedFinalRequest(candidate,playbook,market.countryCode,market.countryName,
        market.objective,outputs);
    const finalInput=final.request.input as {phaseScreening?:{foldedEvidenceIds?:readonly string[]};
      instructions:string[]};
    expect(finalInput.phaseScreening?.foldedEvidenceIds).toEqual(["synthesis-source-0"]);
    expect(finalInput.instructions.join(" ")).toContain("Do not treat omitted text");
    expect(wire.requestBytes(final.request)).toBeLessThanOrEqual(57_344);
    expect(JSON.stringify(candidate)).toBe(original);
  });
});
