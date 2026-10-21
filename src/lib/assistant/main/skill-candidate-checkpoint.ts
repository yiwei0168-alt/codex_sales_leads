import {z} from 'zod';
import type {PoolClient} from 'pg';
import {digest,runStatuses} from './contracts';
import {modelReplySchema} from './model';
import {assertSkillCollector,type SkillCollectorTransaction} from './skill-model-journal';

const sha=z.string().regex(/^[a-f0-9]{64}$/),token=z.string().regex(/^[1-9][0-9]*$/);
const strings=z.array(z.string()).max(2000).refine(values=>new Set(values).size===values.length);
export const skillCandidateCheckpointSchema=z.object({
 protocol:z.literal('skill-candidate-graph-checkpoint-v1'),inputHash:sha,arm:z.enum(['baseline','candidate']),maximumModelCalls:z.number().int().min(1).max(64),
 state:z.object({messages:z.array(modelReplySchema.extend({role:z.enum(['system','user','assistant','tool']),content:z.string().nullable(),tool_call_id:z.string().optional()})).max(5000),
  pending:modelReplySchema.shape.tool_calls.unwrap(),steps:z.number().int().min(0).max(80),status:z.enum(runStatuses),reply:z.string(),
   seen:z.record(z.string(),z.number().int().nonnegative()),instructionIds:z.array(z.string()),decisionRevision:z.number().int().nonnegative(),policyRevision:z.string(),
   runtimeMetadata:z.record(z.string(),z.unknown()).optional()}).strict(),
 calls:z.number().int().min(0).max(64),stopReason:z.string().nullable(),candidateSkillUsed:z.boolean(),described:strings,seenCalls:strings,
 trace:z.array(z.object({id:z.string(),name:z.string(),argumentsHash:sha,outputHash:sha,receiptHash:sha.optional()}).strict()).max(2000),
}).strict();
export type SkillCandidateCheckpoint=z.infer<typeof skillCandidateCheckpointSchema>;
export type SkillCandidateCheckpointStore={load:()=>Promise<SkillCandidateCheckpoint|null>;save:(value:SkillCandidateCheckpoint)=>Promise<void>};
const binding=z.object({ownerId:z.uuid(),evaluationId:z.uuid(),arm:z.enum(['baseline','candidate']),snapshotHash:sha,
 freezeId:z.uuid().optional(),sourceKind:z.enum(['synthetic-fixture','production-runner-pending-verification'])}).strict();

/** Retain the lease row through the checkpoint commit. An earlier external
 * ownership check cannot fence a delayed claim or write after takeover. */
export async function retainCheckpointLease(client:PoolClient,pin:z.infer<typeof binding>,executionToken:string){
 const available=(await client.query<{available:boolean}>("select to_regclass('public.agent_skill_candidate_execution_lease') is not null available")).rows[0]?.available;
 if(!available){if(pin.sourceKind==='synthetic-fixture')return;throw new Error('Skill candidate checkpoint lease schema unavailable');}
 const args=[pin.ownerId,pin.evaluationId,pin.arm,executionToken,pin.sourceKind,pin.freezeId??null];
 await client.query("set local lock_timeout='1s'");
 await client.query(`select execution_token from agent_skill_candidate_execution_lease
  where owner_id=$1 and evaluation_id=$2 and arm=$3 for share`,args.slice(0,3));
 // Check wall time after acquiring the lock, rather than retaining a condition
 // evaluated before a lock wait. A brief renewal may finish first; the one-second
 // lock budget remains bounded and never extends the execution lease.
 const row=(await client.query(`select 1 from agent_skill_candidate_execution_lease
  where owner_id=$1 and evaluation_id=$2 and arm=$3 and execution_token=$4
   and source_kind=$5 and freeze_id is not distinct from $6::uuid
   and status='running' and control is null and lease_until>clock_timestamp()
   and (valid_until is null or valid_until>clock_timestamp())`,args)).rows[0];
 if(!row)throw new Error('Skill candidate checkpoint lease ownership changed');
}

/** Call only inside the retained execution-ownership scope. Its transaction ID
 * fences late writes after a newer owner claims the same persisted checkpoint. */
export async function prepareSkillCandidateCheckpoint(transaction:SkillCollectorTransaction,input:z.infer<typeof binding>,executionToken:string,
 assertOwned:()=>Promise<void>):Promise<SkillCandidateCheckpointStore|undefined>{
 const pin=binding.parse(input);token.parse(executionToken);await assertOwned();
 const saved=await transaction(pin.ownerId,async client=>{
  await assertSkillCollector(client);
  const available=(await client.query<{available:boolean}>("select to_regclass('public.agent_skill_candidate_checkpoint') is not null available")).rows[0]?.available;
  if(available!==true){if(pin.sourceKind==='synthetic-fixture')return undefined;throw new Error('Skill candidate checkpoint schema unavailable');}
  await retainCheckpointLease(client,pin,executionToken);
  const row=(await client.query<{revision:string;payload:unknown;payload_hash:string|null}>(`insert into agent_skill_candidate_checkpoint
   (owner_id,evaluation_id,arm,snapshot_hash,freeze_id,source_kind,execution_token) values($1,$2,$3,$4,$5,$6,$7)
   on conflict(owner_id,evaluation_id,arm) do update set execution_token=excluded.execution_token,updated_at=clock_timestamp()
   where agent_skill_candidate_checkpoint.snapshot_hash=excluded.snapshot_hash
    and agent_skill_candidate_checkpoint.freeze_id is not distinct from excluded.freeze_id
    and agent_skill_candidate_checkpoint.source_kind=excluded.source_kind returning revision,payload,payload_hash`,
  [pin.ownerId,pin.evaluationId,pin.arm,pin.snapshotHash,pin.freezeId??null,pin.sourceKind,executionToken])).rows[0];
  if(!row||!/^(0|[1-9][0-9]*)$/.test(row.revision))throw new Error('Skill candidate checkpoint binding changed');
  if(row.payload!==null&&digest(row.payload)!==row.payload_hash)throw new Error('Skill candidate checkpoint payload changed');
  await retainCheckpointLease(client,pin,executionToken);
  return {revision:row.revision,payload:row.payload===null?null:skillCandidateCheckpointSchema.parse(row.payload)};
 });
 await assertOwned();if(!saved)return undefined;
 let revision=saved.revision,payload=saved.payload;
 return {
  load:async()=>{await assertOwned();return structuredClone(payload);},
  save:async value=>{
   await assertOwned();const next=skillCandidateCheckpointSchema.parse(JSON.parse(JSON.stringify(value)));
   const updated=await transaction(pin.ownerId,async client=>{
    await assertSkillCollector(client);
    await retainCheckpointLease(client,pin,executionToken);
    const row=(await client.query<{revision:string}>(`update agent_skill_candidate_checkpoint set payload=$1,payload_hash=$2,
     revision=revision+1,updated_at=clock_timestamp() where owner_id=$3 and evaluation_id=$4 and arm=$5
      and execution_token=$6 and revision=$7::bigint and snapshot_hash=$8 returning revision`,
    [JSON.stringify(next),digest(next),pin.ownerId,pin.evaluationId,pin.arm,executionToken,revision,pin.snapshotHash])).rows[0];
    await retainCheckpointLease(client,pin,executionToken);return row;
   });
   if(!updated)throw new Error('Skill candidate checkpoint ownership or revision changed');
   revision=updated.revision;payload=next;await assertOwned();
  },
 };
}
