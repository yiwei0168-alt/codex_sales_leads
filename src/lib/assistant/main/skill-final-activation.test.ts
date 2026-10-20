import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({query:vi.fn(),registry:vi.fn(),evidence:vi.fn(),readiness:vi.fn(),admit:vi.fn(),memory:vi.fn(),mode:vi.fn(),
 state:{enabled:false,output:null as unknown,audit:[] as unknown[]},commits:0,rollbacks:0,latestCalls:0,newBundle:false,
 live:true,liveAtWrite:true,postValid:true,eventFails:false,writeCount:1}));
vi.mock('@/lib/rag/db',()=>({tenantQuery:vi.fn(),tenantTransaction:async(_user:string,work:(client:unknown)=>Promise<unknown>)=>{
 const before=structuredClone(m.state);try{const value=await work({query:m.query});m.commits++;return value;}
 catch(error){m.state=before;m.rollbacks++;throw error;}
},withBoundTenantTransaction:async(_client:unknown,_user:string,work:()=>Promise<unknown>)=>work()}));
vi.mock('./skill-catalog-admission',()=>({admitSkillCatalogWrite:m.admit}));
vi.mock('./skill-runner-attestation',()=>({configuredSkillRunnerTrustRegistryMode:m.mode}));
vi.mock('./skill-runner-trust-registry-store',()=>({readLockedSkillRunnerTrustRegistry:m.registry}));
vi.mock('./skill-acceptance-store',()=>({readLockedSkillAcceptanceEvidence:m.evidence}));
vi.mock('./skill-locked-materials',()=>({evaluateLockedSkillAcceptanceReadiness:m.readiness}));
vi.mock('./memory-message-guard',()=>({withCurrentDecisionMemory:m.memory}));
import {activateAgentSkill} from './skill-final-activation';
import {digest,result} from './contracts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor={userId:id(1),role:'member' as const,runId:id(2),leaseToken:id(3),callId:id(4),instructionIds:[]};
const action={id:id(5),version:1,operation:'enable' as const},bundle={id:id(6),artifact_hash:digest('artifact'),source_kind:'production-runner-pending-verification'};
const selection={scope:'account',files:{'SKILL.md':'Read original evidence'},dependencies:[],validation:{scripts:'none',dependencies:'none'}};
// This is a mock of the future fully qualified producer. No real collector or
// human judgment is inserted and no genuine production eligibility is asserted.
const qualified=()=>Object.fromEntries([
 ...['policyPassed','trustRegistryLocked','sourceRevocationsLocked','collectorProvenanceVerified','productionAgentEquivalent','canonicalOriginalCoverageRequired','canonicalOriginalCoverageRevalidated',
 'runnerDeclarationRequired','runnerDeclarationRevalidated','transportReceiptsRequired','transportReceiptsRevalidated','signingEnrollmentCoverageRequired','signingEnrollmentCoverageRevalidated',
 'runtimePackagesRequired','runtimePackagesRegistered','runtimePackageBytesPairRevalidated','runtimeModuleFormatPairRevalidated','methodExperienceTimesRevalidated',
 'decisionMemorySnapshotRevalidated','activationSourcesRevalidated','memoryReceiptSourcesRevalidated','memoryTimeFenceRevalidated','privateReceiptSourcesRevalidated','lockedEvidencePolicyEvaluated','sourcePayloadsRevalidated',
 'knowledgeSourcesLocked','decisionMemorySourcesLocked','skillCatalogSourcesLocked','pinnedMethodSourcesLocked','taskOriginsLocked','taskJournalsLocked',
 'prospectiveCaptureSourcesLocked','timelineSourcesLocked','mailReadSourcesLocked','attachmentMetadataLocked'].map(key=>[key,true]),
 ...['artifactHash','latestReviewHash','materialsHash','currentRuntimeIdentityHash','trustRegistryHash','runtimePackageRegistrationHash','acceptanceLedgerHash'].map(key=>[key,digest(key)]),
 ['acceptanceLedgerRevalidated',true],
 ['artifactHash',bundle.artifact_hash],['blockers',[]],['acceptanceTimeCheckedAt','2026-10-20T00:00:00.000Z'],['acceptanceValidBefore','2026-10-20T01:00:00.000Z'],
 ['runtimePackageRevisions',['1','2','3']],
 ['activationSources',[{runId:id(8),sourceHash:digest('source'),chainHash:digest('chain'),initialSourceHash:digest('initial'),attachmentHash:digest('attachments'),knowledgeHash:digest('knowledge'),pinnedMethodsHash:digest('pins'),validBefore:null}]],
]);
beforeEach(()=>{
 vi.resetAllMocks();m.state={enabled:false,output:null,audit:[]};m.commits=0;m.rollbacks=0;m.latestCalls=0;m.newBundle=false;
 m.live=true;m.liveAtWrite=true;m.postValid=true;m.eventFails=false;m.writeCount=1;
 m.mode.mockReturnValue('database');m.registry.mockResolvedValue({registryHash:digest('trustRegistryHash')});
 m.evidence.mockResolvedValue({artifactHash:bundle.artifact_hash,latestReviewHash:digest('latestReviewHash'),currentPin:{ownerId:actor.userId,skillId:action.id,version:1},freezeStatus:{freezeId:id(7)},judgments:[],
  artifact:{plan:{cases:[{id:'source',provenance:'historical-task'}]},rawReceipts:{baselineSources:{source:{runId:id(8)}},candidateSources:{source:{runId:id(8)}}}}});
 m.readiness.mockResolvedValue(qualified());m.memory.mockImplementation(async(_user:string,work:()=>Promise<unknown>)=>work());
 m.query.mockImplementation(async(sql:string,params:unknown[])=>{
  if(sql.startsWith('select v.validation'))return {rows:[selection],rowCount:1};
  if(sql.startsWith('select r.instructions'))return {rows:[{instructions:[],live:sql.includes('nowait')?m.liveAtWrite:m.live}]};
  if(sql.startsWith('select status,input'))return {rows:[{status:m.state.output?'completed':'started',input:action,input_hash:digest(action),output:m.state.output}]};
  if(sql.startsWith('select lock_skill'))return {rows:[]};
  if(sql.startsWith('select exists(select 1 from pg_trigger'))return {rows:[{ready:true}]};
  if(sql.startsWith('set constraints'))return {rows:[]};
  if(sql.startsWith('select id,artifact_hash')){m.latestCalls++;return {rows:[m.newBundle&&m.latestCalls>1?{...bundle,id:id(9)}:bundle]};}
  if(sql.startsWith('with changed')){if(m.writeCount===1){m.state.enabled=true;m.state.output=JSON.parse(String(params[7]));}return {rows:[{n:m.writeCount}]};}
  if(sql.startsWith('insert into agent_run_event')){if(m.eventFails)throw new Error('Audit unavailable');m.state.audit.push(JSON.parse(String(params[2])));return {rowCount:1};}
  if(sql.startsWith('select clock_timestamp()'))return {rows:[{valid:m.postValid}]};
  throw new Error('Unexpected activation query');
 });
});
it('uses registry -> catalog admission -> bundle/Skill evidence order and atomically saves effect, receipt and audit',async()=>{
 const data=await activateAgentSkill(actor,action);
 expect(data).toMatchObject({updated:true,acceptanceBundleId:bundle.id,acceptanceArtifactHash:bundle.artifact_hash});
 expect(m.state.enabled).toBe(true);expect(m.state.output).toEqual(result(data,{cost:'known',callId:actor.callId}));expect(m.state.audit).toHaveLength(1);
 expect(m.registry.mock.invocationCallOrder[0]).toBeLessThan(m.admit.mock.invocationCallOrder[0]);
 expect(m.admit.mock.invocationCallOrder[0]).toBeLessThan(m.evidence.mock.invocationCallOrder[0]);
 expect(m.query.mock.calls.filter(([sql])=>sql.startsWith('select v.validation')).every(([sql])=>!sql.includes('for update'))).toBe(true);
 const [sql,params]=m.query.mock.calls.find(([sql])=>sql.startsWith('with changed'))!;
 expect(sql).toContain('clock_timestamp()<$4');expect(sql).toContain('r.lease_until>clock_timestamp()');expect(params[8]).toBe(actor.leaseToken);
 expect(JSON.parse(params[9])).toMatchObject({freezeId:id(7),reviewVersions:[],runtimePackageRevisions:['1','2','3'],callId:actor.callId});
 expect(m.commits).toBe(1);expect(m.rollbacks).toBe(0);
});
it.each(['sourceRevocationsLocked','acceptanceLedgerRevalidated','activationSourcesRevalidated','collectorProvenanceVerified','productionAgentEquivalent','runtimePackagesRegistered','runtimePackageBytesPairRevalidated','runtimeModuleFormatPairRevalidated','canonicalOriginalCoverageRevalidated','policyPassed'])('refuses incomplete %s without any effect',async key=>{
 m.readiness.mockResolvedValue({...qualified(),[key]:false});
 await expect(activateAgentSkill(actor,action)).rejects.toThrow('trusted production evidence gate unavailable');
 expect(m.state).toEqual({enabled:false,output:null,audit:[]});expect(m.query.mock.calls.some(([sql])=>sql.startsWith('with changed'))).toBe(false);
});
it('rejects an incomplete source manifest or a proof extending beyond a dependency deadline',async()=>{
 const proof=qualified(),sources=proof.activationSources as Array<{runId:string;validBefore:string|null}>;
 m.readiness.mockResolvedValue({...proof,activationSources:sources.map(row=>({...row,runId:id(9)}))});
 await expect(activateAgentSkill(actor,action)).rejects.toThrow('gate unavailable');
 m.readiness.mockResolvedValue({...proof,activationSources:sources.map(row=>({...row,validBefore:'2026-10-20T00:30:00.000Z'}))});
 await expect(activateAgentSkill(actor,action)).rejects.toThrow('gate unavailable');expect(m.state.enabled).toBe(false);
});
it('does not fall back to an older bundle if selection changes while acquiring the Skill lock',async()=>{
 m.newBundle=true;await expect(activateAgentSkill(actor,action)).rejects.toThrow('gate unavailable');expect(m.readiness).not.toHaveBeenCalled();
});
it.each(['lease','evidence-expiry','audit','memory'])('rolls back the entire transaction on %s failure',async kind=>{
 if(kind==='lease')m.liveAtWrite=false;if(kind==='evidence-expiry')m.postValid=false;if(kind==='audit')m.eventFails=true;
 if(kind==='memory')m.memory.mockImplementation(async(_user:string,work:()=>Promise<unknown>)=>{await work();throw new Error('Memory expired');});
 await expect(activateAgentSkill(actor,action)).rejects.toThrow();
 expect(m.state).toEqual({enabled:false,output:null,audit:[]});expect(m.rollbacks).toBe(1);
});
it('reconciles a committed receipt without re-enabling a subsequently disabled Skill or recalculating eligibility',async()=>{
 const first=await activateAgentSkill(actor,action);m.state.enabled=false;m.readiness.mockClear();m.admit.mockClear();m.mode.mockReturnValue('file');m.live=false;
 expect(await activateAgentSkill(actor,action)).toEqual(first);expect(m.state.enabled).toBe(false);expect(m.state.audit).toHaveLength(1);
 expect(m.readiness).not.toHaveBeenCalled();expect(m.admit).not.toHaveBeenCalled();
});
it('rejects a changed call input instead of reusing another action receipt',async()=>{
 await activateAgentSkill(actor,action);
 await expect(activateAgentSkill(actor,{...action,version:2})).rejects.toThrow('gate unavailable');expect(m.state.audit).toHaveLength(1);
});
it('refuses caller-supplied proof/bundle fields and unbound task contexts',async()=>{
 await expect(activateAgentSkill(actor,{...action,bundleId:bundle.id} as typeof action)).rejects.toThrow();
 await expect(activateAgentSkill({userId:actor.userId,role:'member'},action)).rejects.toThrow('gate unavailable');
});
