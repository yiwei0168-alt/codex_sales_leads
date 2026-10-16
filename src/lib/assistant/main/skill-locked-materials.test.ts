import type {PoolClient} from 'pg';
import {beforeEach,expect,it,vi} from 'vitest';
import {digest} from './contracts';
import {revalidateLockedSkillAcceptanceMaterials,evaluateLockedSkillAcceptanceReadiness} from './skill-locked-materials';
const m=vi.hoisted(()=>({read:vi.fn(),material:vi.fn(),policy:vi.fn(),lock:vi.fn()}));
vi.mock('./skill-acceptance-run-locks',()=>({lockSkillAcceptanceRunJournals:m.lock}));
vi.mock('@/lib/rag/db',()=>({withBoundTenantTransaction:async(_client:unknown,_user:string,work:()=>Promise<unknown>)=>work()}));
vi.mock('./skill-acceptance-store',()=>({readLockedSkillAcceptanceEvidence:m.read}));
vi.mock('./skill-acceptance-review',()=>({readSkillAcceptanceReviewCase:m.material}));
vi.mock('./local-analysis-boundary',()=>({assertLocalAnalysisBoundary:()=>{}}));
vi.mock('./skill-locked-acceptance-policy',()=>({evaluateLockedSkillAcceptancePolicy:m.policy}));
const context={userId:'owner'},client={} as PoolClient,bundleId='bundle';
const observation={caseId:'replay',baseline:{answerHash:digest('PRIVATE baseline')},candidate:{answerHash:digest('PRIVATE candidate')}};
const bundle={artifactHash:digest('artifact'),latestReviewHash:digest('reviews'),currentPin:{version:1},freezeStatus:{freezeId:'freeze'},
 artifact:{sourceKind:'synthetic-fixture',plan:{cases:[{id:'replay'}]},observations:[observation]}};
const material=()=>({bundleId,caseId:'replay',artifactHash:bundle.artifactHash,observationHash:digest(observation),sourceKind:'synthetic-fixture',
 freezeStatus:{state:'active',freezeId:'freeze'},canPass:{baseline:true,candidate:true},baseline:'PRIVATE baseline',candidate:'PRIVATE candidate',receipts:['PRIVATE receipt']});
beforeEach(()=>{vi.resetAllMocks();m.read.mockResolvedValue(bundle);m.material.mockResolvedValue(material());
 m.lock.mockResolvedValue({attachmentMetadataLocked:true,attachmentCount:0,taskOriginsLocked:true,taskJournalsLocked:true,runCount:1});
 m.policy.mockResolvedValue({artifactHash:bundle.artifactHash,latestReviewHash:bundle.latestReviewHash,policyPassed:false,automaticActivation:false});});
it('rebuilds planned material and returns hashes without private answers or receipts',async()=>{
 const out=await revalidateLockedSkillAcceptanceMaterials(client,context,bundleId);
 expect(out).toMatchObject({sourcePayloadsRevalidated:true,sourceRevocationsLocked:false,automaticActivation:false});
 expect(m.material).toHaveBeenCalledExactlyOnceWith(context,{bundleId,caseId:'replay'});expect(m.read).toHaveBeenCalledTimes(2);
 expect(JSON.stringify(out)).not.toContain('PRIVATE');expect(out.materials).toHaveLength(1);
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
it('combines material reconstruction and policy while keeping activation and source-lock gates closed',async()=>{
 const out=await evaluateLockedSkillAcceptanceReadiness(client,context,bundleId);
 expect(out).toMatchObject({sourcePayloadsRevalidated:true,policyPassed:false,sourceRevocationsLocked:false,collectorProvenanceVerified:false,automaticActivation:false});
 expect(JSON.stringify(out)).not.toContain('PRIVATE');expect(m.policy).toHaveBeenCalledExactlyOnceWith(client,context,bundleId);
});
it('rejects different material and policy snapshots',async()=>{
 m.policy.mockResolvedValue({artifactHash:'changed',latestReviewHash:bundle.latestReviewHash});
 await expect(evaluateLockedSkillAcceptanceReadiness(client,context,bundleId)).rejects.toThrow('snapshots differ');
});
