import {z} from 'zod';
import {tenantTransaction,withBoundTenantTransaction} from '@/lib/rag/db';
import {digest,type ExecutionContext,type ModelMessage,type RunStatus,type AgentRun} from './contracts';
import {finishRun,LeaseLostError} from './repository';
import {lockRecordedTaskRunJournals} from './skill-acceptance-run-locks';
import {assertCurrentKnowledgeMessages,SOURCE_CHANGED_REPLY} from './knowledge-message-guard';
import {assertCurrentSkillMessages,SkillContextChangedError,SKILL_CHANGED_REPLY} from './skill-message-guard';
import {assertCurrentMemoryMessages,MemoryContextChangedError,MEMORY_CHANGED_REPLY,withCurrentDecisionMemory} from './memory-message-guard';
import {assertCurrentPrivateReplayMessages} from './private-replay-guard';
import {loadDecisionMemory} from './memory-context';
import {databaseDeadline} from '../../rag/database-deadline';

type FinalState={status:RunStatus;reply:string;messages:ModelMessage[];instructionIds:string[];policyRevision?:string};
/** Ordinary main-agent settlement only. Retain DB source admission through the
 * answer/event/extraction-job commit. Never retry a callback after unknown COMMIT.
 * No callbacks, source IDs or validation assertions come from an HTTP request. */
export async function settleMainAgentRun(context:ExecutionContext,final:FinalState){
 return tenantTransaction(context.userId,client=>withBoundTenantTransaction(client,context.userId,async()=>{
  await client.query('select lock_skill_knowledge_sources()');
  const account=(await client.query<{role:string}>("select role from app_user where id=$1 and status='active' for share",[context.userId])).rows[0];
  if(!account)throw new LeaseLostError();
  if((await client.query<{n:number}>('select lock_skill_task_origins($1::uuid[]) n',[[context.runId]])).rows[0]?.n!==1)throw new LeaseLostError();
  const run=(await client.query<{input:unknown;instructions:AgentRun['instructions'];control:string|null;lease_until:Date;execution_kind:string}>(`select input,instructions,control,lease_until,execution_kind from agent_run
   where user_id=$1 and id=$2 and lease_token=$3 and status='running' and lease_until>clock_timestamp() for update`,[context.userId,context.runId,context.leaseToken])).rows[0];
  if(!run||run.execution_kind!=='main-agent')throw new LeaseLostError();
  const conversation=(await client.query<{status:string}>('select c.status from assistant_conversation c join agent_run r on r.conversation_id=c.id and r.user_id=c.user_id where r.id=$1 and r.user_id=$2',[context.runId,context.userId])).rows[0];
  if(conversation?.status!=='active')throw new LeaseLostError();
  const assertLease=async()=>{
   const now=(await client.query<{valid:boolean}>('select clock_timestamp()<$1::timestamptz as valid',[run.lease_until])).rows[0]?.valid;
   if(!now)throw new LeaseLostError();
  };
  const save=async(status:RunStatus,reply:string)=>{const saved=await finishRun(context,status,reply);await assertLease();return saved;};
  await assertLease(); // Row-lock waits can outlive the predicate's initial evaluation.
  if(run.control||['cancelled','paused'].includes(final.status))return save(run.control==='cancel'?'cancelled':run.control==='pause'?'paused':final.status,'');
  if(run.instructions.some(item=>!final.instructionIds.includes(item.id)))return save('queued','');
  const scope=z.object({knowledgeScope:z.array(z.enum(['industry','company','product'])).optional()}).passthrough().parse(run.input).knowledgeScope;
  await client.query('savepoint main_agent_final_answer');
  try{
   if(account.role!==context.role||digest(scope??null)!==digest(context.knowledgeScope??null))throw new Error('Final task role or scope changed');
   await lockRecordedTaskRunJournals(client,context.userId,[context.runId],{successfulReadSourcesOnly:true});
   // Unavailable/denied reads contain no consumed source payload. Historical
   // replay remains strict; ordinary tasks can explain these negative outcomes.
   const privateMessages=final.messages.filter(message=>message.role!=='tool'||['success','partial'].includes(JSON.parse(message.content??'{}').status));
   const validate=async()=>{
    const clock=(await client.query<{time:Date}>('select clock_timestamp() as time')).rows[0]?.time;
    if(!(clock instanceof Date))throw new Error('Final source clock unavailable');
    await assertCurrentSkillMessages(context,final.messages);
    await assertCurrentMemoryMessages(context.userId,final.messages,clock.toISOString());
    await assertCurrentKnowledgeMessages(context.userId,final.messages,scope);
    await assertCurrentPrivateReplayMessages(context.userId,privateMessages);
    if(!final.policyRevision||digest(await loadDecisionMemory(context.userId))!==final.policyRevision)throw new MemoryContextChangedError();
   };
   await validate();
   const saved=await withCurrentDecisionMemory(context.userId,async()=>{
    const settled=await save(final.status,final.reply);
    await validate();await assertLease();return settled;
   });
   await client.query('release savepoint main_agent_final_answer');return saved;
  }catch(error){
   await client.query('rollback to savepoint main_agent_final_answer');await client.query('release savepoint main_agent_final_answer');
   if(error instanceof LeaseLostError)throw error;
   await assertLease();
   const reply=error instanceof SkillContextChangedError?SKILL_CHANGED_REPLY:error instanceof MemoryContextChangedError?MEMORY_CHANGED_REPLY:SOURCE_CHANGED_REPLY;
   return save('partial',reply);
  }
 // Match the existing maximum task lease window. This transport cap never
 // grants a lease: the transaction still checks the exact DB lease repeatedly.
 }),context.role,databaseDeadline(90_000));
}
