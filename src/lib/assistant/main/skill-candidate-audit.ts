import {z} from 'zod';
import {tenantQuery} from '@/lib/rag/db';
import {digest} from './contracts';
import {modelReplySchema} from './model';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';
import {assertRecordedFallbackChain} from './recorded-fallback-chain';
import {prepareRecordedModeRequest} from './model-request-replay';
import {runRecordedSkillCandidateArm} from './skill-candidate-source';

export type SkillModelAuditRow={id:string;owner_id:string;evaluation_id:string;arm:string;step:number;route_index:number;source_kind:string;snapshot_hash:string;input:unknown;input_hash:string;output:unknown;output_hash:string|null;started_at?:string;completed_at?:string};
type Identity={userId:string;evaluationId:string;arm:'baseline'|'candidate'};
/** Integrity only. Rows must subsequently be loaded from account-isolated server storage. */
export function prepareSkillModelJournalAudit(identity:Identity,rows:SkillModelAuditRow[]){
 if(!rows.length||rows.length>192)throw new Error('Candidate model journal unavailable');
 const sourceKind=z.enum(['synthetic-fixture','production-runner-pending-verification']).parse(rows[0].source_kind),snapshotHash=z.string().regex(/^[a-f0-9]{64}$/).parse(rows[0].snapshot_hash);
 for(const row of rows){
  if(row.owner_id!==identity.userId||row.evaluation_id!==identity.evaluationId||row.arm!==identity.arm||row.source_kind!==sourceKind||row.snapshot_hash!==snapshotHash
   ||!Number.isInteger(row.step)||row.step<0||!Number.isInteger(row.route_index)||row.route_index<0||row.route_index>2
   ||!row.output_hash||digest(row.output)!==row.output_hash)throw new Error('Candidate model journal binding invalid');
 }
 const ordered=[...rows].sort((a,b)=>a.step-b.step||a.route_index-b.route_index);
 const fallback=assertRecordedFallbackChain(ordered.map(row=>({...row,status:'completed',call_key:`mode-model:${row.step}:0:${row.route_index}`})));
 const selected=ordered.filter(row=>z.object({status:z.string()}).parse(row.output).status==='success').map(row=>{
  const request=prepareRecordedModeRequest(row),output=z.object({data:z.object({value:z.object({message:modelReplySchema})})}).parse(row.output);
  return {row,request,message:output.data.value.message};
 });
 if(selected.length>64||selected.some((item,index)=>item.row.step!==index))throw new Error('Candidate model decision sequence incomplete');
 return {sourceKind,snapshotHash,ordered,selected,fallback,journalHash:digest(ordered)};
}

/** Reconstructs the actual graph from authoritative model receipts. No model/provider/collector writes. */
export async function auditDurableSkillCandidate(context:{userId:string},input:{runId:string;skillId:string;version:number;evaluationId:string;arm:'baseline'|'candidate'}){
 assertLocalAnalysisBoundary();z.uuid().parse(context.userId);z.uuid().parse(input.evaluationId);z.enum(['baseline','candidate']).parse(input.arm);
 const read=()=>tenantQuery<SkillModelAuditRow>(context.userId,`select a.id,a.owner_id,a.evaluation_id,a.arm,a.step,a.route_index,a.source_kind,a.snapshot_hash,a.input,a.input_hash,o.output,o.output_hash,a.created_at::text as started_at,o.created_at::text as completed_at
  from agent_skill_model_attempt a left join agent_skill_model_outcome o on o.attempt_id=a.id and o.owner_id=a.owner_id
  where a.owner_id=$1 and a.evaluation_id=$2 and a.arm=$3 order by a.step,a.route_index`,[context.userId,input.evaluationId,input.arm]);
 const rows=await read(),prepared=prepareSkillModelJournalAudit({...context,evaluationId:input.evaluationId,arm:input.arm},rows);
 let decisions=0;
 const replay=await runRecordedSkillCandidateArm(context,{runId:input.runId,skillId:input.skillId,version:input.version},input.arm,async request=>{
  const saved=prepared.selected[decisions++];
  if(!saved||saved.row.step!==request.step||digest(saved.row.input)!==digest({messages:request.messages,profile:request.profile,index:saved.row.route_index}))throw new Error('Candidate graph model input mismatch');
  return saved.message;
 },prepared.selected.length);
 if(replay.status!=='completed'||replay.stopReason!==null||decisions!==prepared.selected.length||replay.serverSnapshotHash!==prepared.snapshotHash)throw new Error('Candidate graph reconstruction incomplete or changed');
 if(digest(await read())!==digest(rows))throw new Error('Candidate model journal changed during audit');
 const projection={protocol:'skill-candidate-journal-audit-v1',ownerId:context.userId,evaluationId:input.evaluationId,arm:input.arm,
  capturedAt:new Date(Math.min(...rows.map(row=>Date.parse(row.started_at??'')))).toISOString(),
  completedAt:new Date(Math.max(...rows.map(row=>Date.parse(row.completed_at??'')))).toISOString(),
  sourceKind:prepared.sourceKind,serverSnapshotHash:prepared.snapshotHash,journalHash:prepared.journalHash,
  taskInputHash:replay.taskInputHash,modelConfigHash:replay.modelConfigHash,
  evidenceHash:digest(replay.trace.filter(row=>row.receiptHash).map(row=>row.receiptHash)),
  answerHash:digest(replay.reply),messagesHash:digest(replay.messages),traceHash:digest(replay.trace),candidateSkillUsed:replay.candidateSkillUsed,
  modelAttemptReceipts:prepared.ordered.map(row=>({id:row.id,hash:digest(row)})),
  selectedModels:prepared.selected.map(item=>({step:item.row.step,requestedModel:item.request.selectedRoute.model,model:item.request.originalResponse.model,provider:item.request.originalResponse.provider,requestHash:item.request.requestHash,receiptHash:digest(item.row),toolSchemaHash:digest(item.request.body.tools)})),
 };
 return {projection,projectionHash:digest(projection),completeModelJournalVerified:true,graphReconstructed:true,actualModelCalls:0,
  productionAgentEquivalent:false,collectorProvenanceVerified:false,automaticActivation:false};
}
