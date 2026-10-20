import {z} from 'zod';
import {digest} from './contracts';
import {prepareSkillSafetyCandidate,requireSkillSafetyBinding} from './skill-safety-candidate';
import {readSkillCandidateJournal,prepareSkillModelJournalAudit} from './skill-candidate-audit';
import {runSkillCandidateArm} from './skill-candidate-runner';
import type {SkillCandidateCollector} from './skill-candidate-model';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';

/** Reconstruct a fixed safety case from account-owned append-only model receipts. No model calls. */
export async function auditSkillSafetyArm(context:{userId:string},input:{runId:string;skillId:string;version:number;caseId:string;evaluationId:string;taskId?:string;arm:'baseline'|'candidate'},frozen:NonNullable<SkillCandidateCollector['frozen']>){
 assertLocalAnalysisBoundary();z.uuid().parse(input.evaluationId);z.enum(['baseline','candidate']).parse(input.arm);
 const selection={runId:input.runId,skillId:input.skillId,version:input.version,caseId:input.caseId};
 const saved=await prepareSkillSafetyCandidate(context,selection),validate=()=>requireSkillSafetyBinding(context,selection,saved,frozen);
 await validate();
 if(input.taskId){
  const {auditSkillRuntimeCandidate}=await import('./skill-runtime-candidate-audit');
  const runtime=await auditSkillRuntimeCandidate(context,{...selection,taskId:input.taskId,evaluationId:input.evaluationId,arm:input.arm,
   freezeId:frozen.freezeId,safetyCaseId:input.caseId},frozen.plan),r=runtime.projection;
  const projection={protocol:'skill-safety-runtime-audit-v1',ownerId:context.userId,caseId:saved.caseId,category:saved.category,provenance:saved.provenance,
   evaluationId:input.evaluationId,arm:input.arm,freezeId:frozen.freezeId,sourceKind:r.sourceKind,sourceHash:saved.sourceHash,inputHash:saved.inputHash,
   modelConfigHash:saved.modelConfigHash,state:'completed' as const,stopReason:null,unexpectedEffects:0,answerHash:r.answerHash,evidenceHash:r.evidenceHash,
   capturedAt:r.capturedAt,completedAt:r.completedAt,journalHash:r.journalHash,modelReceiptHashes:r.modelAttemptReceipts.map(row=>row.hash),
   taskId:input.taskId,completedTaskHash:r.completedTaskHash,runtimeProjectionHash:runtime.projectionHash,toolReceipts:r.toolReceipts,
   routes:r.selectedModels.map(row=>({step:row.step,requestedModel:row.requestedModel,actualModel:row.model!,provider:row.provider!,receiptHash:row.receiptHash,toolSchemaHash:row.toolSchemaHash}))};
  await validate();
  return {projection,projectionHash:digest(projection),material:runtime.material,candidateSkillUsed:r.candidateSkillUsed,
   actualModelCalls:0,productionAgentEquivalent:false,collectorProvenanceVerified:false,automaticActivation:false};
 }
 const read=()=>readSkillCandidateJournal(context,input),rows=await read();
 const journal=prepareSkillModelJournalAudit({...context,evaluationId:input.evaluationId,arm:input.arm},rows);
 if(journal.freezeId!==frozen.freezeId||journal.snapshotHash!==saved.sourceHash)throw new Error('Safety journal frozen source mismatch');
 let steps=0,mismatch=false;
 const replay=await runSkillCandidateArm(saved.snapshot,input.arm,async request=>{
  const selected=journal.selected[steps++];
  if(!selected||selected.row.step!==request.step||digest(selected.row.input)!==digest({messages:request.messages,profile:request.profile,index:selected.row.route_index})){mismatch=true;throw new Error('Safety graph input mismatch');}
  return selected.message;
 },validate,journal.selected.length);
 if(mismatch||steps!==journal.selected.length||digest(await read())!==digest(rows))throw new Error('Safety journal changed or incomplete');
 await validate();
 if(input.arm==='candidate'&&replay.candidateSkillUsed!==true)throw new Error('Safety candidate did not read the fixed Skill');
 const projection={protocol:'skill-safety-journal-audit-v1',ownerId:context.userId,caseId:saved.caseId,category:saved.category,provenance:saved.provenance,
  evaluationId:input.evaluationId,arm:input.arm,freezeId:frozen.freezeId,sourceKind:journal.sourceKind,sourceHash:saved.sourceHash,inputHash:saved.inputHash,
  modelConfigHash:saved.modelConfigHash,state:replay.status==='completed'&&replay.stopReason===null?'completed' as const:'failed' as const,stopReason:replay.stopReason,
  unexpectedEffects:replay.businessToolExecutions,answerHash:digest(replay.reply),evidenceHash:digest(replay.trace.filter(row=>row.receiptHash).map(row=>row.receiptHash)),
  capturedAt:new Date(Math.min(...rows.map(row=>Date.parse(row.started_at??'')))).toISOString(),completedAt:new Date(Math.max(...rows.map(row=>Date.parse(row.completed_at??'')))).toISOString(),
  journalHash:journal.journalHash,modelReceiptHashes:journal.ordered.map(row=>digest(row)),
  routes:journal.selected.map(item=>({step:item.row.step,requestedModel:item.request.selectedRoute.model,actualModel:item.request.originalResponse.model!,provider:item.request.originalResponse.provider!,receiptHash:digest(item.row),toolSchemaHash:digest(item.request.body.tools)})),
 };
 return {projection,projectionHash:digest(projection),material:{question:saved.snapshot.initialMessages.findLast(row=>row.role==='user')!.content!,answer:replay.reply,receipts:saved.snapshot.receipts.filter(receipt=>replay.trace.some(row=>row.receiptHash===receipt.hash)).map(row=>({tool:row.tool,input:row.arguments,output:row.output}))},
  candidateSkillUsed:replay.candidateSkillUsed,actualModelCalls:0,productionAgentEquivalent:false,collectorProvenanceVerified:false,automaticActivation:false};
}
