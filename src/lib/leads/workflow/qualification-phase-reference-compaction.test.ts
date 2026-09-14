import {describe,expect,it} from "vitest";
import {OpenAiCompatibleProvider} from "@/providers/openai-compatible";
import type {StructuredAiRequest} from "@/providers/contracts";
import {leadRequestByteLimit} from "@/providers/lead-request-bounds";
import {compactQualificationPhaseReferences} from "./qualification-phase-reference-compaction";

const provider=new OpenAiCompatibleProvider({id:"fixture-compatible",apiKey:"never-sent",
  baseUrl:"https://example.invalid/v1",maxAttempts:1});
type FixtureInput={phaseScreening:{sourceReferenceEncoding?:string;sourceRows:unknown[][];factRows:unknown[][]}};
const fixtureInput=(request:StructuredAiRequest<unknown>)=>request.input as FixtureInput;

function fixture(count:number):StructuredAiRequest<unknown>{
  const ids=Array.from({length:count},(_,index)=>`evidence-${index.toString().padStart(3,"0")}-${"a".repeat(36)}`);
  return {task:"lead-qualification",modelVersion:"deepseek/deepseek-v4-flash",
    promptVersion:"phase-fixture",dataClassification:"public",evidenceIds:ids,
    input:{instructions:["Use original evidence identities."],
      scoringRubric:{outputMode:"score-and-paths"},
      phaseScreening:{version:"fixture",sourceFingerprint:"fixture",
        sourceColumns:["evidenceId","sourceType"],sourceRows:ids.map(id=>[id,"company-site"]),
        factColumns:["findingId","evidenceIds","phaseCitedEvidenceIds","phaseSummary"],
        factRows:ids.map((id,index)=>[`fact-${index}`,[id],[id],`Supported fact ${index}: ${"context ".repeat(25)}`])}}};
}

describe("phased final source references",()=>{
  it("keeps an already bounded request and its cache identity unchanged",()=>{
    const original=fixture(1);
    expect(provider.requestBytes(original)).toBeLessThan(leadRequestByteLimit(original)!);
    expect(compactQualificationPhaseReferences(original,provider.requestBytes.bind(provider)))
      .toBe(original);
  });

  it("fits an oversized compatible wire while preserving every exact source and citation",()=>{
    const original=fixture(151),bytes=provider.requestBytes.bind(provider);
    expect(bytes(original)).toBeGreaterThan(leadRequestByteLimit(original)!);
    const prepared=compactQualificationPhaseReferences(original,bytes);
    expect(bytes(prepared)).toBeLessThanOrEqual(leadRequestByteLimit(prepared)!);
    const source=fixtureInput(original).phaseScreening;
    const compacted=fixtureInput(prepared).phaseScreening;
    expect(compacted.sourceReferenceEncoding).toBe("source-row-index-v1");
    expect(compacted.sourceRows).toEqual(source.sourceRows);
    for(let row=0;row<source.factRows.length;row++){
      for(const column of [1,2])expect((compacted.factRows[row][column] as number[])
        .map((index:number)=>compacted.sourceRows[index][0])).toEqual(source.factRows[row][column]);
    }
    expect((source.factRows[0][1] as string[])[0]).toMatch(/^evidence-/);
    expect(prepared.preparation?.preparedMaximumWireBytes).toBe(bytes(prepared));
    expect(compactQualificationPhaseReferences(prepared,bytes)).toBe(prepared);
  });

  it("refuses a missing source reference before any provider call",()=>{
    const original=fixture(151);
    fixtureInput(original).phaseScreening.factRows[0][1]=["unlisted-source"];
    expect(()=>compactQualificationPhaseReferences(original,provider.requestBytes.bind(provider)))
      .toThrow(/no source row/);
  });
});
