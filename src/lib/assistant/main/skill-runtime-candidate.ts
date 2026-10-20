import {digest,result,toolResultSchema,type ExecutionContext} from './contracts';
import {productTools} from './tools';
import {resolveToolDispatch} from './tool-dispatch-resolution';
import {dispatchTool} from './executor';
import {prepareSkillRuntimeCandidateSource} from './skill-runtime-candidate-source';
import {runSkillCandidateArm,type SkillRuntimeDispatch} from './skill-candidate-runner';
import {createDurableSkillCandidateModel,type SkillCandidateCollector} from './skill-candidate-model';
import {withSkillCandidateLease} from './skill-candidate-lease';
import {prepareSkillCandidateCheckpoint} from './skill-candidate-checkpoint';
import {assertSkillCandidateRuntimeTask,settleSkillCandidateRuntimeTask} from './skill-candidate-runtime-task';
import {withSkillRuntimeTaskLease} from './skill-runtime-task-lease';

type Selection=Parameters<typeof assertSkillCandidateRuntimeTask>[1];

/** Historical counterfactuals use pinned exact read receipts. The registered
 * dispatcher owns permissions, call identity, recovery and durable tool outputs;
 * virtual Skill availability never changes the account's actual enabled flag. */
function recordedRuntimeDispatch(context:ExecutionContext,snapshot:Parameters<typeof runSkillCandidateArm>[0],arm:'baseline'|'candidate',validate:()=>Promise<void>):SkillRuntimeDispatch{
 const tools=productTools.map(tool=>({...tool,execute:async(input:unknown)=>{
  await validate();
  if(tool.effect!=='read')throw new Error('Skill runtime effects unavailable');
  if(tool.id==='skill_list')return result(snapshot.skills.map(row=>row.id===snapshot.candidate.listing.id?{...row,enabled:arm==='candidate'}:row),{cost:'known'});
  if(tool.id==='skill_read'&&(input as {id?:string}).id===snapshot.candidate.listing.id)
   return result(arm==='candidate'?structuredClone(snapshot.candidate.value):null,{cost:'known'});
  const matches=snapshot.receipts.filter(row=>row.tool===tool.id&&digest(row.arguments)===digest(input));
  if(matches.length!==1)throw new Error('Unique recorded runtime read required');
  const receipt=matches[0];if(receipt.hash!==digest({tool:receipt.tool,arguments:receipt.arguments,output:receipt.output}))throw new Error('Recorded runtime read changed');
  return toolResultSchema.parse(structuredClone(receipt.output));
 }}));
 return async call=>{
  await validate();const resolved=resolveToolDispatch(call,context,tools);
  const output=toolResultSchema.parse(JSON.parse(JSON.stringify(await dispatchTool(call,context,tools))));await validate();
  const selected=resolved.kind==='execute'?resolved:undefined;
  const used=arm==='candidate'&&selected?.tool.id==='skill_read'&&(selected.input as {id?:string}).id===snapshot.candidate.listing.id
   &&output.status==='success'&&digest(output.data)===digest(JSON.parse(JSON.stringify(snapshot.candidate.value)));
  const receipts=selected?snapshot.receipts.filter(row=>row.tool===selected.tool.id&&digest(row.arguments)===digest(selected.input)):[];
  return {output,candidateSkillUsed:used,...(receipts.length===1?{receiptHash:receipts[0].hash}:{}),
   ...(output.status!=='success'&&output.status!=='partial'?{stopReason:'runtime-tool-unavailable'}:{})};
 };
}

/** Dedicated internal G09 entry. Caller supplies a claimed server context and
 * an independently authorized request adapter; no model route is implicit. */
export async function runSkillRuntimeCandidate(context:ExecutionContext,input:Selection,collector:SkillCandidateCollector,maximumModelCalls=8){
 const frozen=collector.frozen;
 if(!frozen||frozen.freezeId!==input.freezeId||collector.evaluationId!==input.evaluationId||context.evaluationArm!==input.arm)
  throw new Error('Skill runtime collector or task binding changed');
 return withSkillRuntimeTaskLease(context,taskSignal=>withSkillCandidateLease(collector.transaction,{ownerId:context.userId,evaluationId:input.evaluationId,
  arm:input.arm,sourceKind:collector.sourceKind,freezeId:frozen.freezeId,expiresAt:frozen.plan.expiresAt},async(assertOwned,executionToken,candidateSignal)=>{
  const signal=AbortSignal.any([taskSignal,candidateSignal]);
  const saved=await prepareSkillRuntimeCandidateSource(context,{runId:input.runId,skillId:input.skillId,version:input.version,...(input.safetyCaseId?{safetyCaseId:input.safetyCaseId}:{})});
  const validate=async()=>{
   signal.throwIfAborted();await assertOwned();await assertSkillCandidateRuntimeTask(context,input,frozen.plan);
   if((await prepareSkillRuntimeCandidateSource(context,{runId:input.runId,skillId:input.skillId,version:input.version,...(input.safetyCaseId?{safetyCaseId:input.safetyCaseId}:{})})).sourceHash!==saved.sourceHash)
    throw new Error('Skill runtime candidate sources changed');
   signal.throwIfAborted();await assertOwned();
  };
  await validate();
  // Distinct binding prevents reusing legacy unjournaled-tool checkpoints or
  // model requests from another hidden task under the same evaluation ID.
  const snapshotHash=digest({protocol:'skill-runtime-candidate-v1',sourceHash:saved.sourceHash,taskId:context.runId,specHash:context.skillTaskSpecHash});
  const durable=createDurableSkillCandidateModel({ownerId:context.userId,snapshotHash,arm:input.arm},collector,validate);
  const checkpoint=await prepareSkillCandidateCheckpoint(collector.transaction,{ownerId:context.userId,evaluationId:input.evaluationId,arm:input.arm,
   snapshotHash:digest({snapshotHash,maximumModelCalls}),sourceKind:collector.sourceKind,freezeId:frozen.freezeId},executionToken,validate);
  const output=await runSkillCandidateArm(saved.snapshot,input.arm,durable.model,validate,maximumModelCalls,checkpoint,signal,
   recordedRuntimeDispatch(context,saved.snapshot,input.arm,validate));
  await validate();
  const settled=await settleSkillCandidateRuntimeTask(context,input,frozen.plan,output.status==='completed'&&output.stopReason===null?'completed':'partial',output.reply);
  return {...output,taskId:context.runId,taskStatus:settled.status,runtimeSnapshotHash:snapshotHash,serverSnapshotHash:saved.sourceHash,
   modelAttemptReceipts:durable.receipts,productionAgentEquivalent:false,automaticActivation:false};
 }));
}
