import {expect,it,vi} from 'vitest';
import type {PoolClient} from 'pg';
import {prepareSkillSourceProtection} from './skill-source-protection';
vi.mock('@/lib/rag/db',()=>({withBoundTenantTransaction:async(_client:unknown,_user:string,run:()=>Promise<unknown>)=>run()}));
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const hash='a'.repeat(64);
const flags=Object.fromEntries(['trustRegistryLocked','taskOriginsLocked','taskJournalsLocked','knowledgeSourcesLocked','decisionMemorySourcesLocked',
 'skillCatalogSourcesLocked','pinnedMethodSourcesLocked','prospectiveCaptureSourcesLocked','timelineSourcesLocked','mailReadSourcesLocked','attachmentMetadataLocked',
 'sourcePayloadsRevalidated','decisionMemorySnapshotRevalidated','memoryReceiptSourcesRevalidated','privateReceiptSourcesRevalidated','memoryTimeFenceRevalidated',
 'canonicalOriginalCoverageRequired','canonicalOriginalCoverageRevalidated','activationSourcesRevalidated','acceptanceLedgerRevalidated','methodExperienceTimesRevalidated'].map(key=>[key,true]));
const input={...flags,ownerId:id(1),bundleId:id(2),freezeId:id(3),artifactHash:hash,latestReviewHash:hash,
 sourceKind:'production-runner-pending-verification',currentRuntimeIdentityHash:hash,frozenRuntimeIdentityHash:hash,
 runCount:2,canonicalOriginalCoverageHash:hash,acceptanceLedgerHash:hash,
 acceptanceTimeCheckedAt:'2026-10-20T00:00:00.000Z',acceptanceValidBefore:'2026-10-20T01:00:00.000Z'};
function database(available=true,ready=true,transaction_id:unknown='42'){
 const query=vi.fn().mockResolvedValueOnce({rows:[{available}]}).mockResolvedValue({rows:[{ready,transaction_id}]});
 return {query,client:{query} as unknown as PoolClient};
}
it('binds preparation to the current transaction without claiming sealing or quality',async()=>{
 const {client,query}=database(),out=await prepareSkillSourceProtection(client,input);
 expect(out).toMatchObject({sourceRevocationGuardsReady:true,sourceRevocationsLocked:false,sourceProtectionTransactionId:'42'});
 expect(out).toHaveProperty('sourceProtectionHash',expect.stringMatching(/^[a-f0-9]{64}$/));
 expect(out).not.toHaveProperty('automaticActivation');expect(out).not.toHaveProperty('policyPassed');
 expect(query).toHaveBeenLastCalledWith(expect.stringContaining('skill_activation_sources_ready'),[input.bundleId,input.freezeId,input.artifactHash]);
 expect(await prepareSkillSourceProtection(database().client,{...input,body:'private discarded'})).toEqual(out);
});
it.each(['taskJournalsLocked','pinnedMethodSourcesLocked','privateReceiptSourcesRevalidated','canonicalOriginalCoverageRevalidated','memoryTimeFenceRevalidated','acceptanceLedgerRevalidated'])('blocks incomplete %s before querying',async field=>{
 const {client,query}=database();
 expect(await prepareSkillSourceProtection(client,{...input,[field]:false})).toMatchObject({sourceRevocationGuardsReady:false,sourceRevocationsLocked:false});expect(query).not.toHaveBeenCalled();
});
it('rejects synthetic sources and runtime identity or time changes',async()=>{
 const {client,query}=database();
 expect(await prepareSkillSourceProtection(client,{...input,sourceKind:'synthetic-fixture'})).toMatchObject({sourceRevocationGuardsReady:false});
 expect(await prepareSkillSourceProtection(client,{...input,currentRuntimeIdentityHash:'b'.repeat(64)})).toMatchObject({sourceProtectionBlockers:['source-runtime-identity-changed']});
 expect(await prepareSkillSourceProtection(client,{...input,acceptanceValidBefore:input.acceptanceTimeCheckedAt})).toMatchObject({sourceProtectionBlockers:['source-time-window-invalid']});
 expect(query).not.toHaveBeenCalled();
});
it('requires the installed database protection function and actual retained gates',async()=>{
 expect(await prepareSkillSourceProtection(database(false).client,input)).toMatchObject({sourceProtectionBlockers:['source-protection-schema-unavailable']});
 expect(await prepareSkillSourceProtection(database(true,false).client,input)).toMatchObject({sourceProtectionBlockers:['source-guards-or-retained-locks-unavailable']});
});
it.each([null,42,'0','bad'])('rejects malformed database transaction identity %s',async value=>{
 expect(await prepareSkillSourceProtection(database(true,true,value).client,input)).toMatchObject({sourceRevocationGuardsReady:false,sourceRevocationsLocked:false});
});
