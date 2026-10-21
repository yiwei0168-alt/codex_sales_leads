import type {PoolClient} from 'pg';
import {z} from 'zod';
import {withBoundTenantTransaction} from '@/lib/rag/db';
import {digest} from './contracts';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';
import {readLockedSkillAcceptanceEvidence} from './skill-acceptance-store';
import {lockSkillAcceptanceRunJournals,skillAcceptanceRunIds} from './skill-acceptance-run-locks';
import {verifyOwnedTaskModelTransports} from './task-model-transport-journal';
import {verifySkillCandidateJournalTransports} from './skill-model-transport-journal';
import {loadConfiguredSkillRunnerTrustRegistry} from './skill-runner-attestation';
import {mergeSkillSigningEnrollments,mergeSkillSigningEnrollmentWindows,type SkillSigningEnrollment,type SkillSigningEnrollmentWindow} from './skill-signing-enrollment';
import {summarizeRuntimeProcessCoverage,type RuntimeProcessRecord} from './runtime-process-coverage';

/** Rebuild coverage from persisted case bindings. Historical/prospective baselines
 * use the original task journal; safety cases have two evaluation journals. */
export function skillAcceptanceTransportArms(artifact:Parameters<typeof skillAcceptanceRunIds>[0]){
 const arms=new Map<string,{evaluationId:string;arm:'baseline'|'candidate'}>();
 for(const item of artifact.plan.cases){
  const name=item.provenance==='historical-task'?'candidateSources':item.provenance==='prospective-task'?'prospectiveSources':
   item.provenance==='safety-fixture'?'safetySources':null;
  if(!name)throw new Error('Unsupported acceptance transport provenance');
  const ref=z.object({evaluationId:z.uuid()}).passthrough().parse(z.record(z.string(),z.unknown()).parse(artifact.rawReceipts[name])[item.id]);
  for(const arm of item.provenance==='safety-fixture'?['baseline','candidate'] as const:['candidate'] as const)
   arms.set(`${ref.evaluationId}:${arm}`,{evaluationId:ref.evaluationId,arm});
 }
 return [...arms].sort(([a],[b])=>a.localeCompare(b)).map(([,ref])=>ref);
}
async function databaseTime(client:PoolClient){
 const now=(await client.query<{checked_at:Date}>('select clock_timestamp() checked_at')).rows[0]?.checked_at;
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw new Error('Acceptance transport clock unavailable');
 return now;
}
/** A signature audit only. The caller retains the bound transaction and locks;
 * binary/provider qualification and final activation remain separate gates. */
