import {buildMainAgentGraph} from './graph';
import {digest,toolResultSchema,type ModelMessage} from './contracts';
import {transportMessages} from './model';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';
import {loadRecordedTaskChain} from './recorded-task-source';

type TraceTurn={step:number;revision:number;reply:ModelMessage;request:{body:{messages:ModelMessage[]}}};
/** Reuses the production graph with journal-only dependencies. No model or business dispatcher exists here.
 * This audits mechanics, not candidate quality or live-shadow equivalence.
 */
export async function replayRecordedGraphTrace(chain:{turns:TraceTurn[]}){
 assertLocalAnalysisBoundary();
 if(!chain.turns.length)throw new Error('Recorded graph trace empty');
 const turns=structuredClone(chain.turns),withoutMemory=(messages:ModelMessage[])=>[messages[0],...messages.slice(2)];
 const receipts=new Map<string,{content:string;callHash:string}>();
 for(let i=0;i<turns.length-1;i++){
  const calls=turns[i].reply.tool_calls??[];
  for(const call of calls){
   const found=turns[i+1].request.body.messages.filter(message=>message.role==='tool'&&message.tool_call_id===call.id);
   if(found.length!==1||receipts.has(call.id)||found[0].content===null)throw new Error('Recorded graph receipt pairing invalid');
   receipts.set(call.id,{content:found[0].content,callHash:digest(call)});
  }
 }
 const boundaries=new Map<number,{users:string[];policy:boolean}>();
 for(let i=1;i<turns.length;i++){
  const previous=turns[i-1],next=turns[i],delta=next.revision-previous.revision;
  const added=withoutMemory(next.request.body.messages).slice(previous.request.body.messages.length+(previous.reply.tool_calls?.length??0));
  const users:string[]= [];let policy=false;
  for(const message of added){
   if(message.role==='user'&&message.content!==null&&!policy)users.push(message.content);
   else if(message.role==='system'&&!policy&&message.content==='Account preferences or policies changed. Replan from the current policy records before further actions.')policy=true;
   else throw new Error('Recorded boundary-event replay unsupported');
  }
  if(delta!==0&&delta!==1||delta===0&&added.length||delta===1&&!added.length)throw new Error('Recorded boundary-event replay unsupported');
  if(delta===1)boundaries.set(i,{users,policy});
 }
 let cursor=0,toolCount=0,pending=0,policyRevision='initial',failure:string|null=null;
 const applied=new Set<number>(),instructions:Array<{id:string;content:string}>=[];
 const consumed=new Set<string>();
 const graph=buildMainAgentGraph({
  boundary:async()=>{
   assertLocalAnalysisBoundary();
   const change=boundaries.get(cursor);
   if(change&&pending===0&&!applied.has(cursor)){
    applied.add(cursor);instructions.push(...change.users.map((content,i)=>({id:`recorded-${cursor}-${i}`,content})));
    if(change.policy)policyRevision=`recorded-policy-${cursor}`;
   }
   return {control:null,instructions,policyRevision};
  },
  model:async(messages,step,revision)=>{
   const turn=turns[cursor];
   if(!turn||turn.step!==step||turn.revision!==revision||digest(transportMessages(messages))!==digest(withoutMemory(turn.request.body.messages))){
    failure='Recorded graph model boundary diverged';throw new Error(failure);
   }
   cursor++;pending=turn.reply.tool_calls?.length??0;return structuredClone(turn.reply);
  },
  tool:async call=>{
   const receipt=receipts.get(call.id);
   if(!receipt||consumed.has(call.id)||receipt.callHash!==digest(call))throw new Error('Recorded graph requested an unbound action');
   consumed.add(call.id);toolCount++;pending--;
   // Preserve the exact persisted serialization; defaults must not invent fields in old receipts.
   const parsed=JSON.parse(receipt.content);toolResultSchema.parse(parsed);return parsed;
  },
 });
 const final=await graph.invoke({messages:withoutMemory(turns[0].request.body.messages),pending:[],steps:0,
  status:'running',reply:'',seen:{},instructionIds:[],decisionRevision:turns[0].revision,policyRevision:'initial'},{recursionLimit:1000});
 assertLocalAnalysisBoundary();
 if(failure)throw new Error(failure);
 const last=turns.at(-1)!;
 if(final.status!=='completed'||cursor!==turns.length||consumed.size!==receipts.size||final.reply!==last.reply.content
  ||digest(transportMessages(final.messages))!==digest([...withoutMemory(last.request.body.messages),last.reply]))throw new Error('Recorded graph did not reproduce the completed task');
 return {productionGraphReused:true as const,recordedDecisions:cursor,recordedTools:toolCount,recordedBoundaryChanges:applied.size,
  finalReplyHash:digest(final.reply),finalMessagesHash:digest(final.messages),modelCalls:0,businessToolExecutions:0,
  liveShadow:false as const,qualityAccepted:false as const};
}
/** Dedicated local-analysis entry: authoritative source checks before and after the in-memory run. */
export async function auditRecordedGraphExecution(context:{userId:string},input:{runId:string}){
 assertLocalAnalysisBoundary();
 const before=await loadRecordedTaskChain(context,input);
 const audit=await replayRecordedGraphTrace(before);
 const after=await loadRecordedTaskChain(context,input);
 if(digest(before)!==digest(after))throw new Error('Recorded task sources changed during graph audit');
 return {...audit,sourceHash:before.sourceHash,chainHash:before.chainHash,executionAuthorized:false as const};
}
