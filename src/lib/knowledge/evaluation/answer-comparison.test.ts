import {describe,expect,it} from "vitest";
import {answerCandidateSha256,scoreAnswerComparison,type AnswerCandidate,type AnswerVerdict,type BlindManifest} from "./answer-comparison";

const manifest:BlindManifest={corpusVersion:"test",profileKey:"frozen",profileSha256:"a".repeat(64),goldSnapshotSha256:"b".repeat(64),
  cases:Array.from({length:50},(_,index)=>({caseId:`case-${index}`,caseSha256:"c".repeat(64),query:`query ${index}`,
    expectedOutcome:index<44?"route":"clarify",group:index<40?"base":"boundary",tags:["test"]}))};
const candidates:AnswerCandidate[]=manifest.cases.flatMap(item=>(["v3","vectorless"] as const).map(path=>({
  caseId:item.caseId,path,answer:"A recorded answer",citations:item.expectedOutcome==="route"?
    [{assetSha256:"d".repeat(64),unitIndex:1,excerpt:"source excerpt"}]:[],receiptIds:[`${item.caseId}-${path}`],modelId:"recorded-model",
  retrievalProfileSha256:manifest.profileSha256})));
const verdicts:AnswerVerdict[]=candidates.map(candidate=>({caseId:candidate.caseId,path:candidate.path,
  candidateSha256:answerCandidateSha256(candidate),answerCorrect:true,preciseCitationCorrect:true,
  reviewer:"reviewer-id",reviewedAt:"2026-09-30T00:00:00Z",note:"checked"}));

describe("holdout answer comparison",()=>{
  it("requires 100 independently reviewed path answers",()=>{
    const result=scoreAnswerComparison({manifest,candidates,verdicts});
    expect(result.complete).toBe(true);
    expect(result.holdoutNonRegression).toBe(true);
    expect(result.totals.vectorless).toEqual({total:50,reviewed:50,answerCorrect:50,preciseCitationCorrect:50});
    expect(result.byGroup.base.v3.total).toBe(40);
  });
  it("cannot pass a partial comparison",()=>{
    const result=scoreAnswerComparison({manifest,candidates,verdicts:verdicts.slice(0,-1)});
    expect(result.complete).toBe(false);
    expect(result.holdoutNonRegression).toBe(false);
    expect(result.missingVerdicts).toHaveLength(1);
  });
  it("fails closed on answer edits and frozen profile drift",()=>{
    expect(()=>scoreAnswerComparison({manifest,candidates,verdicts:[{...verdicts[0],candidateSha256:"0".repeat(64)},...verdicts.slice(1)]}))
      .toThrow("Changed answer after review");
    expect(()=>scoreAnswerComparison({manifest,candidates:[{...candidates[0],retrievalProfileSha256:"0".repeat(64)},...candidates.slice(1)],verdicts}))
      .toThrow("Profile drift");
  });
  it("reports a quality regression even when every result is reviewed",()=>{
    const result=scoreAnswerComparison({manifest,candidates,verdicts:verdicts.map(row=>
      row.caseId==="case-0"&&row.path==="vectorless"?{...row,answerCorrect:false}:row)});
    expect(result.complete).toBe(true);
    expect(result.holdoutNonRegression).toBe(false);
    expect(result.totals.vectorless.answerCorrect).toBe(49);
  });
  it("rejects unreviewed extra sources on non-answer cases",()=>{
    expect(()=>scoreAnswerComparison({manifest,candidates:candidates.map(row=>
      row.caseId==="case-49"&&row.path==="v3"?{...row,citations:[{assetSha256:"x",unitIndex:1}]}:row),verdicts}))
      .toThrow("Unexpected citation");
  });
  it("cannot label a missing route citation precise",()=>{
    expect(()=>scoreAnswerComparison({manifest,candidates:candidates.map(row=>
      row.caseId==="case-0"&&row.path==="v3"?{...row,citations:[]}:row),
      verdicts:verdicts.map(row=>row.caseId==="case-0"&&row.path==="v3"?
        {...row,candidateSha256:answerCandidateSha256({...candidates[0],citations:[]})}:row)}))
      .toThrow("Precise citation verdict lacks precise coordinates");
  });
});
