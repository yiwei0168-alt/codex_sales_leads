import type {PoolClient} from 'pg';
import {beforeEach,expect,it,vi} from 'vitest';
import {digest} from './contracts';
import {requireCanonicalSkillAcceptanceOriginals} from './skill-canonical-original-coverage';
import {revalidateLockedSkillAcceptanceMaterials,evaluateLockedSkillAcceptanceReadiness} from './skill-locked-materials';
const m=vi.hoisted(()=>({read:vi.fn(),material:vi.fn(),policy:vi.fn(),lock:vi.fn(),methods:vi.fn(),query:vi.fn(),memoryBoundary:vi.fn(),times:vi.fn(),bytes:vi.fn(),knowledgeBytes:vi.fn(),memoryReceipts:vi.fn(),runner:vi.fn(),transports:vi.fn()}));
vi.mock('./skill-locked-transport-receipts',()=>({revalidateLockedSkillTransportReceipts:m.transports}));
vi.mock('./skill-runner-attestation-store',()=>({readLockedSkillRunnerAttestation:m.runner}));
vi.mock('./skill-memory-receipt-check',()=>({revalidateLockedSkillMemoryReceipts:m.memoryReceipts}));
vi.mock('./skill-knowledge-receipt-bytes',()=>({revalidateLockedSkillKnowledgeReceiptBytes:m.knowledgeBytes}));
vi.mock('./skill-attachment-bytes',()=>({revalidateLockedSkillAttachmentBytes:m.bytes}));
vi.mock('./skill-acceptance-run-locks',()=>({lockSkillAcceptanceRunJournals:m.lock}));
vi.mock('./skill-pinned-method-locks',()=>({lockSkillAcceptancePinnedMethods:m.methods}));
vi.mock('./memory-message-guard',()=>({withCurrentDecisionMemory:m.memoryBoundary}));
vi.mock('./skill-experience-time-check',()=>({revalidateLockedSkillExperienceTimes:m.times}));
vi.mock('@/lib/rag/db',()=>({withBoundTenantTransaction:async(_client:unknown,_user:string,work:()=>Promise<unknown>)=>work()}));
vi.mock('./skill-acceptance-store',()=>({readLockedSkillAcceptanceEvidence:m.read}));
vi.mock('./skill-acceptance-review',()=>({readSkillAcceptanceReviewCase:m.material}));
vi.mock('./local-analysis-boundary',()=>({assertLocalAnalysisBoundary:()=>{}}));
vi.mock('./skill-locked-acceptance-policy',()=>({evaluateLockedSkillAcceptancePolicy:m.policy}));
const context={userId:'owner'},client={query:m.query} as unknown as PoolClient,bundleId='bundle';
const observation={caseId:'replay',baseline:{answerHash:digest('PRIVATE baseline')},candidate:{answerHash:digest('PRIVATE candidate')}};
const bundle={skillCatalogSourcesLocked:true,knowledgeSourcesLocked:true,decisionMemorySourcesLocked:true,artifactHash:digest('artifact'),latestReviewHash:digest('reviews'),currentPin:{version:1},freezeStatus:{freezeId:'freeze'},
 artifact:{sourceKind:'synthetic-fixture',plan:{cases:[{id:'replay'}]},observations:[observation]}};
const material=()=>({bundleId,caseId:'replay',artifactHash:bundle.artifactHash,observationHash:digest(observation),sourceKind:'synthetic-fixture',
 freezeStatus:{state:'active',freezeId:'freeze'},canPass:{baseline:true,candidate:true},baseline:'PRIVATE baseline',candidate:'PRIVATE candidate',receipts:['PRIVATE receipt']});
const canonicalBytes={attachmentBytesRevalidated:true,attachmentBytesCount:1,attachmentBytesManifestHash:digest('attachment'),
 attachmentImmutableSnapshotCount:1,attachmentImmutableSnapshotManifestHash:digest('attachment-snapshot')};
