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
 if(!chain.turns.length||chain.turns.some(turn=>turn.revision!==0))throw new Error('Interrupted graph trace needs boundary-event replay');
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
 let cursor=0,toolCount=0,failure:string|null=null;
 const consumed=new Set<string>();
 const graph=buildMainAgentGraph({
  boundary:async()=>{assertLocalAnalysisBoundary();return {control:null,instructions:[]};},
  model:async(messages,step,revision)=>{
   const turn=turns[cursor];
   if(!turn||turn.step!==step||turn.revision!==revision||digest(transportMessages(messages))!==digest(withoutMemory(turn.request.body.messages))){
    failure='Recorded graph model boundary diverged';throw new Error(failure);
   }
   cursor++;return structuredClone(turn.reply);
  },
  tool:async call=>{
   const receipt=receipts.get(call.id);
   if(!receipt||consumed.has(call.id)||receipt.callHash!==digest(call))throw new Error('Recorded graph requested an unbound action');
   consumed.add(call.id);toolCount++;
   // Preserve the exact persisted serialization; defaults must not invent fields in old receipts.
   const parsed=JSON.parse(receipt.content);toolResultSchema.parse(parsed);return parsed;
  },
 });
 const final=await graph.invoke({messages:withoutMemory(turns[0].request.body.messages),pending:[],steps:0,
  status:'running',reply:'',seen:{},instructionIds:[],decisionRevision:0,policyRevision:''},{recursionLimit:1000});
 assertLocalAnalysisBoundary();
 if(failure)throw new Error(failure);
 const last=turns.at(-1)!;
 if(final.status!=='completed'||cursor!==turns.length||consumed.size!==receipts.size||final.reply!==last.reply.content
  ||digest(transportMessages(final.messages))!==digest([...withoutMemory(last.request.body.messages),last.reply]))throw new Error('Recorded graph did not reproduce the completed task');
 return {productionGraphReused:true as const,recordedDecisions:cursor,recordedTools:toolCount,
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
