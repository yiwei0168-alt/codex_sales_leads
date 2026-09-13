import {expect,it} from "vitest";
import {recoveryEvidenceReadiness,type RecoveryEvidenceSnapshot} from "./recovery-evidence-readiness";
import {leadEvidenceContentHash} from "@/lib/leads/evidence-snapshot";
import {candidate} from "../../../../scripts/workflow-recovery-fixtures";
const capturedAt="2026-09-01T00:00:00.000Z",now=new Date("2026-09-13T00:00:00Z");
const evidence={id:"e",url:"https://fixture.invalid/",title:"Fixture",excerpt:"Synthetic public evidence",sourceType:"official-website" as const,
  provider:"fixture",capturedAt,evidenceRunId:"r",contentHash:leadEvidenceContentHash("Synthetic public evidence"),freshnessStatus:"fresh" as const};
const source={...candidate,evidenceSnapshotRunId:"r",evidence:[evidence]};
const row:RecoveryEvidenceSnapshot={candidate_id:source.candidateId,source_url:evidence.url,content_hash:evidence.contentHash,content:evidence.excerpt,
  source_type:evidence.sourceType,retrieved_at:capturedAt,expires_at:"2026-11-30T00:00:00Z",evidence_kinds:[],public_valid:true};
it("retains valid bound evidence with its original date and never mutates source",()=>{
  const before=JSON.stringify(source);
  expect(recoveryEvidenceReadiness(source,[row],now)).toMatchObject({reusableEvidence:1,needsEvidenceRefresh:false});
  expect(JSON.stringify(source)).toBe(before);
});
it("treats expired evidence as refreshable, including the exact expiry boundary",()=>{
  expect(recoveryEvidenceReadiness(source,[{...row,expires_at:now.toISOString()}],now).reasons).toEqual({"expired-evidence":1});
  expect(recoveryEvidenceReadiness(source,[{...row,expires_at:"2030-01-01"}],new Date("2027-01-01")).reasons).toEqual({"expired-evidence":1});
});
it("rejects missing, superseded and altered source bindings without business rejection",()=>{
  expect(recoveryEvidenceReadiness(source,[],now).reasons).toEqual({"missing-saved-evidence":1});
  expect(recoveryEvidenceReadiness(source,[{...row,public_valid:false}],now).reasons).toEqual({"superseded-or-invalid-public-evidence":1});
  expect(recoveryEvidenceReadiness({...source,evidence:[{...evidence,excerpt:"Changed"}]},[row],now).reasons).toEqual({"invalid-evidence-binding":1});
  expect(recoveryEvidenceReadiness({...source,evidence:[]},[],now).reasons).toEqual({"missing-scoring-evidence":1});
});
it("does not renew evidence by changing capture time or accepting unknown clocks",()=>{
  for(const saved of [{...row,retrieved_at:now},{...row,expires_at:"invalid"},{...row,retrieved_at:"2027-01-01"}]){
    expect(recoveryEvidenceReadiness(source,[saved],now).reasons).toEqual({"invalid-evidence-date":1});
  }
  expect(recoveryEvidenceReadiness(source,[row],new Date("invalid")).needsEvidenceRefresh).toBe(true);
});