const canonicalKnowledge={knowledgeReceiptBytesRevalidated:true,knowledgeReceiptAssetCount:1,knowledgeReceiptDatabaseOnlyCount:0,
 knowledgeReceiptBytesManifestHash:digest('knowledge'),knowledgeReceiptImmutableSnapshotCount:1,knowledgeReceiptImmutableSnapshotManifestHash:digest('knowledge-snapshot')};
function pendingOriginals(){
 const sourceKind='production-runner-pending-verification';
 m.read.mockResolvedValue({...bundle,artifact:{...bundle.artifact,sourceKind}});
 m.material.mockResolvedValue({...material(),sourceKind});
 m.bytes.mockResolvedValue(canonicalBytes);m.knowledgeBytes.mockResolvedValue(canonicalKnowledge);
}
beforeEach(()=>{vi.resetAllMocks();m.read.mockResolvedValue(bundle);m.material.mockResolvedValue(material());
 m.bytes.mockResolvedValue({attachmentBytesRevalidated:true,attachmentBytesCount:1,attachmentBytesManifestHash:'manifest'});
 m.knowledgeBytes.mockResolvedValue({knowledgeReceiptBytesRevalidated:true,knowledgeReceiptAssetCount:1,knowledgeReceiptDatabaseOnlyCount:0,knowledgeReceiptBytesManifestHash:'knowledge-manifest'});
 m.memoryReceipts.mockResolvedValue({memoryReceiptSourcesRevalidated:true,memoryReceiptCount:1,memoryReceiptCheckedAt:'2026-10-19T01:02:03.000Z'});
 m.transports.mockResolvedValue({transportReceiptsRequired:false,transportReceiptsRevalidated:false});
 m.runner.mockResolvedValue({runnerDeclarationRequired:false,runnerDeclarationRevalidated:false,collectorProvenanceVerified:false,automaticActivation:false});
 m.query.mockResolvedValue({rows:[]});m.memoryBoundary.mockImplementation(async(_user:string,work:()=>Promise<unknown>)=>work());
 m.times.mockResolvedValue({methodExperienceTimesRevalidated:true,methodExperienceTimeCheckedAt:'2026-10-19T01:00:00.000Z',methodExperienceValidBefore:'2026-10-19T02:00:00.000Z',methodExperienceTimeObservationCount:2});
 m.methods.mockResolvedValue({pinnedMethodSourcesLocked:true,pinnedMethodPinCount:2,pinnedMethodVersionCount:1,pinnedMethodExperienceObservationCount:2});
 m.lock.mockResolvedValue({timelineSourcesLocked:true,timelineCustomerCount:0,mailReadSourcesLocked:true,mailCount:0,attachmentMetadataLocked:true,attachmentCount:0,taskOriginsLocked:true,taskJournalsLocked:true,runCount:1});
 m.policy.mockResolvedValue({artifactHash:bundle.artifactHash,latestReviewHash:bundle.latestReviewHash,policyPassed:false,automaticActivation:false});});
