import {z} from 'zod';
import {digest} from './contracts';
import {skillAcceptancePlanSchema} from './skill-acceptance-policy';

export const SKILL_PRODUCTION_EXECUTION_SCOPE='completed-owned-frozen-read-trials-v1' as const;
const sha=z.string().regex(/^[a-f0-9]{64}$/),count=z.number().int().positive();
const proofSchema=z.object({ownerId:z.uuid(),bundleId:z.uuid(),freezeId:z.uuid(),artifactHash:sha,
 sourceKind:z.literal('production-runner-pending-verification'),plan:skillAcceptancePlanSchema,originalTaskCount:count,
 policy:z.object({policyPassed:z.literal(true),blockers:z.array(z.string()).max(0),lockedEvidencePolicyEvaluated:z.literal(true),
  artifactHash:sha,latestReviewHash:sha,planHash:sha,currentRuntimeIdentityHash:sha}),
 materials:z.object({sourcePayloadsRevalidated:z.literal(true),artifactHash:sha,latestReviewHash:sha,materialsHash:sha,
  taskOriginsLocked:z.literal(true),taskJournalsLocked:z.literal(true),runCount:count}),
 collector:z.object({collectorProvenanceVerified:z.literal(true),collectorProvenanceHash:sha}),
 transports:z.object({transportReceiptsRequired:z.literal(true),transportReceiptsRevalidated:z.literal(true),transportAuditHash:sha,
  transportOriginalTaskCount:count,transportEvaluationArmCount:count,transportReceiptCount:count,
  transportOriginalReceiptCount:count,transportEvaluationReceiptCount:count,
  runtimeProcessCoverageComplete:z.literal(true),runtimeProcessMissingClaimCount:z.literal(0),runtimeProcessCoverageHash:sha}),
 packages:z.object({runtimePackagesRegistered:z.literal(true),runtimePackageBytesPairRevalidated:z.literal(true),runtimeModuleFormatPairRevalidated:z.literal(true),
  runtimePackageRegistrationHash:sha,runtimeProcessPackagesRevalidated:z.literal(true),runtimeProcessBoundReceiptCount:count,runtimeProcessPackageBindingHash:sha}),
 ledger:z.object({acceptanceLedgerRevalidated:z.literal(true),acceptanceLedgerHash:sha,acceptanceLedgerRuntimeTaskCount:count,
  acceptanceLedgerAttemptCount:count,
  acceptanceLedgerRuntimeLiveReadTaskCount:count,acceptanceLedgerRuntimeLiveReadSourcesRevalidated:z.literal(true),
  acceptanceLedgerRuntimeExecutionPoliciesRevalidated:z.literal(true),acceptanceLedgerRuntimeExecutionPolicyCount:count,acceptanceLedgerRuntimeExecutionPolicyManifestHash:sha}),
 times:z.object({methodExperienceTimesRevalidated:z.literal(true),acceptanceTimeCheckedAt:z.iso.datetime(),acceptanceValidBefore:z.iso.datetime()}),
 sources:z.object({sourceRevocationGuardsReady:z.literal(true),sourceProtectionHash:sha,sourceProtectionTransactionId:z.string().regex(/^[1-9][0-9]*$/)}),
});

/** Internal composition of retained server readers. It certifies actual registered
 * production graph execution for the completed, declared-limit frozen read trials
 * used by MA24-06, not the ordinary task's entire live-replanning lifecycle. No
 * tool/HTTP caller can supply these inputs; activation still owns eligibility,
 * source fences, live actor/lease, current decisions and the final atomic commit. */
export function qualifySkillProductionExecution(input:unknown){
 const blocked=(reason:string)=>({productionAgentEquivalent:false as const,productionExecutionBlockers:[reason]});
 const parsed=proofSchema.safeParse(input);
 if(!parsed.success)return blocked('production-execution-proof-incomplete');
 const value=parsed.data,{plan,policy,materials,transports,packages,ledger}=value;
 if(plan.pin.ownerId!==value.ownerId||policy.artifactHash!==value.artifactHash||materials.artifactHash!==value.artifactHash
  ||materials.latestReviewHash!==policy.latestReviewHash||policy.planHash!==digest(plan)||policy.currentRuntimeIdentityHash!==digest(plan.identity))
  return blocked('production-execution-snapshots-differ');
 const arms=plan.cases.reduce((n,item)=>n+(item.provenance==='safety-fixture'?2:1),0),live=plan.cases.filter(item=>item.provenance==='prospective-task').length;
 if(!live||transports.transportEvaluationArmCount!==arms||ledger.acceptanceLedgerRuntimeTaskCount!==arms
  ||ledger.acceptanceLedgerRuntimeExecutionPolicyCount!==arms||ledger.acceptanceLedgerRuntimeLiveReadTaskCount!==live
  ||materials.runCount!==value.originalTaskCount||transports.transportOriginalTaskCount!==value.originalTaskCount
  ||packages.runtimeProcessBoundReceiptCount!==transports.transportReceiptCount
  ||transports.transportOriginalReceiptCount+transports.transportEvaluationReceiptCount!==transports.transportReceiptCount
  ||ledger.acceptanceLedgerAttemptCount!==transports.transportEvaluationReceiptCount)
  return blocked('production-execution-coverage-incomplete');
 if(Date.parse(value.times.acceptanceTimeCheckedAt)>=Date.parse(value.times.acceptanceValidBefore))return blocked('production-execution-validity-ended');
 const summary={protocol:'skill-production-execution-v1',scope:SKILL_PRODUCTION_EXECUTION_SCOPE,
  ownerId:value.ownerId,bundleId:value.bundleId,freezeId:value.freezeId,artifactHash:value.artifactHash,
  planHash:policy.planHash,reviewHash:policy.latestReviewHash,currentRuntimeIdentityHash:policy.currentRuntimeIdentityHash,
  materialsHash:materials.materialsHash,collectorProvenanceHash:value.collector.collectorProvenanceHash,
  transportAuditHash:transports.transportAuditHash,processCoverageHash:transports.runtimeProcessCoverageHash,
  packageRegistrationHash:packages.runtimePackageRegistrationHash,processPackageBindingHash:packages.runtimeProcessPackageBindingHash,
  ledgerHash:ledger.acceptanceLedgerHash,executionPolicyManifestHash:ledger.acceptanceLedgerRuntimeExecutionPolicyManifestHash,
  originalTasks:value.originalTaskCount,evaluationArms:arms,liveReadTrials:live,transportReceipts:transports.transportReceiptCount,
  checkedAt:value.times.acceptanceTimeCheckedAt,validBefore:value.times.acceptanceValidBefore,
  sourceProtectionHash:value.sources.sourceProtectionHash,sourceProtectionTransactionId:value.sources.sourceProtectionTransactionId};
 return {productionAgentEquivalent:true as const,productionExecutionBlockers:[] as string[],productionExecutionScope:SKILL_PRODUCTION_EXECUTION_SCOPE,
  productionExecutionProofHash:digest(summary),ordinaryLifecycleEquivalent:false as const};
}
