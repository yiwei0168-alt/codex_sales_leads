import {z} from 'zod';
import {digest} from './contracts';
import {modelReplySchema} from './model';
import {orderedModeDecision} from './mode-fallback';
import {createSkillModelJournal,type SkillCollectorTransaction} from './skill-model-journal';
import type {runSkillCandidateArm} from './skill-candidate-runner';

type Decision=Parameters<Parameters<typeof runSkillCandidateArm>[2]>[0];
export type SkillCandidateRequest=(input:Decision&{index:number})=>Promise<Record<string,unknown>>;
export type SkillCandidateCollector={evaluationId:string;sourceKind:'synthetic-fixture'|'production-runner-pending-verification';transaction:SkillCollectorTransaction;request:SkillCandidateRequest};

/** Internal adapter. Request callback must separately enforce authorization and paid-call admission. */
export function createDurableSkillCandidateModel(pin:{ownerId:string;snapshotHash:string;arm:'baseline'|'candidate'},collector:SkillCandidateCollector,validate:()=>Promise<void>){
 z.uuid().parse(collector.evaluationId);
 const receipts:Array<{id:string;step:number;index:number;recovered:boolean}>=[];
 const model=async(input:Decision)=>{
  const journal=createSkillModelJournal(collector.transaction,{...pin,evaluationId:collector.evaluationId,sourceKind:collector.sourceKind,step:input.step});
  const selected=await orderedModeDecision<Record<string,unknown>>({signal:input.signal,
   begin:async index=>{
    await validate();input.signal.throwIfAborted();
    const prior=await journal.begin({messages:input.messages,profile:input.profile,index});
    receipts.push({id:prior.id,step:input.step,index,recovered:!prior.fresh});return prior;
   },
   request:async index=>{
    await validate();input.signal.throwIfAborted();
    const response=await collector.request({...input,index});
    const message=modelReplySchema.parse(response.message);
    // Stable journal call IDs, matching the production approach without a real task pin.
    if(message.tool_calls)message.tool_calls=message.tool_calls.map((call,i)=>({...call,id:`call_${digest({evaluation:collector.evaluationId,arm:pin.arm,step:input.step,index,i,id:call.id}).slice(0,40)}`}));
    return {...response,message};
   },
   save:journal.save,
  });
  await validate();input.signal.throwIfAborted();return modelReplySchema.parse(selected.message);
 };
 return {model,receipts};
}