export async function revalidateLockedSkillTransportReceipts(client:PoolClient,context:{userId:string},bundleId:string){
 assertLocalAnalysisBoundary();
 return withBoundTenantTransaction(client,context.userId,async()=>{
  const evidence=await readLockedSkillAcceptanceEvidence(client,context,bundleId);
  if(evidence.artifact.sourceKind==='synthetic-fixture')return {transportReceiptsRequired:false as const,transportReceiptsRevalidated:false as const};
  const freezeId=evidence.freezeStatus.freezeId;if(!freezeId)throw new Error('Acceptance transport freeze unavailable');
  const runs=skillAcceptanceRunIds(evidence.artifact),arms=skillAcceptanceTransportArms(evidence.artifact);
  if(!arms.length)throw new Error('Acceptance transport coverage empty');
  await lockSkillAcceptanceRunJournals(client,context.userId,evidence.artifact);
  const registryHash=digest(await loadConfiguredSkillRunnerTrustRegistry(context.userId)),now=await databaseTime(client);
  const audits:Array<{sourceHash:string;journalHash:string;receiptHashes:string[];validBefore:string;signingEnrollmentHash:string;signingWindowHash:string}>=[],enrollments:SkillSigningEnrollment[]=[],windows:SkillSigningEnrollmentWindow[]=[];
  const processClaims:RuntimeProcessRecord[]=[],processReceiptHashes:string[]=[];let processRecordsAvailable=true;
  const retain=(source:unknown,out:{registryHash:string|undefined;journalHash:string;transportReceiptHashes:string[];transportValidBefore:string;signingEnrollments:SkillSigningEnrollment[];signingEnrollmentWindows:SkillSigningEnrollmentWindow[];runtimeProcessClaims?:readonly unknown[]})=>{
   if(out.registryHash!==registryHash||!out.transportReceiptHashes.length)throw new Error('Acceptance transport trust or coverage changed');
   const bindings=mergeSkillSigningEnrollments(out.signingEnrollments);
   if(!bindings.length)throw new Error('Acceptance transport signing enrollment empty');enrollments.push(...bindings);
   const ranges=mergeSkillSigningEnrollmentWindows(out.signingEnrollmentWindows);windows.push(...ranges);
   if(digest(ranges.map(({keyId,collectorId,deploymentHash,purpose})=>({keyId,collectorId,deploymentHash,purpose})))!==digest(bindings))throw new Error('Acceptance signing window coverage changed');
   processReceiptHashes.push(...out.transportReceiptHashes);
   if(out.runtimeProcessClaims===undefined)processRecordsAvailable=false;
   else processClaims.push(...summarizeRuntimeProcessCoverage({receiptHashes:out.transportReceiptHashes,claims:out.runtimeProcessClaims}).claims);
   audits.push({sourceHash:digest(source),journalHash:out.journalHash,receiptHashes:out.transportReceiptHashes,validBefore:out.transportValidBefore,signingEnrollmentHash:digest(bindings),signingWindowHash:digest(ranges)});
  };
  for(const runId of runs)retain({runId},await verifyOwnedTaskModelTransports(context,{runId},now));
  for(const ref of arms)retain(ref,await verifySkillCandidateJournalTransports(context,ref,{freezeId,plan:evidence.artifact.plan},now));
  const after=await readLockedSkillAcceptanceEvidence(client,context,bundleId);
  if(after.artifactHash!==evidence.artifactHash||digest(await loadConfiguredSkillRunnerTrustRegistry(context.userId))!==registryHash)
   throw new Error('Acceptance transport evidence or trust changed during audit');
  const validBefore=Math.min(Date.parse(evidence.artifact.plan.expiresAt),...audits.map(row=>Date.parse(row.validBefore)));
  const checkedAt=await databaseTime(client);
  if(!Number.isFinite(validBefore)||checkedAt.getTime()>=validBefore)throw new Error('Acceptance transport expired during audit');
  const processCoverage=processRecordsAvailable?summarizeRuntimeProcessCoverage({receiptHashes:processReceiptHashes,claims:processClaims}):undefined;
  return {transportReceiptsRequired:true as const,transportReceiptsRevalidated:true as const,
   runtimeProcessReceiptHashes:processReceiptHashes,
   ...(processCoverage?{runtimeProcessClaims:processCoverage.claims,runtimeProcessCoverageHash:processCoverage.runtimeProcessCoverageHash}:{}),
   runtimeProcessCoverageComplete:processCoverage?.runtimeProcessCoverageComplete===true,
   runtimeProcessMissingClaimCount:processCoverage?.runtimeProcessMissingClaimCount??processReceiptHashes.length,
   transportSigningEnrollments:mergeSkillSigningEnrollments(enrollments),
   transportSigningEnrollmentWindows:mergeSkillSigningEnrollmentWindows(windows),
   transportAuditHash:digest(audits),transportRegistryHash:registryHash,transportOriginalTaskCount:runs.length,transportEvaluationArmCount:arms.length,
   transportReceiptCount:audits.reduce((count,row)=>count+row.receiptHashes.length,0),
   transportCheckedAt:checkedAt.toISOString(),transportValidBefore:new Date(validBefore).toISOString()};
 });
}
