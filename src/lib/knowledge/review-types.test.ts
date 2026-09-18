import {describe,expect,it} from "vitest";
import {buildKnowledgeEvaluationCorpus} from "./evaluation/corpus";
import {correctedFactValueIsValid,evaluationCaseSha256,goldSourcesRequired,retrievalProfileSha256,stableJson} from "./review-types";

describe("knowledge review contracts",()=>{
  it("hashes cases and the frozen retrieval profile deterministically",()=>{
    const item=buildKnowledgeEvaluationCorpus().cases[0];
    expect(evaluationCaseSha256(item)).toMatch(/^[0-9a-f]{64}$/);
    expect(evaluationCaseSha256({...item})).toBe(evaluationCaseSha256(item));
    expect(retrievalProfileSha256()).toMatch(/^[0-9a-f]{64}$/);
    expect(stableJson({b:1,a:2})).toBe('{"a":2,"b":1}');
  });
  it("requires sources for evidence-bearing outcomes but not clarify or deny",()=>{
    expect(goldSourcesRequired({expectedOutcome:"route"})).toBe(true);
    expect(goldSourcesRequired({expectedOutcome:"insufficient-evidence"})).toBe(true);
    expect(goldSourcesRequired({expectedOutcome:"clarify"})).toBe(false);
    expect(goldSourcesRequired({expectedOutcome:"deny"})).toBe(false);
  });
  it("validates human corrections against the versioned attribute type and unit",()=>{
    expect(correctedFactValueIsValid("ethernet_port_count",8,"port")).toBe(true);
    expect(correctedFactValueIsValid("ethernet_port_count",8.5,"port")).toBe(false);
    expect(correctedFactValueIsValid("ethernet_port_count",8,"W")).toBe(false);
    expect(correctedFactValueIsValid("dimensions",[100,"80",20],"mm")).toBe(true);
    expect(correctedFactValueIsValid("cellular_generation",["4G","5G"],null)).toBe(true);
  });
});
