import {z} from 'zod';
import {digest} from './contracts';
import {assertSkillCollector,type SkillCollectorTransaction} from './skill-model-journal';

const selection=z.object({ownerId:z.uuid(),evaluationId:z.uuid(),arm:z.enum(['baseline','candidate'])}).strict();

/** One owner of a durable evaluation arm at a time. Model receipts use a separate
 * committed transaction; rolling back ownership does not roll those receipts back.
 * The lock is released by PostgreSQL on transaction/connection loss. Recovery
 * replays the existing journal; this does not grant execution equivalence. */
export async function withSkillCandidateExecution<T>(transaction:SkillCollectorTransaction,input:z.infer<typeof selection>,
 work:(assertOwned:()=>Promise<void>)=>Promise<T>):Promise<T>{
 const pin=selection.parse(input);
 return (transaction.execution??transaction)(pin.ownerId,async client=>{
  await assertSkillCollector(client);
  const key=`skill-candidate-execution-v1:${digest(pin)}`;
  const admitted=(await client.query<{admitted:boolean}>('select pg_try_advisory_xact_lock(hashtextextended($1,0)) admitted',[key])).rows[0]?.admitted;
  if(admitted!==true)throw new Error('Skill candidate execution already owned; retry after reconciliation');
  const state=async()=>(await client.query<{role:string;owner:string;transaction_id:string}>(
   "select current_user as role,current_setting('app.current_user_id',true) as owner,pg_current_xact_id()::text as transaction_id")).rows[0];
  const initial=await state();
  if(initial?.role!=='network_copilot_skill_collector'||initial.owner!==pin.ownerId||!/^[1-9][0-9]*$/.test(initial.transaction_id))
   throw new Error('Skill candidate execution context unavailable');
  let active=true;
  const assertOwned=async()=>{
   if(!active)throw new Error('Skill candidate execution scope ended');
   const current=await state();
   if(!active||!current||current.role!==initial.role||current.owner!==initial.owner||current.transaction_id!==initial.transaction_id)
    throw new Error('Skill candidate execution ownership changed');
  };
  try{await assertOwned();const output=await work(assertOwned);await assertOwned();return output;}
  finally{active=false;}
 });
}
