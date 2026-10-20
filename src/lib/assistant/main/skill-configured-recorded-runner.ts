import {z} from 'zod';
import {digest} from './contracts';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';
import {requireSkillAcceptanceFreeze} from './skill-acceptance-freeze';
import {prepareSkillAcceptanceBaseline} from './skill-acceptance-baseline';
import {prepareSkillExecutionIdentity} from './skill-runtime-identity';
import {prepareSkillProspectiveSource} from './skill-prospective-source';
import {prepareRecordedSkillCandidateSnapshot} from './skill-candidate-source';
import {createConfiguredSkillTransportRequest} from './skill-model-transport-request';
import {verifySkillCandidateJournalTransports} from './skill-model-transport-journal';
import {verifyOwnedTaskModelTransports} from './task-model-transport-journal';
import {collectHistoricalSkillAcceptance} from './skill-acceptance-collector';
import {collectSkillProspectiveAcceptance} from './skill-prospective-collector';
import type {SkillCandidateCollector} from './skill-candidate-model';
import {enqueueSkillCandidateRuntimeTask,inspectSkillCandidateRuntimeTask,claimSkillCandidateRuntimeTask,readCompletedSkillCandidateRuntimeTask} from './skill-candidate-runtime-task';
import {runSkillRuntimeCandidate} from './skill-runtime-candidate';
import {auditSkillRuntimeCandidate} from './skill-runtime-candidate-audit';

const fields={caseId:z.string().min(1).max(200),evaluationId:z.uuid(),maximumModelCalls:z.number().int().min(1).max(64)};
const selection=z.discriminatedUnion('kind',[
 z.object({...fields,kind:z.literal('historical'),runId:z.uuid()}).strict(),
 z.object({...fields,kind:z.literal('prospective'),jobId:z.uuid()}).strict(),
]);
/** Internal collector only. The original server task is the baseline; the candidate
 * is rerun with configured transport and signed durable receipts. Pending evidence
 * is collected for review, without granting production authenticity or activation. */