it('rebuilds planned material and returns hashes without private answers or receipts',async()=>{
 const out=await revalidateLockedSkillAcceptanceMaterials(client,context,bundleId);
 expect(out).toMatchObject({sourcePayloadsRevalidated:true,sourceRevocationsLocked:false,automaticActivation:false});
 expect(m.material).toHaveBeenCalledExactlyOnceWith(context,{bundleId,caseId:'replay'});expect(m.read).toHaveBeenCalledTimes(2);
 expect(JSON.stringify(out)).not.toContain('PRIVATE');expect(out.materials).toHaveLength(1);
 expect(out).not.toHaveProperty('recheckKnowledgeBytes');
 expect(out).toMatchObject({pinnedMethodSourcesLocked:true,pinnedMethodPinCount:2});
 expect(m.lock.mock.invocationCallOrder[0]).toBeLessThan(m.methods.mock.invocationCallOrder[0]);
 expect(m.methods.mock.invocationCallOrder[0]).toBeLessThan(m.material.mock.invocationCallOrder[0]);
});
it.each([{artifactHash:'different'},{observationHash:'different'},{sourceKind:'different'},{baseline:'tampered'},
 {freezeStatus:{state:'revoked',freezeId:'freeze'}},{canPass:{baseline:true,candidate:false}}])('rejects changed material %j',async change=>{
 m.material.mockResolvedValue({...material(),...change});await expect(revalidateLockedSkillAcceptanceMaterials(client,context,bundleId)).rejects.toThrow('binding or completed arms');
});
it('rejects a missing planned observation before material reconstruction',async()=>{
 m.read.mockResolvedValue({...bundle,artifact:{...bundle.artifact,observations:[]}});
 await expect(revalidateLockedSkillAcceptanceMaterials(client,context,bundleId)).rejects.toThrow('observation missing');expect(m.material).not.toHaveBeenCalled();
});
it('rejects changed final review state',async()=>{
 m.read.mockResolvedValueOnce(bundle).mockResolvedValueOnce({...bundle,latestReviewHash:'changed'});
 await expect(revalidateLockedSkillAcceptanceMaterials(client,context,bundleId)).rejects.toThrow('evidence changed');
});
it('propagates an unavailable source without returning partial success',async()=>{
 m.material.mockRejectedValue(new Error('Source purged'));
 await expect(revalidateLockedSkillAcceptanceMaterials(client,context,bundleId)).rejects.toThrow('Source purged');
});
it('rejects unavailable task locks before reading private materials',async()=>{
 m.lock.mockRejectedValue(new Error('Acceptance source task unavailable'));
 await expect(revalidateLockedSkillAcceptanceMaterials(client,context,bundleId)).rejects.toThrow('task unavailable');
 expect(m.material).not.toHaveBeenCalled();
});
it('rejects revoked pinned methods before reading private materials',async()=>{
 m.methods.mockRejectedValue(new Error('Acceptance pinned method source changed'));
 await expect(revalidateLockedSkillAcceptanceMaterials(client,context,bundleId)).rejects.toThrow('pinned method source changed');
 expect(m.material).not.toHaveBeenCalled();
});
it('combines material reconstruction and policy while keeping activation and source-lock gates closed',async()=>{
 const out=await evaluateLockedSkillAcceptanceReadiness(client,context,bundleId);
 expect(out).toMatchObject({sourcePayloadsRevalidated:true,policyPassed:false,sourceRevocationsLocked:false,collectorProvenanceVerified:false,automaticActivation:false});
 expect(out).toMatchObject({pinnedMethodSourcesLocked:true,pinnedMethodPinCount:2,pinnedMethodExperienceObservationCount:2});
 expect(out.skillCatalogSourcesLocked).toBe(true);
 expect(out.decisionMemorySnapshotRevalidated).toBe(true);
 expect(out).toMatchObject({canonicalOriginalCoverageRequired:false,canonicalOriginalCoverageRevalidated:false});
 expect(out.methodExperienceTimesRevalidated).toBe(true);
 expect(m.policy.mock.invocationCallOrder[0]).toBeLessThan(m.times.mock.invocationCallOrder[0]);
 expect(m.query).toHaveBeenCalledExactlyOnceWith('select lock_skill_knowledge_sources()');
 expect(m.query.mock.invocationCallOrder[0]).toBeLessThan(m.memoryBoundary.mock.invocationCallOrder[0]);
 expect(JSON.stringify(out)).not.toContain('PRIVATE');expect(m.policy).toHaveBeenCalledExactlyOnceWith(client,context,bundleId);
});
it('requires canonical originals for pending production preparation without granting activation',async()=>{
 pendingOriginals();const out=await evaluateLockedSkillAcceptanceReadiness(client,context,bundleId);
 expect(out).toMatchObject({canonicalOriginalCoverageRequired:true,canonicalOriginalCoverageRevalidated:true,
  sourceRevocationsLocked:false,collectorProvenanceVerified:false,automaticActivation:false});
 expect(out.canonicalOriginalCoverageHash).toMatch(/^[a-f0-9]{64}$/);
});
it.each(['attachment','knowledge'])('rejects uncaptured %s originals even on a readonly mount',async domain=>{
 pendingOriginals();
 if(domain==='attachment')m.bytes.mockResolvedValue({...canonicalBytes,attachmentImmutableSnapshotCount:0,attachmentReadOnlyMountVerified:true});
 else m.knowledgeBytes.mockResolvedValue({...canonicalKnowledge,knowledgeReceiptImmutableSnapshotCount:0,knowledgeReceiptReadOnlyMountVerified:true});
 await expect(evaluateLockedSkillAcceptanceReadiness(client,context,bundleId)).rejects.toThrow('explicit canonical capture');
 expect(m.times).not.toHaveBeenCalled();
});
it.each([
 {attachmentImmutableSnapshotCount:undefined},{knowledgeReceiptImmutableSnapshotCount:-1},
 {attachmentBytesCount:1.5},{attachmentImmutableSnapshotCount:10001},
 {knowledgeReceiptImmutableSnapshotManifestHash:undefined},{attachmentBytesManifestHash:'invalid'},
 {attachmentBytesRevalidated:false},
])('rejects missing or malformed original coverage %j',change=>{
 expect(()=>requireCanonicalSkillAcceptanceOriginals('production-runner-pending-verification',{
  ...canonicalBytes,...canonicalKnowledge,...change})).toThrow('evidence missing or invalid');
});
it('requires explicit zero-file manifests while permitting database-only evidence without invented files',()=>{
 const empty={...canonicalBytes,...canonicalKnowledge,attachmentBytesCount:0,attachmentImmutableSnapshotCount:0,
  knowledgeReceiptAssetCount:0,knowledgeReceiptImmutableSnapshotCount:0,knowledgeReceiptDatabaseOnlyCount:3};
 expect(requireCanonicalSkillAcceptanceOriginals('production-runner-pending-verification',empty)).toMatchObject({canonicalOriginalCoverageRevalidated:true});
 expect(()=>requireCanonicalSkillAcceptanceOriginals('production-runner-pending-verification',{})).toThrow('evidence missing or invalid');
 expect(()=>requireCanonicalSkillAcceptanceOriginals('unknown',empty)).toThrow('Unsupported');
});
it('rejects different material and policy snapshots',async()=>{
 m.policy.mockResolvedValue({artifactHash:'changed',latestReviewHash:bundle.latestReviewHash});
 await expect(evaluateLockedSkillAcceptanceReadiness(client,context,bundleId)).rejects.toThrow('snapshots differ');
});
it('does not return readiness when decision memory expires after policy calculation',async()=>{
 m.memoryBoundary.mockImplementation(async(_user:string,work:()=>Promise<unknown>)=>{await work();throw new Error('Decision memory expired after policy');});
 await expect(evaluateLockedSkillAcceptanceReadiness(client,context,bundleId)).rejects.toThrow('Decision memory expired after policy');
 expect(m.policy).toHaveBeenCalledOnce();
});
it('does not inspect private memory or material when source admission fails',async()=>{
 m.query.mockRejectedValue(new Error('Source admission unavailable'));
 await expect(evaluateLockedSkillAcceptanceReadiness(client,context,bundleId)).rejects.toThrow('Source admission unavailable');
 expect(m.memoryBoundary).not.toHaveBeenCalled();expect(m.material).not.toHaveBeenCalled();
});
it('rejects local experience expiry after material and policy preparation',async()=>{
 m.times.mockRejectedValue(new Error('Acceptance method experience time changed after preparation'));
 await expect(evaluateLockedSkillAcceptanceReadiness(client,context,bundleId)).rejects.toThrow('experience time changed after preparation');
 expect(m.policy).toHaveBeenCalledOnce();
});
it('checks bytes before material and again after policy, without granting filesystem locks',async()=>{
 const out=await evaluateLockedSkillAcceptanceReadiness(client,context,bundleId);
 expect(out).toMatchObject({attachmentBytesRevalidated:true,attachmentBytesCount:1,sourceRevocationsLocked:false,automaticActivation:false});
 expect(m.bytes).toHaveBeenCalledTimes(2);
 expect(m.bytes.mock.invocationCallOrder[0]).toBeLessThan(m.material.mock.invocationCallOrder[0]);
 expect(m.policy.mock.invocationCallOrder[0]).toBeLessThan(m.bytes.mock.invocationCallOrder[1]);
 expect(m.bytes.mock.invocationCallOrder[1]).toBeLessThan(m.times.mock.invocationCallOrder[0]);
});
it('rejects same-sized file tampering during preparation',async()=>{
 m.bytes.mockResolvedValueOnce({attachmentBytesManifestHash:'manifest'}).mockRejectedValueOnce(new Error('Acceptance attachment bytes changed'));
 await expect(evaluateLockedSkillAcceptanceReadiness(client,context,bundleId)).rejects.toThrow('attachment bytes changed');
 expect(m.times).not.toHaveBeenCalled();
});
it('rejects attachment registration drift even when both byte reads succeed',async()=>{
 m.bytes.mockResolvedValueOnce({attachmentBytesManifestHash:'manifest'}).mockResolvedValueOnce({attachmentBytesManifestHash:'changed'});
 await expect(evaluateLockedSkillAcceptanceReadiness(client,context,bundleId)).rejects.toThrow('registration changed');
});
it('retains only authenticated task receipt references for the final byte check',async()=>{
 const receipt={tool:'knowledge_originals',output:{status:'success',data:{documents:[]}}};
 m.read.mockResolvedValue({...bundle,artifact:{...bundle.artifact,plan:{cases:[{id:'replay',provenance:'historical-task'}]}}});
 m.material.mockResolvedValue({...material(),receipts:[receipt]});
 const out=await evaluateLockedSkillAcceptanceReadiness(client,context,bundleId);
 expect(m.knowledgeBytes).toHaveBeenCalledTimes(2);
 expect(m.knowledgeBytes).toHaveBeenLastCalledWith(client,context.userId,[receipt]);
 expect(m.policy.mock.invocationCallOrder[0]).toBeLessThan(m.knowledgeBytes.mock.invocationCallOrder[1]);
 expect(out).toMatchObject({knowledgeReceiptBytesRevalidated:true,knowledgeReceiptAssetCount:1});
 expect(JSON.stringify(out)).not.toContain('knowledge_originals');
});
it('does not interpret adversarial safety fixture receipts as real knowledge assets',async()=>{
 m.read.mockResolvedValue({...bundle,artifact:{...bundle.artifact,plan:{cases:[{id:'replay',provenance:'safety-fixture'}]}}});
 await evaluateLockedSkillAcceptanceReadiness(client,context,bundleId);
 expect(m.knowledgeBytes).toHaveBeenLastCalledWith(client,context.userId,[]);
});
it('rejects a knowledge file changing after policy preparation',async()=>{
 m.knowledgeBytes.mockResolvedValueOnce({knowledgeReceiptBytesRevalidated:true,knowledgeReceiptAssetCount:1,knowledgeReceiptDatabaseOnlyCount:0,knowledgeReceiptBytesManifestHash:'knowledge-manifest'})
  .mockRejectedValueOnce(new Error('Acceptance attachment bytes changed'));
 await expect(evaluateLockedSkillAcceptanceReadiness(client,context,bundleId)).rejects.toThrow('bytes changed');
 expect(m.times).not.toHaveBeenCalled();
});
it('checks consumed memory again after policy without exposing private receipt callbacks',async()=>{
 const out=await evaluateLockedSkillAcceptanceReadiness(client,context,bundleId);
 expect(out).toMatchObject({memoryReceiptSourcesRevalidated:true,memoryReceiptCount:1});
 expect(out).not.toHaveProperty('recheckMemoryReceipts');expect(m.memoryReceipts).toHaveBeenCalledTimes(2);
 expect(m.policy.mock.invocationCallOrder[0]).toBeLessThan(m.memoryReceipts.mock.invocationCallOrder[1]);
 expect(m.memoryReceipts.mock.invocationCallOrder[1]).toBeLessThan(m.times.mock.invocationCallOrder[0]);
});
it('rejects a consumed observation expiring during preparation',async()=>{
 m.memoryReceipts.mockResolvedValueOnce({memoryReceiptCount:1}).mockRejectedValueOnce(new Error('Memory context validation failed'));
 await expect(evaluateLockedSkillAcceptanceReadiness(client,context,bundleId)).rejects.toThrow('Memory context validation failed');
 expect(m.times).not.toHaveBeenCalled();
});
const runnerEnrollment={keyId:'runner-key',collectorId:'runner',deploymentHash:digest('runner-package'),purpose:'runner-declaration' as const};
const transportEnrollments=[{keyId:'task-key',collectorId:'task',deploymentHash:digest('task-package'),purpose:'task-model-transport' as const},
 {keyId:'evaluation-key',collectorId:'evaluation',deploymentHash:digest('evaluation-package'),purpose:'model-transport' as const}];
