import {z} from 'zod';
import {performance} from 'node:perf_hooks';
import type {PoolClient} from 'pg';
import {assertSkillCollector,type SkillCollectorTransaction} from './skill-model-journal';
import {withSkillCandidateExecution} from './skill-candidate-execution';

const selection=z.object({ownerId:z.uuid(),evaluationId:z.uuid(),arm:z.enum(['baseline','candidate']),
 sourceKind:z.enum(['synthetic-fixture','production-runner-pending-verification']),freezeId:z.uuid().optional(),expiresAt:z.iso.datetime().optional()}).strict()
 .refine(value=>value.sourceKind!=='production-runner-pending-verification'||Boolean(value.freezeId&&value.expiresAt))
 .refine(value=>!value.freezeId||Boolean(value.expiresAt));
const currentFreeze=`(l.freeze_id is null or exists(select 1 from agent_skill_acceptance_freeze f
 where f.id=l.freeze_id and f.owner_id=l.owner_id and f.frozen_at<=clock_timestamp()
  and (f.plan_draft->>'expiresAt')::timestamptz>clock_timestamp()
  and not exists(select 1 from agent_skill_acceptance_freeze_revocation r where r.freeze_id=f.id)))`;
const LEASE_MS=90_000,HEARTBEAT_MS=20_000;

/** Same 90s/20s windows as the main Worker. Database time and a conservative
 * monotonic local deadline fence expired workers; model journals stay separate. */
export async function withSkillCandidateLease<T>(transaction:SkillCollectorTransaction,input:z.infer<typeof selection>,
 work:(assertOwned:()=>Promise<void>,executionToken:string,signal:AbortSignal)=>Promise<T>):Promise<T>{
 const pin=selection.parse(input),channel=transaction.execution??transaction;
 const database=<R>(task:(client:PoolClient)=>Promise<R>)=>channel(pin.ownerId,async client=>{await assertSkillCollector(client);return task(client);});
 const available=await database(async client=>(await client.query<{available:boolean}>("select to_regclass('public.agent_skill_candidate_execution_lease') is not null available")).rows[0]?.available);
 if(available!==true){
  if(pin.sourceKind!=='synthetic-fixture')throw new Error('Skill candidate execution lease schema unavailable');
  const controller=new AbortController();
  try{return await withSkillCandidateExecution(transaction,{ownerId:pin.ownerId,evaluationId:pin.evaluationId,arm:pin.arm},(check,token)=>work(check,token,controller.signal));}
  finally{controller.abort();}
 }
 const started=performance.now();
 const claim=await database(async client=>{
  await client.query("set local lock_timeout='1s'");
  return (await client.query<{execution_token:string;remaining_ms:number}>(`insert into agent_skill_candidate_execution_lease as l
   (owner_id,evaluation_id,arm,source_kind,freeze_id,valid_until,execution_token,status,lease_until)
   select $1,$2,$3,$4,$5,$6,pg_current_xact_id()::text,'running',least(clock_timestamp()+interval '90 seconds',$6::timestamptz)
   where ($6::timestamptz is null or $6::timestamptz>clock_timestamp()) and ($5::uuid is null or exists(
    select 1 from agent_skill_acceptance_freeze f where f.id=$5 and f.owner_id=$1 and f.frozen_at<=clock_timestamp()
     and (f.plan_draft->>'expiresAt')::timestamptz >= $6::timestamptz
     and not exists(select 1 from agent_skill_acceptance_freeze_revocation r where r.freeze_id=f.id)))
   on conflict(owner_id,evaluation_id,arm) do update set execution_token=excluded.execution_token,status='running',
    valid_until=excluded.valid_until,lease_until=excluded.lease_until,updated_at=clock_timestamp()
   where l.control is null and (l.status='released' or l.lease_until<=clock_timestamp())
    and l.source_kind=excluded.source_kind and l.freeze_id is not distinct from excluded.freeze_id
   returning execution_token,floor(extract(epoch from (lease_until-clock_timestamp()))*1000)::integer remaining_ms`,
  [pin.ownerId,pin.evaluationId,pin.arm,pin.sourceKind,pin.freezeId??null,pin.expiresAt??null])).rows[0];
 });
 if(!claim||!/^[1-9][0-9]*$/.test(claim.execution_token))throw new Error('Skill candidate execution already owned or controlled');
 const controller=new AbortController();let active=true,pending=false,deadline:ReturnType<typeof setTimeout>|undefined;
 const lost=()=>controller.abort(new Error('Skill candidate execution lease lost or controlled'));
 const armDeadline=(at:number,remaining:number)=>{
  clearTimeout(deadline);const duration=Math.floor(at+Math.min(LEASE_MS,remaining)-performance.now());
  if(duration<=0)lost();else deadline=setTimeout(lost,duration);
 };
 armDeadline(started,claim.remaining_ms);
 const args=[pin.ownerId,pin.evaluationId,pin.arm,claim.execution_token];
 const timer=setInterval(()=>{
  if(!active||pending||controller.signal.aborted)return;pending=true;const at=performance.now();
  void database(async client=>{
   const locked=await client.query(`select execution_token from agent_skill_candidate_execution_lease
    where owner_id=$1 and evaluation_id=$2 and arm=$3 and execution_token=$4 for update nowait`,args);
   if(!locked.rowCount)return undefined;
   return (await client.query<{remaining_ms:number}>(`update agent_skill_candidate_execution_lease l
   set lease_until=least(clock_timestamp()+interval '90 seconds',valid_until),updated_at=clock_timestamp()
   where owner_id=$1 and evaluation_id=$2 and arm=$3 and execution_token=$4 and status='running'
    and control is null and lease_until>clock_timestamp() and ${currentFreeze}
   returning floor(extract(epoch from (lease_until-clock_timestamp()))*1000)::integer remaining_ms`,args)).rows[0];
  })
   .then(row=>{if(active){if(row)armDeadline(at,row.remaining_ms);else lost();}}).catch(error=>{
    // Our checkpoint transaction retains a shared lock on this same row. A
    // NOWAIT conflict confirms no renewal; keep the previously confirmed local
    // deadline and retry only on the next normal tick. Never extend on conflict.
    if((error as {code?:unknown})?.code!=='55P03')lost();
   }).finally(()=>{pending=false;});
 },HEARTBEAT_MS);
 const assertOwned=async()=>{
  if(!active)throw new Error('Skill candidate execution scope ended');controller.signal.throwIfAborted();
  const alive=await database(async client=>(await client.query<{alive:boolean}>(`select exists(select 1 from agent_skill_candidate_execution_lease l
   where owner_id=$1 and evaluation_id=$2 and arm=$3 and execution_token=$4 and status='running'
    and control is null and lease_until>clock_timestamp() and ${currentFreeze}) alive`,args)).rows[0]?.alive);
  if(alive!==true)lost();controller.signal.throwIfAborted();
  if(!active)throw new Error('Skill candidate execution scope ended');
 };
 try{await assertOwned();const result=await work(assertOwned,claim.execution_token,controller.signal);await assertOwned();return result;}
 finally{
  active=false;clearInterval(timer);clearTimeout(deadline);controller.abort();
  await database(client=>client.query(`update agent_skill_candidate_execution_lease set status='released',lease_until=null,updated_at=clock_timestamp()
   where owner_id=$1 and evaluation_id=$2 and arm=$3 and execution_token=$4`,args)).catch(()=>{});
 }
}
