import {expect,it} from "vitest";
import {savedRecoverySeed} from "./saved-recovery-seed";
import {candidate,correctedCandidate} from "../../../../scripts/workflow-recovery-fixtures";
type Prepared=Parameters<typeof savedRecoverySeed>[0];
it("copies only pending scope, retaining dates and source IDs while rechecking model dependencies",()=>{
  const input={runId:"new-run",scope:{companies:[{candidates:[correctedCandidate]}]},
    proof:{sourceActionId:"parent",sourceRunId:"old-run",checkpointFingerprint:"proof"},
    evidenceReadiness:[{candidateId:candidate.candidateId,needsEvidenceRefresh:false}]} as unknown as Prepared;
  const before=JSON.stringify(input),seed=savedRecoverySeed(input);
  expect(seed.candidates[0]).not.toHaveProperty("correction");
  expect(seed.candidates[0].evidenceSnapshotRunId).toBe("new-run");
  expect(seed.candidates[0].evidence[0].capturedAt).toBe(correctedCandidate.evidence[0].capturedAt);
  expect(seed.candidates[0].evidence[0].evidenceRunId).toBe("new-run");
  expect(seed.savedProcessingRecovery.refreshCandidateIds).toEqual([]);
  expect(seed.terminalRecoveryOnly).toBe(true);expect(JSON.stringify(input)).toBe(before);
});
it("keeps evidence requiring refresh as stale instead of renewing it",()=>{
  const input={runId:"new-run",scope:{companies:[{candidates:[correctedCandidate]}]},
    proof:{sourceActionId:"parent",sourceRunId:"old-run",checkpointFingerprint:"proof"},evidenceReadiness:[]} as unknown as Prepared;
  const seed=savedRecoverySeed(input);
  expect(seed.savedProcessingRecovery.refreshCandidateIds).toEqual([candidate.candidateId]);
  expect(seed.candidates[0].evidence.filter(item=>item.sourceType!=="discovery").every(item=>item.freshnessStatus==="stale")).toBe(true);
});
