import {expect,it} from "vitest";
import {leadEvidenceContentHash} from "@/lib/leads/evidence-snapshot";
import {candidate,correctedCandidate,assessment} from "../../../../scripts/workflow-recovery-fixtures";
import {revalidateSavedRecoveryResume} from "./recovery-resume-revalidation";
import type {LeadEvidenceItem,LeadWorkflowState} from "./types";

const now=new Date("2026-09-14T00:00:00Z");
const old:LeadEvidenceItem={...candidate.evidence[0],id:"original",sourceType:"official-website",
  excerpt:"Original verified fact",contentHash:leadEvidenceContentHash("Original verified fact"),
  evidenceRunId:"child-run",priorRunId:"parent-run",freshnessStatus:"revalidated",
  capturedAt:"2026-09-01T00:00:00Z"};
const fresh:LeadEvidenceItem={...old,id:"new",excerpt:"New verified fact",contentHash:leadEvidenceContentHash("New verified fact"),
  freshnessStatus:"fresh",priorRunId:undefined,capturedAt:"2026-09-13T00:00:00Z"};
const state=(evidence:LeadEvidenceItem[]=[old],queued:string[]=[]):LeadWorkflowState=>({
  userId:"u",actionId:"child",graphThreadId:"thread",workspaceId:"w",runId:"child-run",
  plan:{} as LeadWorkflowState["plan"],phase:"scoring",ragContext:[],candidates:[{...candidate,evidence,evidenceSnapshotRunId:"child-run"}],
  correctedCandidates:[{...correctedCandidate,evidence,evidenceSnapshotRunId:"child-run"}],assessments:[assessment],
  assessmentReviews:[],handoffs:[],creditsUsed:7,modelUsage:[],stageMetrics:[],warnings:[],
  savedProcessingRecovery:{sourceActionId:"parent",sourceRunId:"parent-run",sourceFingerprint:"proof",refreshCandidateIds:queued},
  terminalRecoveryOnly:true,acceptedCandidateCount:1,
});
const readiness=(needsEvidenceRefresh:boolean):Parameters<typeof revalidateSavedRecoveryResume>[1]=>[{candidateId:candidate.candidateId,
  reusableEvidence:needsEvidenceRefresh?0:1,needsEvidenceRefresh,reasons:needsEvidenceRefresh?{"expired-evidence":1}:{}}];

it("keeps a still-valid paused source checkpoint without replay",()=>{
  expect(revalidateSavedRecoveryResume(state(),readiness(false),now)).toBeNull();
});
it("queues newly expired reused evidence and invalidates only its downstream decisions",()=>{
  const previous=state(),patch=revalidateSavedRecoveryResume(previous,readiness(true),now)!;
  expect(patch.savedProcessingRecovery?.refreshCandidateIds).toEqual([candidate.candidateId]);
  expect(patch.candidates?.[0].evidence[0].freshnessStatus).toBe("stale");
  expect(patch.correctedCandidates).toEqual([]);expect(patch.assessments).toEqual([]);
  expect(patch.creditsUsed).toBeUndefined();expect(previous.creditsUsed).toBe(7);
  expect(patch.stageMetrics?.[0].stage).toBe("recovery_resume_evidence_revalidation");
  expect(revalidateSavedRecoveryResume({...previous,...patch} as LeadWorkflowState,readiness(true),now)).toBeNull();
});
it("uses a current fresh fact after an old source expires, but recalculates the decision",()=>{
  const patch=revalidateSavedRecoveryResume(state([old,fresh]),readiness(true),now)!;
  expect(patch.savedProcessingRecovery?.refreshCandidateIds).toEqual([]);
  expect(patch.candidates?.[0].evidence.map(item=>item.freshnessStatus)).toEqual(["stale","fresh"]);
  expect(patch.assessments).toEqual([]);
});
it("never reuses expired or future-dated freshly collected evidence",()=>{
  for(const capturedAt of ["2026-01-01T00:00:00Z","2026-09-15T00:00:00Z"]){
    const patch=revalidateSavedRecoveryResume(state([{...fresh,capturedAt}]),readiness(true),now)!;
    expect(patch.savedProcessingRecovery?.refreshCandidateIds).toEqual([candidate.candidateId]);
  }
});
it("invalidates a checkpoint whose referenced public version was superseded",()=>{
  const id="00000000-0000-4000-8000-000000000001";
  const linked={...fresh,publicDocumentVersionId:id};
  expect(revalidateSavedRecoveryResume(state([linked]),readiness(true),now,new Set())
    ?.savedProcessingRecovery?.refreshCandidateIds).toEqual([candidate.candidateId]);
  expect(revalidateSavedRecoveryResume(state([linked]),readiness(true),now,new Set([id]))).toBeNull();
});
