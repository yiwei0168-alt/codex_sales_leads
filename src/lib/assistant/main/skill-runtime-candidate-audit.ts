import {z} from 'zod';
import {tenantQuery} from '@/lib/rag/db';
import {digest,result,toolResultSchema,type ExecutionContext,type ModelToolCall} from './contracts';
import {resolveToolDispatch} from './tool-dispatch-resolution';
import {runSkillCandidateArm,type SkillRuntimeDispatch} from './skill-candidate-runner';
import {prepareRecordedSkillCandidateSnapshot} from './skill-candidate-source';
import {readCompletedSkillCandidateRuntimeTask} from './skill-candidate-runtime-task';
import {readSkillCandidateJournal,prepareSkillModelJournalAudit} from './skill-candidate-audit';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';
import {toolModelView} from './tool-model-view';

type Snapshot=Parameters<typeof runSkillCandidateArm>[0];
export type SkillRuntimeToolReceipt={id:string;user_id:string;run_id:string;call_key:string;tool_id:string;tool_version:string;
 input:unknown;input_hash:string;effect:string;status:string;output:unknown;approval_id:string|null};
type Context=Pick<ExecutionContext,'userId'|'runId'|'role'|'mode'|'knowledgeScope'|'evaluationArm'|'skillTaskSpecHash'>;
const json=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
function orderLike(expected:unknown,wire:unknown):unknown{
 if(Array.isArray(expected)){
  if(!Array.isArray(wire)||wire.length!==expected.length)throw new Error('Skill runtime wire structure changed');
  return expected.map((value,index)=>orderLike(value,wire[index]));
 }
 if(expected&&typeof expected==='object'){
  if(!wire||typeof wire!=='object'||Array.isArray(wire)||digest(Object.keys(expected).sort())!==digest(Object.keys(wire).sort()))
   throw new Error('Skill runtime wire structure changed');
  return Object.fromEntries(Object.keys(wire).map(key=>[key,orderLike((expected as Record<string,unknown>)[key],(wire as Record<string,unknown>)[key])]));
 }
 return expected;
}

/** Pure reconstruction: resolves contracts but never invokes a tool handler,
 * dispatcher, provider, checkpoint writer or journal writer. */
export function reconstructSkillRuntimeTools(snapshot:Snapshot,context:Context,rows:SkillRuntimeToolReceipt[],wireOutputs:ReadonlyMap<string,string>){
 const used=new Set<string>();
 if(rows.length>2000||new Set(rows.map(row=>row.call_key)).size!==rows.length||new Set(rows.map(row=>row.id)).size!==rows.length)
  throw new Error('Skill runtime tool journal duplicate or oversized');
 for(const row of rows){
  z.uuid().parse(row.id);
  if(row.user_id!==context.userId||row.run_id!==context.runId||row.effect!=='read'||row.status!=='completed'||row.approval_id!==null
   ||digest(row.input)!==row.input_hash)throw new Error('Skill runtime tool journal binding invalid');
 }
 const dispatch:SkillRuntimeDispatch=async(call:ModelToolCall)=>{
  const resolved=resolveToolDispatch(call,context);
  if(resolved.kind==='return')return {output:resolved.output,...(resolved.rejected?{stopReason:resolved.rejected}:{})};
  const {tool,input}=resolved,row=rows.find(row=>row.call_key===call.id);
  if(tool.effect!=='read'||!row||used.has(row.id)||row.tool_id!==tool.id||row.tool_version!==tool.version||digest(row.input)!==digest(input))
   throw new Error('Skill runtime tool call does not match journal');
  let expected:unknown,receiptHash:string|undefined,candidateSkillUsed=false;
  if(tool.id==='skill_list')expected=result(snapshot.skills.map(row=>row.id===snapshot.candidate.listing.id?{...row,enabled:context.evaluationArm==='candidate'}:row),{cost:'known'});
  else if(tool.id==='skill_read'&&(input as {id?:string}).id===snapshot.candidate.listing.id){
   candidateSkillUsed=context.evaluationArm==='candidate';expected=result(candidateSkillUsed?snapshot.candidate.value:null,{cost:'known'});
  }else{
   const matches=snapshot.receipts.filter(row=>row.tool===tool.id&&digest(row.arguments)===digest(input));
   if(matches.length!==1)throw new Error('Skill runtime original receipt unavailable or ambiguous');
   const receipt=matches[0];
   if(receipt.hash!==digest({tool:receipt.tool,arguments:receipt.arguments,output:receipt.output}))throw new Error('Skill runtime original receipt changed');
   expected=toolResultSchema.parse(receipt.output);receiptHash=receipt.hash;
  }
  const bound=json({...toolResultSchema.parse(expected),callId:row.id});
  if(digest(row.output)!==digest(bound))throw new Error('Skill runtime saved output differs from authoritative source');
  // JSONB changes object key order. Recover only that order from the stored
  // model request; all raw values still come from the verified source/receipt.
  const wire=wireOutputs.get(call.id);if(wire===undefined)throw new Error('Skill runtime consumed wire output missing');
  const output=toolResultSchema.parse(orderLike(bound,JSON.parse(wire)));
  if(toolModelView([{role:'tool',tool_call_id:call.id,content:JSON.stringify(output)}])[0].content!==wire)
   throw new Error('Skill runtime consumed wire output changed');
  used.add(row.id);return {output,candidateSkillUsed,...(receiptHash?{receiptHash}:{})};
 };
 return {dispatch,assertClosed:()=>{if(used.size!==rows.length)throw new Error('Skill runtime tool journal has unused calls');}};
}

/** Rebuild new-protocol history from owned server receipts. No human judgment,
 * execution-equivalence or transport authenticity is inferred from replay. */
