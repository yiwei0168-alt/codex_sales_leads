import {expect,it} from 'vitest';
import {digest} from './contracts';
import {qualifySkillProductionExecution,SKILL_PRODUCTION_EXECUTION_SCOPE} from './skill-production-execution';

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
/** Hypothetically complete retained-reader data only. No human review, provider
 * statement or actual production eligibility is created by these unit fixtures. */
function fixture(){
 const identity={runtimeHash:digest('runtime'),promptHash:digest('prompt'),toolSchemaHash:digest('tools'),modelConfigHash:digest('model'),scopeHash:digest('scope')};
 const plan={protocol:'skill-acceptance-plan-v1',pin:{ownerId:id(1),skillId:id(4),version:1,contentHash:digest('content'),sourceHash:digest('source')},
  frozenAt:'2026-10-21T00:00:00.000Z',expiresAt:'2026-10-21T02:00:00.000Z',identity,
  cases:[['replay','historical-task'],['shadow','prospective-task'],['negative','safety-fixture'],['injection','safety-fixture'],['permissions','safety-fixture']]
   .map(([category,provenance])=>({id:category,category,provenance,inputHash:digest(category+'input'),sourceHash:digest(category+'source')}))};
 const artifactHash=digest('artifact'),reviewHash=digest('review');
 return {ownerId:id(1),bundleId:id(2),freezeId:id(3),artifactHash,sourceKind:'production-runner-pending-verification',plan,originalTaskCount:2,
  policy:{policyPassed:true,blockers:[],lockedEvidencePolicyEvaluated:true,artifactHash,latestReviewHash:reviewHash,planHash:digest(plan),currentRuntimeIdentityHash:digest(identity)},
  materials:{sourcePayloadsRevalidated:true,artifactHash,latestReviewHash:reviewHash,materialsHash:digest('materials'),taskOriginsLocked:true,taskJournalsLocked:true,runCount:2},
  collector:{collectorProvenanceVerified:true,collectorProvenanceHash:digest('collector')},
  transports:{transportReceiptsRequired:true,transportReceiptsRevalidated:true,transportAuditHash:digest('transports'),transportOriginalTaskCount:2,
   transportEvaluationArmCount:8,transportReceiptCount:22,transportOriginalReceiptCount:6,transportEvaluationReceiptCount:16,
   runtimeProcessCoverageComplete:true,runtimeProcessMissingClaimCount:0,runtimeProcessCoverageHash:digest('coverage')},
  packages:{runtimePackagesRegistered:true,runtimePackageBytesPairRevalidated:true,runtimeModuleFormatPairRevalidated:true,
   runtimePackageRegistrationHash:digest('registration'),runtimeProcessPackagesRevalidated:true,runtimeProcessBoundReceiptCount:22,runtimeProcessPackageBindingHash:digest('binding')},
  ledger:{acceptanceLedgerRevalidated:true,acceptanceLedgerHash:digest('ledger'),acceptanceLedgerRuntimeTaskCount:8,acceptanceLedgerAttemptCount:16,
   acceptanceLedgerRuntimeLiveReadTaskCount:1,acceptanceLedgerRuntimeLiveReadSourcesRevalidated:true,
   acceptanceLedgerRuntimeExecutionPoliciesRevalidated:true,acceptanceLedgerRuntimeExecutionPolicyCount:8,acceptanceLedgerRuntimeExecutionPolicyManifestHash:digest('limits')},
  times:{methodExperienceTimesRevalidated:true,acceptanceTimeCheckedAt:'2026-10-21T01:00:00.000Z',acceptanceValidBefore:'2026-10-21T02:00:00.000Z'},
  sources:{sourceRevocationGuardsReady:true,sourceProtectionHash:digest('sources'),sourceProtectionTransactionId:'42'}};
}
it('derives a scoped execution verdict only from complete retained components and the passed review policy',()=>{
 const out=qualifySkillProductionExecution(fixture());
 expect(out).toMatchObject({productionAgentEquivalent:true,productionExecutionScope:SKILL_PRODUCTION_EXECUTION_SCOPE,ordinaryLifecycleEquivalent:false,productionExecutionBlockers:[]});
 expect(out).toHaveProperty('productionExecutionProofHash',expect.stringMatching(/^[a-f0-9]{64}$/));
 expect(out).not.toHaveProperty('automaticActivation');
});
it.each(['policy','collector','materials','coverage','packages','limits','live','source','identity','review','artifact','synthetic','expiry'])('rejects incomplete or changed %s proof',kind=>{
 const f=fixture();
 if(kind==='policy')f.policy.policyPassed=false;if(kind==='collector')f.collector.collectorProvenanceVerified=false;
 if(kind==='materials')f.materials.sourcePayloadsRevalidated=false;if(kind==='coverage')f.transports.runtimeProcessMissingClaimCount=1;
 if(kind==='packages')f.packages.runtimeProcessPackagesRevalidated=false;if(kind==='limits')f.ledger.acceptanceLedgerRuntimeExecutionPoliciesRevalidated=false;
 if(kind==='live')f.ledger.acceptanceLedgerRuntimeLiveReadSourcesRevalidated=false;if(kind==='source')f.sources.sourceRevocationGuardsReady=false;
 if(kind==='identity')f.policy.currentRuntimeIdentityHash=digest('other');if(kind==='review')f.materials.latestReviewHash=digest('other');
 if(kind==='artifact')f.materials.artifactHash=digest('other');if(kind==='synthetic')f.sourceKind='synthetic-fixture';
 if(kind==='expiry')f.times.acceptanceTimeCheckedAt=f.times.acceptanceValidBefore;
 expect(qualifySkillProductionExecution(f).productionAgentEquivalent).toBe(false);
});
it.each(['tasks','task-policies','live-tasks','originals','receipt-binding','extra-frozen-attempt','missing-fallback-count'])('rejects %s coverage gaps',kind=>{
 const f=fixture();
 if(kind==='tasks')f.ledger.acceptanceLedgerRuntimeTaskCount=7;if(kind==='task-policies')f.ledger.acceptanceLedgerRuntimeExecutionPolicyCount=7;
 if(kind==='live-tasks')f.ledger.acceptanceLedgerRuntimeLiveReadTaskCount=2;if(kind==='originals')f.transports.transportOriginalTaskCount=1;
 if(kind==='receipt-binding')f.packages.runtimeProcessBoundReceiptCount=21;if(kind==='extra-frozen-attempt')f.ledger.acceptanceLedgerAttemptCount=17;
 if(kind==='missing-fallback-count')f.transports.transportEvaluationReceiptCount=15;
 expect(qualifySkillProductionExecution(f)).toMatchObject({productionAgentEquivalent:false,productionExecutionBlockers:['production-execution-coverage-incomplete']});
});
it('binds the actual declared-policy manifest, latest review and retained registration to the verdict hash',()=>{
 const f=fixture(),before=qualifySkillProductionExecution(f);
 f.ledger.acceptanceLedgerRuntimeExecutionPolicyManifestHash=digest('changed limits');
 const changed=qualifySkillProductionExecution(f);
 if(!before.productionAgentEquivalent||!changed.productionAgentEquivalent)throw new Error('Expected hypothetical complete proof');
 expect(changed.productionExecutionProofHash).not.toBe(before.productionExecutionProofHash);
});
