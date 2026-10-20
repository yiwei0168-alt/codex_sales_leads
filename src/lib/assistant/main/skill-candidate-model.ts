import {z} from 'zod';
import {runJournaledModeModel} from './journaled-mode-model';
import {createSkillModelJournal,type SkillCollectorTransaction} from './skill-model-journal';
import type {runSkillCandidateArm} from './skill-candidate-runner';
import type {skillAcceptancePlanSchema} from './skill-acceptance-policy';

type Decision=Parameters<Parameters<typeof runSkillCandidateArm>[2]>[0];
export type SkillCandidateRequest=(input:Decision&{index:number})=>Promise<Record<string,unknown>>;
export type SkillCandidateCollector={evaluationId:string;sourceKind:'synthetic-fixture'|'production-runner-pending-verification';transaction:SkillCollectorTransaction;request:SkillCandidateRequest;
 frozen?:{freezeId:string;plan:z.infer<typeof skillAcceptancePlanSchema>}};

/** Internal adapter. Request callback must separately enforce authorization and paid-call admission. */
export function createDurableSkillCandidateModel(pin:{ownerId:string;snapshotHash:string;arm:'baseline'|'candidate'},collector:SkillCandidateCollector,validate:()=>Promise<void>){
 z.uuid().parse(collector.evaluationId);
 const receipts:Array<{id:string;step:number;index:number;recovered:boolean}>=[];
 const model=async(input:Decision)=>{
  const journal=createSkillModelJournal(collector.transaction,{...pin,evaluationId:collector.evaluationId,sourceKind:collector.sourceKind,step:input.step,...(collector.frozen?{freezeId:collector.frozen.freezeId}:{})});
  const selected=await runJournaledModeModel<Record<string,unknown>>({signal:input.signal,
   callScope:index=>({evaluation:collector.evaluationId,arm:pin.arm,step:input.step,index}),
   begin:async index=>{
    await validate();input.signal.throwIfAborted();
    const prior=await journal.begin({messages:input.messages,profile:input.profile,index});
    receipts.push({id:prior.id,step:input.step,index,recovered:!prior.fresh});return prior;
   },
   request:async index=>{
    await validate();input.signal.throwIfAborted();
    return collector.request({...input,index});
   },
   save:journal.save,
  });
  await validate();input.signal.throwIfAborted();return selected.message;
 };
 return {model,receipts};
}