export async function runConfiguredSkillRecordedCandidate(context:{userId:string},input:z.infer<typeof selection>,
 frozen:NonNullable<SkillCandidateCollector['frozen']>,transaction:SkillCandidateCollector['transaction']){
 assertLocalAnalysisBoundary();z.uuid().parse(context.userId);const p=selection.parse(input),{plan,freezeId}=frozen;
 const bind=async()=>{
  await requireSkillAcceptanceFreeze(context,freezeId,plan);
  const item=plan.cases.find(row=>row.id===p.caseId);
  if(plan.pin.ownerId!==context.userId||!item)throw new Error('Configured recorded case or owner changed');
  let runId:string,sourceProjectionHash:string;
  if(p.kind==='historical'){
   if(item.category!=='replay'||item.provenance!=='historical-task')throw new Error('Configured historical case required');
   const baseline=await prepareSkillAcceptanceBaseline(context,{runId:p.runId});
   if(item.inputHash!==baseline.projection.inputHash||item.sourceHash!==baseline.projectionHash)throw new Error('Configured historical source changed');
   runId=p.runId;sourceProjectionHash=baseline.projectionHash;
  }else{
   const source=await prepareSkillProspectiveSource(context,{jobId:p.jobId,caseId:p.caseId,freezeId,plan});
   runId=source.projection.runId;sourceProjectionHash=source.projectionHash;
  }
  if(digest(await prepareSkillExecutionIdentity(context,{runId}))!==digest(plan.identity))throw new Error('Configured recorded identity changed');
  const saved=await prepareRecordedSkillCandidateSnapshot(context,{runId,skillId:plan.pin.skillId,version:plan.pin.version});
  if(saved.skillSourceHash!==plan.pin.sourceHash||saved.snapshot.candidate.value.content_hash!==plan.pin.contentHash
   ||saved.taskInputHash!==item.inputHash||saved.modelConfigHash!==plan.identity.modelConfigHash)throw new Error('Configured recorded snapshot changed');
  // Snapshot preparation already reconstructs the owned task/context/tool chain.
  // Require original transport signatures separately before any candidate call.
  const originalTransport=await verifyOwnedTaskModelTransports(context,{runId});
  return {runId,sourceProjectionHash,snapshotHash:saved.sourceHash,originalTransportHash:digest(originalTransport)};
 };
 const bound=await bind();let runtimeTaskId:string|undefined;
 const output=await(async()=>{
  const pin={runId:bound.runId,skillId:plan.pin.skillId,version:plan.pin.version,freezeId,caseId:p.caseId,evaluationId:p.evaluationId,arm:'candidate' as const,...(p.kind==='prospective'?{prospectiveJobId:p.jobId}:{})};
  const task=await enqueueSkillCandidateRuntimeTask(context,pin,plan);runtimeTaskId=task.runId;
  const taskInput={...pin,taskId:task.runId},state=await inspectSkillCandidateRuntimeTask(context,taskInput,plan);
  const snapshotHash=digest({protocol:'skill-runtime-candidate-v1',sourceHash:bound.snapshotHash,taskId:task.runId,specHash:task.specHash});
  if(state.status==='completed'){
   const audit=await auditSkillRuntimeCandidate(context,taskInput,plan),completed=await readCompletedSkillCandidateRuntimeTask(context,taskInput,plan);
   if(audit.projection.runtimeSnapshotHash!==snapshotHash||audit.projection.completedTaskHash!==digest(completed))throw new Error('Configured completed runtime task changed');
   return {protocol:'skill-instruction-overlay-runtime-v1',status:'completed',stopReason:null,candidateSkillUsed:audit.projection.candidateSkillUsed,
    reply:completed.reply,serverSnapshotHash:bound.snapshotHash,runtimeSnapshotHash:snapshotHash,taskId:task.runId,taskStatus:'completed',
    modelCalls:audit.projection.selectedModels.length,registeredToolJournalUsed:true,reusedCompletedTask:true};
  }
  if(state.control||!['queued','running'].includes(state.status))throw new Error('Configured runtime task requires reconciliation');
  // Key, registry, transport and paid-scope preflight precede the live claim.
  const request=await createConfiguredSkillTransportRequest(context,{evaluationId:p.evaluationId,arm:'candidate',snapshotHash,frozen});
  const claimed=await claimSkillCandidateRuntimeTask(context,{...taskInput,workerId:`skill-collector-${p.evaluationId}`},plan);
  const result=await runSkillRuntimeCandidate(claimed.context,pin,
   {evaluationId:p.evaluationId,sourceKind:'production-runner-pending-verification',transaction,request,frozen},p.maximumModelCalls);
  if(result.taskStatus!=='completed'||result.runtimeSnapshotHash!==snapshotHash)throw new Error('Configured recorded candidate incomplete or changed');
  return {...result,reusedCompletedTask:false};
 })();
 if(output.status!=='completed'||output.stopReason!==null||!output.candidateSkillUsed||output.serverSnapshotHash!==bound.snapshotHash)
  throw new Error('Configured recorded candidate incomplete or changed');
 if(digest(await bind())!==digest(bound))throw new Error('Configured recorded source changed during execution');
 const transport=await verifySkillCandidateJournalTransports(context,{evaluationId:p.evaluationId,arm:'candidate'},frozen);
 if(digest(await bind())!==digest(bound))throw new Error('Configured recorded source changed during verification');
 const collected=p.kind==='historical'
  ?await collectHistoricalSkillAcceptance(context,{freezeId,plan,replays:[{caseId:p.caseId,runId:bound.runId,evaluationId:p.evaluationId,taskId:runtimeTaskId}]},transaction)
  :await collectSkillProspectiveAcceptance(context,{freezeId,plan,cases:[{caseId:p.caseId,jobId:p.jobId,evaluationId:p.evaluationId,taskId:runtimeTaskId}]},transaction);
 return {...output,collected,transportVerification:transport,transportVerificationHash:digest(transport),
  originalTransportVerificationHash:bound.originalTransportHash,
  productionAgentEquivalent:false as const,collectorProvenanceVerified:false as const,automaticActivation:false as const};
}
