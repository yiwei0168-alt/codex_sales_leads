import {digest} from './contracts';
import {enqueueSkillCandidateRuntimeTask,inspectSkillCandidateRuntimeTask,claimSkillCandidateRuntimeTask,readCompletedSkillCandidateRuntimeTask} from './skill-candidate-runtime-task';
import {runSkillRuntimeCandidate} from './skill-runtime-candidate';
import {auditSkillRuntimeCandidate} from './skill-runtime-candidate-audit';
import {createConfiguredSkillTransportRequest} from './skill-model-transport-request';
import type {SkillCandidateCollector} from './skill-candidate-model';

/** Shared internal lifecycle for historical, prospective and fixed safety arms.
 * Task/source admission remains server-derived; no transport is created on reuse. */
export async function runConfiguredSkillRuntimeTask(context:{userId:string},pin:Parameters<typeof enqueueSkillCandidateRuntimeTask>[1],
 frozen:NonNullable<SkillCandidateCollector['frozen']>,transaction:SkillCandidateCollector['transaction'],sourceHash:string,maximumModelCalls:number){
  const task=await enqueueSkillCandidateRuntimeTask(context,pin,frozen.plan);
  const taskInput={...pin,taskId:task.runId},state=await inspectSkillCandidateRuntimeTask(context,taskInput,frozen.plan);
  const snapshotHash=digest({protocol:'skill-runtime-candidate-v1',sourceHash,taskId:task.runId,specHash:task.specHash});
  if(state.status==='completed'){
   const audit=await auditSkillRuntimeCandidate(context,taskInput,frozen.plan),completed=await readCompletedSkillCandidateRuntimeTask(context,taskInput,frozen.plan);
   if(audit.projection.runtimeSnapshotHash!==snapshotHash||audit.projection.completedTaskHash!==digest(completed))throw new Error('Configured completed runtime task changed');
   return {protocol:'skill-instruction-overlay-runtime-v1',status:'completed',stopReason:null,candidateSkillUsed:audit.projection.candidateSkillUsed,
    reply:completed.reply,serverSnapshotHash:sourceHash,runtimeSnapshotHash:snapshotHash,taskId:task.runId,taskStatus:'completed',
    modelCalls:audit.projection.selectedModels.length,registeredToolJournalUsed:true,reusedCompletedTask:true};
  }
  if(state.control||!['queued','running'].includes(state.status))throw new Error('Configured runtime task requires reconciliation');
  // Key, registry, transport and paid-scope preflight precede the live claim.
  const request=await createConfiguredSkillTransportRequest(context,{evaluationId:pin.evaluationId,arm:pin.arm,snapshotHash,frozen});
  const claimed=await claimSkillCandidateRuntimeTask(context,{...taskInput,workerId:`skill-collector-${pin.evaluationId}`},frozen.plan);
  const result=await runSkillRuntimeCandidate(claimed.context,pin,
   {evaluationId:pin.evaluationId,sourceKind:'production-runner-pending-verification',transaction,request,frozen},maximumModelCalls);
  if(result.taskId!==task.runId||result.taskStatus!=='completed'||result.runtimeSnapshotHash!==snapshotHash)throw new Error('Configured recorded candidate incomplete or changed');
  return {...result,reusedCompletedTask:false};
}
