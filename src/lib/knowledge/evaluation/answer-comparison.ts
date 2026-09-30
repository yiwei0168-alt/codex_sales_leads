import {createHash} from "node:crypto";
import {goldSourceIsPrecise,stableJson,type GoldSourceCoordinate} from "../review-types";

export type AnswerPath="v3"|"vectorless";
export type BlindCase={caseId:string;caseSha256:string;query:string;expectedOutcome:string;group:string;tags:string[]};
export type BlindManifest={corpusVersion:string;profileKey:string;profileSha256:string;goldSnapshotSha256:string;cases:BlindCase[]};
export type AnswerCandidate={caseId:string;path:AnswerPath;answer:string;citations:GoldSourceCoordinate[];
  receiptIds:string[];modelId:string;retrievalProfileSha256:string};
export type AnswerVerdict={caseId:string;path:AnswerPath;candidateSha256:string;answerCorrect:boolean;
  preciseCitationCorrect:boolean;reviewer:string;reviewedAt:string;note:string};
export type ComparisonInput={manifest:BlindManifest;candidates:AnswerCandidate[];verdicts:AnswerVerdict[]};

export const answerCandidateSha256=(candidate:AnswerCandidate)=>createHash("sha256").update(stableJson(candidate)).digest("hex");
const key=(caseId:string,path:AnswerPath)=>`${caseId}:${path}`;

/** Human verdicts are required for both quality axes; coordinates alone cannot prove support. */
export function scoreAnswerComparison(input:ComparisonInput){
  const {manifest,candidates,verdicts}=input;
  if(manifest.cases.length!==50||new Set(manifest.cases.map(item=>item.caseId)).size!==50)
    throw new Error("Exactly 50 distinct frozen holdout cases required");
  const cases=new Map(manifest.cases.map(item=>[item.caseId,item]));
  const candidateMap=new Map<string,AnswerCandidate>();
  for(const candidate of candidates){
    const item=cases.get(candidate.caseId);
    if(!item||!["v3","vectorless"].includes(candidate.path))throw new Error(`Unknown candidate ${candidate.caseId}:${candidate.path}`);
    if(candidate.retrievalProfileSha256!==manifest.profileSha256)throw new Error(`Profile drift: ${candidate.caseId}:${candidate.path}`);
    if(!candidate.modelId.trim()||!candidate.answer.trim()||candidate.receiptIds.length===0
      ||candidate.receiptIds.some(receipt=>!receipt.trim()))throw new Error(`Incomplete candidate ${candidate.caseId}:${candidate.path}`);
    if(item.expectedOutcome!=="route"&&candidate.citations.length>0)throw new Error(`Unexpected citation for ${candidate.caseId}:${candidate.path}`);
    const id=key(candidate.caseId,candidate.path);
    if(candidateMap.has(id))throw new Error(`Duplicate candidate ${id}`);
    candidateMap.set(id,candidate);
  }
  const verdictMap=new Map<string,AnswerVerdict>();
  for(const verdict of verdicts){
    const id=key(verdict.caseId,verdict.path);
    const candidate=candidateMap.get(id);
    if(!candidate)throw new Error(`Verdict without candidate ${id}`);
    if(verdictMap.has(id))throw new Error(`Duplicate verdict ${id}`);
    if(verdict.candidateSha256!==answerCandidateSha256(candidate))throw new Error(`Changed answer after review ${id}`);
    if(!verdict.reviewer.trim()||!Number.isFinite(Date.parse(verdict.reviewedAt))
      ||typeof verdict.answerCorrect!=="boolean"||typeof verdict.preciseCitationCorrect!=="boolean")
      throw new Error(`Incomplete human verdict ${id}`);
    if(verdict.preciseCitationCorrect&&cases.get(verdict.caseId)?.expectedOutcome==="route"
      &&(candidate.citations.length===0||candidate.citations.some(source=>!goldSourceIsPrecise(source))))
      throw new Error(`Precise citation verdict lacks precise coordinates ${id}`);
    verdictMap.set(id,verdict);
  }
  const missingCandidates:string[]=[];
  const missingVerdicts:string[]=[];
  for(const item of manifest.cases)for(const path of ["v3","vectorless"] as const){
    const id=key(item.caseId,path);
    if(!candidateMap.has(id))missingCandidates.push(id);
    else if(!verdictMap.has(id))missingVerdicts.push(id);
  }
  const summarize=(selected:BlindCase[])=>{
    const byPath=Object.fromEntries((["v3","vectorless"] as const).map(path=>{
      const reviewed=selected.flatMap(item=>{const verdict=verdictMap.get(key(item.caseId,path));return verdict?[verdict]:[];});
      return[path,{total:selected.length,reviewed:reviewed.length,answerCorrect:reviewed.filter(row=>row.answerCorrect).length,
        preciseCitationCorrect:reviewed.filter(row=>row.preciseCitationCorrect).length}];
    })) as Record<AnswerPath,{total:number;reviewed:number;answerCorrect:number;preciseCitationCorrect:number}>;
    return byPath;
  };
  const byGroup=Object.fromEntries([...new Set(manifest.cases.map(item=>item.group))].sort().map(group=>
    [group,summarize(manifest.cases.filter(item=>item.group===group))]));
  const byTag=Object.fromEntries([...new Set(manifest.cases.flatMap(item=>item.tags))].sort().map(tag=>
    [tag,summarize(manifest.cases.filter(item=>item.tags.includes(tag)))]));
  const totals=summarize(manifest.cases);
  const complete=missingCandidates.length===0&&missingVerdicts.length===0;
  const noRegression=complete&&totals.vectorless.answerCorrect>=totals.v3.answerCorrect
    &&totals.vectorless.preciseCitationCorrect>=totals.v3.preciseCitationCorrect;
  return{corpusVersion:manifest.corpusVersion,profileSha256:manifest.profileSha256,
    goldSnapshotSha256:manifest.goldSnapshotSha256,complete,holdoutNonRegression:noRegression,
    missingCandidates,missingVerdicts,totals,byGroup,byTag};
}
