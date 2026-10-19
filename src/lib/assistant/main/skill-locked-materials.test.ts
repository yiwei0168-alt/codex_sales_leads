import type {PoolClient} from 'pg';
import {beforeEach,expect,it,vi} from 'vitest';
import {digest} from './contracts';
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
 expect(out.methodExperienceTimesRevalidated).toBe(true);
 expect(m.policy.mock.invocationCallOrder[0]).toBeLessThan(m.times.mock.invocationCallOrder[0]);
 expect(m.query).toHaveBeenCalledExactlyOnceWith('select lock_skill_knowledge_sources()');
 expect(m.query.mock.invocationCallOrder[0]).toBeLessThan(m.memoryBoundary.mock.invocationCallOrder[0]);
 expect(JSON.stringify(out)).not.toContain('PRIVATE');expect(m.policy).toHaveBeenCalledExactlyOnceWith(client,context,bundleId);
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
const declaration={runnerDeclarationRequired:true,runnerDeclarationRevalidated:true,runnerDeclarationId:'declaration',runnerStatementHash:'statement',runnerRegistryHash:'registry',runnerDeclarationCheckedAt:'2026-10-19T01:00:00.000Z'};
it('rechecks the signed declaration after preparation without qualifying production provenance',async()=>{
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
const transports={transportReceiptsRequired:true,transportReceiptsRevalidated:true,transportAuditHash:'audit',transportRegistryHash:'registry'};
it('rechecks transports after policy and before the final declaration without granting activation',async()=>{
 m.transports.mockResolvedValue(transports);m.runner.mockResolvedValue(declaration);
 const out=await evaluateLockedSkillAcceptanceReadiness(client,context,bundleId);
 expect(out).toMatchObject({...transports,automaticActivation:false,collectorProvenanceVerified:false});expect(m.transports).toHaveBeenCalledTimes(2);
 expect(m.transports.mock.invocationCallOrder[0]).toBeLessThan(m.policy.mock.invocationCallOrder[0]);
 expect(m.policy.mock.invocationCallOrder[0]).toBeLessThan(m.transports.mock.invocationCallOrder[1]);
 expect(m.transports.mock.invocationCallOrder[1]).toBeLessThan(m.runner.mock.invocationCallOrder[1]);
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
