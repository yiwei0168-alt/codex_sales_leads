import {describe,expect,it} from "vitest";

import type {StructuredAiRequest} from "@/providers/contracts";

import {qualificationPhaseOutputJsonSchema,validateQualificationPhaseOutput} from "./qualification-phase-output";

const request:StructuredAiRequest<unknown>={task:"lead-qualification",modelVersion:"deepseek-v4-pro",
  promptVersion:"qualification-fact-phase-v1",outputSchema:qualificationPhaseOutputJsonSchema,
  evidenceIds:["e1","e2"],input:{unlinkedEvidenceIds:["e2"],candidate:{
    findings:[{findingId:"f1",evidenceIds:["e1"]},{findingId:"f2",evidenceIds:["e1"]}],
    evidence:[{evidenceId:"e1"},{evidenceId:"e2"}]}}};
const response={facts:[
  {findingId:"f2",materiality:"uncertain",summary:"Unresolved product scope.",evidenceIds:[]},
  {findingId:"f1",materiality:"material",summary:"Verified reseller activity.",evidenceIds:["e1"]},
],sources:[{evidenceId:"e2",materiality:"context",summary:"Additional source context."}]};

describe("qualification phase output validation",()=>{
  it("normalizes complete results to input order without changing source identities",()=>{
    const accepted=validateQualificationPhaseOutput(request,response);
    expect(accepted.facts.map(item=>item.findingId)).toEqual(["f1","f2"]);
    expect(accepted.sources.map(item=>item.evidenceId)).toEqual(["e2"]);
    expect(accepted.facts[0].evidenceIds).toEqual(["e1"]);
  });

  it.each([
    {name:"missing finding",value:{...response,facts:response.facts.slice(1)}},
    {name:"duplicate finding",value:{...response,facts:[response.facts[0],response.facts[0]]}},
    {name:"invented finding",value:{...response,facts:[{...response.facts[0],findingId:"invented"},response.facts[1]]}},
    {name:"borrowed citation",value:{...response,facts:[{...response.facts[0],evidenceIds:["e2"]},response.facts[1]]}},
    {name:"duplicate citation",value:{...response,facts:[response.facts[0],{...response.facts[1],evidenceIds:["e1","e1"]}]}},
    {name:"missing unlinked source",value:{...response,sources:[]}},
    {name:"invented source",value:{...response,sources:[{...response.sources[0],evidenceId:"invented"}]}},
    {name:"empty summary",value:{...response,facts:[{...response.facts[0],summary:" "},response.facts[1]]}},
    {name:"extra property",value:{...response,confidence:90}},
  ])("rejects $name before persistence",({value})=>{
    expect(()=>validateQualificationPhaseOutput(request,value)).toThrow();
  });

  it("rejects a phase request whose top-level evidence contract does not match its body",()=>{
    expect(()=>validateQualificationPhaseOutput({...request,evidenceIds:["e2","e1"]},response)).toThrow();
  });
});