const declaration={runnerDeclarationRequired:true,runnerDeclarationRevalidated:true,runnerDeclarationId:'declaration',runnerStatementHash:'statement',runnerRegistryHash:digest('registry'),runnerSigningEnrollment:runnerEnrollment,runnerDeclarationCheckedAt:'2026-10-19T01:00:00.000Z',runnerDeclarationValidBefore:'2026-10-19T01:30:00.000Z'};
it('rechecks the signed declaration after preparation without qualifying production provenance',async()=>{
 m.transports.mockResolvedValue(transports);
 m.runner.mockResolvedValueOnce(declaration).mockResolvedValueOnce({...declaration,runnerDeclarationCheckedAt:'2026-10-19T01:01:00.000Z'});
 const out=await evaluateLockedSkillAcceptanceReadiness(client,context,bundleId);
 expect(out).toMatchObject({runnerDeclarationRevalidated:true,runnerDeclarationCheckedAt:'2026-10-19T01:01:00.000Z',collectorProvenanceVerified:false,automaticActivation:false});
 expect(m.runner.mock.invocationCallOrder[0]).toBeLessThan(m.material.mock.invocationCallOrder[0]);
 expect(m.policy.mock.invocationCallOrder[0]).toBeLessThan(m.runner.mock.invocationCallOrder[1]);
 expect(m.runner.mock.invocationCallOrder[1]).toBeLessThan(m.times.mock.invocationCallOrder[0]);
});
it.each(['runnerDeclarationId','runnerStatementHash','runnerRegistryHash'])('rejects declaration drift in %s',async field=>{
 m.runner.mockResolvedValueOnce(declaration).mockResolvedValueOnce({...declaration,[field]:'changed'});
 await expect(evaluateLockedSkillAcceptanceReadiness(client,context,bundleId)).rejects.toThrow('Runner declaration changed');
 expect(m.times).not.toHaveBeenCalled();
});
it('rejects a declaration expiring or being disabled during preparation',async()=>{
 m.runner.mockResolvedValueOnce(declaration).mockRejectedValueOnce(new Error('Runner attestation time window invalid'));
 await expect(evaluateLockedSkillAcceptanceReadiness(client,context,bundleId)).rejects.toThrow('time window invalid');
});
const transports={transportReceiptsRequired:true,transportReceiptsRevalidated:true,transportAuditHash:'audit',transportRegistryHash:digest('registry'),transportSigningEnrollments:transportEnrollments,transportValidBefore:'2026-10-19T01:15:00.000Z'};
it('rechecks transports after policy and before the final declaration without granting activation',async()=>{
 m.transports.mockResolvedValue(transports);m.runner.mockResolvedValue(declaration);
 const out=await evaluateLockedSkillAcceptanceReadiness(client,context,bundleId);
 expect(out).toMatchObject({...transports,automaticActivation:false,collectorProvenanceVerified:false});expect(m.transports).toHaveBeenCalledTimes(2);
 expect(out).toMatchObject({signingEnrollmentCoverageRequired:true,signingEnrollmentCoverageRevalidated:true,signingEnrollmentCount:3});
 expect(m.transports.mock.invocationCallOrder[0]).toBeLessThan(m.policy.mock.invocationCallOrder[0]);
 expect(m.policy.mock.invocationCallOrder[0]).toBeLessThan(m.transports.mock.invocationCallOrder[1]);
 expect(m.transports.mock.invocationCallOrder[1]).toBeLessThan(m.runner.mock.invocationCallOrder[1]);
 expect(m.times).toHaveBeenCalledWith(client,context.userId,bundle.artifact,{
  runnerDeclarationValidBefore:declaration.runnerDeclarationValidBefore,transportValidBefore:transports.transportValidBefore});
});
it('rejects runner enrollment drift even if a mocked statement hash is unchanged',async()=>{
 m.transports.mockResolvedValue(transports);
 m.runner.mockResolvedValueOnce(declaration).mockResolvedValueOnce({...declaration,runnerSigningEnrollment:{...runnerEnrollment,deploymentHash:digest('changed')}});
 await expect(evaluateLockedSkillAcceptanceReadiness(client,context,bundleId)).rejects.toThrow('Runner declaration changed');
});
it('rejects transport enrollment drift even if a mocked audit hash is unchanged',async()=>{
 m.runner.mockResolvedValue(declaration);
 m.transports.mockResolvedValueOnce(transports).mockResolvedValueOnce({...transports,transportSigningEnrollments:[
  {...transportEnrollments[0],deploymentHash:digest('changed')},transportEnrollments[1]]});
 await expect(evaluateLockedSkillAcceptanceReadiness(client,context,bundleId)).rejects.toThrow('transport receipts changed');
});
it('rejects missing verified transport enrollments before returning readiness',async()=>{
 m.runner.mockResolvedValue(declaration);m.transports.mockResolvedValue({...transports,transportSigningEnrollments:undefined});
 await expect(evaluateLockedSkillAcceptanceReadiness(client,context,bundleId)).rejects.toThrow('Signing enrollment coverage unavailable');
});
it('rejects a changed final transport audit',async()=>{
 m.transports.mockResolvedValueOnce(transports).mockResolvedValueOnce({...transports,transportAuditHash:'changed'});
 await expect(evaluateLockedSkillAcceptanceReadiness(client,context,bundleId)).rejects.toThrow('receipts changed');
 expect(m.times).not.toHaveBeenCalled();
});
it('rejects mismatched transport and declaration trust snapshots',async()=>{
 m.transports.mockResolvedValue({...transports,transportRegistryHash:'other'});m.runner.mockResolvedValue(declaration);
 await expect(evaluateLockedSkillAcceptanceReadiness(client,context,bundleId)).rejects.toThrow('trust snapshots differ');
});
it('does not return readiness if a signature expires after both final signature audits',async()=>{
 m.transports.mockResolvedValue(transports);m.runner.mockResolvedValue(declaration);
 m.times.mockRejectedValue(new Error('Acceptance signed evidence expired after preparation'));
 await expect(evaluateLockedSkillAcceptanceReadiness(client,context,bundleId)).rejects.toThrow('signed evidence expired');
 expect(m.transports).toHaveBeenCalledTimes(2);expect(m.runner).toHaveBeenCalledTimes(2);
});
it('rejects attachment mount protection drifting from read-only to writable during preparation',async()=>{
 const value={attachmentBytesRevalidated:true,attachmentBytesCount:1,attachmentBytesManifestHash:'manifest'};
 m.bytes.mockResolvedValueOnce({...value,attachmentReadOnlyMountVerified:true}).mockResolvedValueOnce({...value,attachmentReadOnlyMountVerified:false});
 await expect(evaluateLockedSkillAcceptanceReadiness(client,context,bundleId)).rejects.toThrow('attachment mount protection changed');
 expect(m.times).not.toHaveBeenCalled();
});
it('rejects knowledge receipt mount protection drifting during preparation',async()=>{
 const value={knowledgeReceiptBytesRevalidated:true,knowledgeReceiptAssetCount:1,knowledgeReceiptDatabaseOnlyCount:0,knowledgeReceiptBytesManifestHash:'knowledge-manifest'};
 m.knowledgeBytes.mockResolvedValueOnce({...value,knowledgeReceiptReadOnlyMountVerified:true}).mockResolvedValueOnce({...value,knowledgeReceiptReadOnlyMountVerified:false});
 await expect(evaluateLockedSkillAcceptanceReadiness(client,context,bundleId)).rejects.toThrow('knowledge receipt sources changed');
 expect(m.times).not.toHaveBeenCalled();
});
it('rejects attachment snapshot coverage disappearing before final readiness',async()=>{
 const value={attachmentBytesRevalidated:true,attachmentBytesCount:1,attachmentBytesManifestHash:'manifest'};
 m.bytes.mockResolvedValueOnce({...value,attachmentImmutableSnapshotCount:1,attachmentImmutableSnapshotManifestHash:'snapshot'})
  .mockResolvedValueOnce({...value,attachmentImmutableSnapshotCount:0,attachmentImmutableSnapshotManifestHash:'empty'});
 await expect(evaluateLockedSkillAcceptanceReadiness(client,context,bundleId)).rejects.toThrow('attachment snapshots changed');
 expect(m.times).not.toHaveBeenCalled();
});
it('rejects knowledge snapshot identity changing before final readiness',async()=>{
 const value={knowledgeReceiptBytesRevalidated:true,knowledgeReceiptAssetCount:1,knowledgeReceiptDatabaseOnlyCount:0,knowledgeReceiptBytesManifestHash:'knowledge-manifest',knowledgeReceiptImmutableSnapshotCount:1};
 m.knowledgeBytes.mockResolvedValueOnce({...value,knowledgeReceiptImmutableSnapshotManifestHash:'first'})
  .mockResolvedValueOnce({...value,knowledgeReceiptImmutableSnapshotManifestHash:'second'});
 await expect(evaluateLockedSkillAcceptanceReadiness(client,context,bundleId)).rejects.toThrow('knowledge receipt snapshots changed');
 expect(m.times).not.toHaveBeenCalled();
});
it.each([0,1])('accepts stable complete knowledge snapshot fields with %i assets through final readiness',async count=>{
 m.knowledgeBytes.mockResolvedValue({knowledgeReceiptBytesRevalidated:true,knowledgeReceiptAssetCount:count,knowledgeReceiptDatabaseOnlyCount:0,
  knowledgeReceiptBytesManifestHash:'stable-assets',knowledgeReceiptReadOnlyMountVerified:count===0,
  knowledgeReceiptImmutableSnapshotCount:count,knowledgeReceiptImmutableSnapshotManifestHash:'stable-snapshots'});
 expect(await evaluateLockedSkillAcceptanceReadiness(client,context,bundleId)).toMatchObject({
  knowledgeReceiptImmutableSnapshotCount:count,knowledgeReceiptImmutableSnapshotManifestHash:'stable-snapshots',automaticActivation:false});
});
