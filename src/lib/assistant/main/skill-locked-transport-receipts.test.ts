import type {PoolClient} from 'pg';
import {beforeEach,expect,it,vi} from 'vitest';
import {digest} from './contracts';
import {revalidateLockedSkillTransportReceipts} from './skill-locked-transport-receipts';
const m=vi.hoisted(()=>({read:vi.fn(),lock:vi.fn(),task:vi.fn(),candidate:vi.fn(),registry:vi.fn(),query:vi.fn()}));
vi.mock('@/lib/rag/db',()=>({withBoundTenantTransaction:async(_client:unknown,_user:string,work:()=>Promise<unknown>)=>work()}));
vi.mock('./local-analysis-boundary',()=>({assertLocalAnalysisBoundary:()=>{}}));
vi.mock('./skill-acceptance-store',()=>({readLockedSkillAcceptanceEvidence:m.read}));
vi.mock('./skill-acceptance-run-locks',async original=>({...await original<typeof import('./skill-acceptance-run-locks')>(),lockSkillAcceptanceRunJournals:m.lock}));
vi.mock('./task-model-transport-journal',()=>({verifyOwnedTaskModelTransports:m.task}));
vi.mock('./skill-model-transport-journal',()=>({verifySkillCandidateJournalTransports:m.candidate}));
vi.mock('./skill-runner-attestation',()=>({loadConfiguredSkillRunnerTrustRegistry:m.registry}));
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const context={userId:id(1)},client={query:m.query} as unknown as PoolClient,bundleId=id(2),runId=id(3);
const now=new Date('2026-10-19T01:00:00.000Z'),expiresAt='2026-10-19T02:00:00.000Z',registry={keys:[]};
function evidence(){return {artifactHash:digest('artifact'),freezeStatus:{freezeId:id(4)},artifact:{sourceKind:'production-runner-pending-verification',
 plan:{expiresAt,cases:[{id:'replay',provenance:'historical-task'},{id:'shadow',provenance:'prospective-task'},
  ...['negative','injection','permissions'].map(id=>({id,provenance:'safety-fixture'}))]},rawReceipts:{
 baselineSources:{replay:{runId}},candidateSources:{replay:{runId,evaluationId:id(5)}},
 prospectiveSources:{shadow:{runId:id(6),evaluationId:id(7)}},
 safetySources:Object.fromEntries(['negative','injection','permissions'].map((name,i)=>[name,{runId,evaluationId:id(i+8)}]))}}};}
beforeEach(()=>{vi.resetAllMocks();m.read.mockResolvedValue(evidence());m.registry.mockResolvedValue(registry);
 m.query.mockResolvedValue({rows:[{checked_at:now}]});
 const audit={registryHash:digest(registry),journalHash:digest('PRIVATE journal'),transportReceiptHashes:[digest('PRIVATE receipt')],transportValidBefore:expiresAt};
 const task={keyId:'task-key',collectorId:'task',deploymentHash:digest('task'),purpose:'task-model-transport'};
 m.task.mockResolvedValue({...audit,signingEnrollments:[task],signingEnrollmentWindows:[{...task,requiredFrom:now.toISOString(),requiredThrough:now.toISOString()}]});
 const candidate={keyId:'eval-key',collectorId:'eval',deploymentHash:digest('eval'),purpose:'model-transport'};
 m.candidate.mockResolvedValue({...audit,signingEnrollments:[candidate],signingEnrollmentWindows:[{...candidate,requiredFrom:now.toISOString(),requiredThrough:now.toISOString()}]});
});
it('audits two original tasks and all eight case arms using one DB time, returning hashes only',async()=>{
 const out=await revalidateLockedSkillTransportReceipts(client,context,bundleId);
 expect(out).toMatchObject({transportReceiptsRequired:true,transportReceiptsRevalidated:true,transportOriginalTaskCount:2,transportEvaluationArmCount:8,transportReceiptCount:10});
 expect(out.transportSigningEnrollments).toHaveLength(2);
 expect(m.task).toHaveBeenCalledTimes(2);expect(m.candidate).toHaveBeenCalledTimes(8);
 expect(m.task).toHaveBeenCalledWith(context,{runId},now);expect(m.task).toHaveBeenCalledWith(context,{runId:id(6)},now);
 for(const evaluationId of [id(8),id(9),id(10)])for(const arm of ['baseline','candidate'])
  expect(m.candidate).toHaveBeenCalledWith(context,{evaluationId,arm},{freezeId:id(4),plan:evidence().artifact.plan},now);
 expect(m.lock.mock.invocationCallOrder[0]).toBeLessThan(m.task.mock.invocationCallOrder[0]);
 expect(JSON.stringify(out)).not.toContain('PRIVATE');expect(JSON.stringify(out)).not.toContain(runId);
 expect(m.query).toHaveBeenCalledTimes(2);
});
it('does not promote synthetic evidence or require any registry or task transport',async()=>{
 m.read.mockResolvedValue({artifact:{sourceKind:'synthetic-fixture'}});
 expect(await revalidateLockedSkillTransportReceipts(client,context,bundleId)).toEqual({transportReceiptsRequired:false,transportReceiptsRevalidated:false});
 expect(m.registry).not.toHaveBeenCalled();expect(m.lock).not.toHaveBeenCalled();expect(m.task).not.toHaveBeenCalled();
});
it('rejects missing evaluation references before auditing a convenient subset',async()=>{
 const saved=evidence();delete (saved.artifact.rawReceipts.safetySources.negative as {evaluationId?:string}).evaluationId;m.read.mockResolvedValue(saved);
 await expect(revalidateLockedSkillTransportReceipts(client,context,bundleId)).rejects.toThrow();expect(m.task).not.toHaveBeenCalled();
});
it.each(['registry','artifact','task','candidate','expiry','invalid-clock'])('rejects %s changing during the audit',async kind=>{
 if(kind==='registry')m.registry.mockResolvedValueOnce(registry).mockResolvedValueOnce({keys:['changed']});
 if(kind==='artifact')m.read.mockResolvedValueOnce(evidence()).mockResolvedValueOnce({...evidence(),artifactHash:'changed'});
 if(kind==='task')m.task.mockRejectedValue(new Error('Task failure signature invalid'));
 if(kind==='candidate')m.candidate.mockRejectedValue(new Error('Transport trust key unavailable'));
 if(kind==='expiry')m.query.mockResolvedValueOnce({rows:[{checked_at:now}]}).mockResolvedValueOnce({rows:[{checked_at:new Date(expiresAt)}]});
 if(kind==='invalid-clock')m.query.mockResolvedValue({rows:[{checked_at:'application clock'}]});
 await expect(revalidateLockedSkillTransportReceipts(client,context,bundleId)).rejects.toThrow();
});
it('requires all audits to use the same configured registry',async()=>{
 m.candidate.mockResolvedValue({registryHash:'different',journalHash:'hash',transportReceiptHashes:['hash'],transportValidBefore:expiresAt});
 await expect(revalidateLockedSkillTransportReceipts(client,context,bundleId)).rejects.toThrow('trust or coverage changed');
});