export async function auditSkillRuntimeCandidate(context:{userId:string},input:Parameters<typeof readCompletedSkillCandidateRuntimeTask>[1],expectedPlan:unknown){
 assertLocalAnalysisBoundary();
 const completed=await readCompletedSkillCandidateRuntimeTask(context,input,expectedPlan);
 const source=()=>prepareRecordedSkillCandidateSnapshot(context,{runId:input.runId,skillId:input.skillId,version:input.version});
 const saved=await source(),readModels=()=>readSkillCandidateJournal(context,input);
 const readTools=()=>tenantQuery<SkillRuntimeToolReceipt>(context.userId,`select id,user_id,run_id,call_key,tool_id,tool_version,input,input_hash,effect,status,output,approval_id
  from agent_tool_call where user_id=$1 and run_id=$2 order by call_key,id`,[context.userId,input.taskId]);
 const rows=await readModels(),tools=await readTools(),prepared=prepareSkillModelJournalAudit({...context,evaluationId:input.evaluationId,arm:input.arm},rows);
 const runtimeSnapshotHash=digest({protocol:'skill-runtime-candidate-v1',sourceHash:saved.sourceHash,taskId:input.taskId,specHash:completed.specHash});
 if(prepared.snapshotHash!==runtimeSnapshotHash||prepared.freezeId!==input.freezeId||saved.sourceHash!==completed.spec.snapshotHash)
  throw new Error('Skill runtime model journal does not match hidden task');
 const toolContext={...context,runId:input.taskId,role:completed.role,mode:completed.mode,knowledgeScope:completed.knowledgeScope,
  evaluationArm:input.arm,skillTaskSpecHash:completed.specHash};
 const wireOutputs=new Map<string,string>();
 for(const next of prepared.selected){
  const messages=z.object({messages:z.array(z.object({role:z.string(),tool_call_id:z.string().optional(),content:z.string().nullable().optional()}).passthrough())}).parse(next.row.input).messages;
  for(const message of messages)if(message.role==='tool'){
   const id=z.string().min(1).parse(message.tool_call_id),content=z.string().parse(message.content),prior=wireOutputs.get(id);
   if(prior!==undefined&&prior!==content)throw new Error('Skill runtime consumed history changed');wireOutputs.set(id,content);
  }
 }
 const reconstruction=reconstructSkillRuntimeTools(saved.snapshot,toolContext,tools,wireOutputs);let decisions=0,reconstructionFailure:Error|undefined;
 const validate=async()=>{if((await source()).sourceHash!==saved.sourceHash)throw new Error('Skill runtime audit sources changed');};
 const replay=await runSkillCandidateArm(saved.snapshot,input.arm,async request=>{
  const next=prepared.selected[decisions++];
  // The model journal validates the JSON representation persisted by PG;
  // optional undefined fields must not become extra null-valued hash entries.
  if(!next||next.row.step!==request.step||digest(next.row.input)!==digest(json({messages:request.messages,profile:request.profile,index:next.row.route_index}))){
   reconstructionFailure=new Error(`Skill runtime model input reconstruction mismatch at step ${request.step}`);throw reconstructionFailure;
  }
  return next.message;
 },validate,prepared.selected.length,undefined,undefined,async call=>{
  try{return await reconstruction.dispatch(call);}catch(error){reconstructionFailure=error instanceof Error?error:new Error('Skill runtime tool reconstruction failed');throw error;}
 });
 if(reconstructionFailure)throw reconstructionFailure;
 reconstruction.assertClosed();
 if(replay.status!=='completed'||replay.stopReason!==null||replay.reply!==completed.reply||decisions!==prepared.selected.length
  ||replay.candidateSkillUsed!==(input.arm==='candidate'))throw new Error('Skill runtime reconstructed result does not match completed task');
 if(digest(await readModels())!==digest(rows)||digest(await readTools())!==digest(tools)
  ||digest(await readCompletedSkillCandidateRuntimeTask(context,input,expectedPlan))!==digest(completed))throw new Error('Skill runtime audit records changed');
 const projection={protocol:'skill-runtime-candidate-audit-v1',ownerId:context.userId,taskId:input.taskId,evaluationId:input.evaluationId,arm:input.arm,
  freezeId:input.freezeId,sourceKind:prepared.sourceKind,taskSpecHash:completed.specHash,completedTaskHash:digest(completed),serverSnapshotHash:saved.sourceHash,runtimeSnapshotHash,
  capturedAt:new Date(Math.min(...rows.map(row=>Date.parse(row.started_at??'')))).toISOString(),completedAt:new Date(completed.completedAt).toISOString(),
  taskInputHash:saved.taskInputHash,modelConfigHash:saved.modelConfigHash,journalHash:prepared.journalHash,toolJournalHash:digest(tools),
  answerHash:digest(replay.reply),messagesHash:digest(replay.messages),traceHash:digest(replay.trace),candidateSkillUsed:replay.candidateSkillUsed,
  evidenceHash:digest(replay.trace.filter(row=>row.receiptHash).map(row=>row.receiptHash)),
  modelAttemptReceipts:prepared.ordered.map(row=>({id:row.id,hash:digest(row)})),toolReceipts:tools.map(row=>({id:row.id,hash:digest(row)})),
  selectedModels:prepared.selected.map(item=>({step:item.row.step,requestedModel:item.request.selectedRoute.model,model:item.request.originalResponse.model,
   provider:item.request.originalResponse.provider,requestHash:item.request.requestHash,receiptHash:digest(item.row),toolSchemaHash:digest(item.request.body.tools)}))};
 return {projection,projectionHash:digest(projection),graphReconstructed:true,completeModelJournalVerified:true,completeToolJournalVerified:true,
  actualModelCalls:0,productionAgentEquivalent:false,collectorProvenanceVerified:false,automaticActivation:false};
}
