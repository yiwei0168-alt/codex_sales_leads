import {z} from 'zod';
import type {PoolClient} from 'pg';
import {digest} from './contracts';
import {modeConfigSchema} from './mode-config';
import {modelReplySchema} from './model';
import {auditModelProtocol} from './model-protocol-audit';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';

const sha=z.string().regex(/^[a-f0-9]{64}$/);
const inputSchema=z.object({messages:z.array(modelReplySchema.extend({role:z.enum(['system','user','assistant','tool']),content:z.string().nullable(),tool_call_id:z.string().optional()})).min(1),profile:modeConfigSchema,index:z.number().int().min(0).max(2)}).strict();
const bindingSchema=z.object({ownerId:z.uuid(),evaluationId:z.uuid(),arm:z.enum(['baseline','candidate']),step:z.number().int().min(0),freezeId:z.uuid().optional(),snapshotHash:sha,sourceKind:z.enum(['synthetic-fixture','production-runner-pending-verification'])}).strict();
const outputSchema=z.discriminatedUnion('status',[
 z.object({status:z.literal('success'),data:z.object({value:z.record(z.string(),z.unknown())}).strict()}).strict(),
 z.object({status:z.literal('unavailable'),data:z.object({retryable:z.boolean(),reason:z.string().min(1).max(100),transportFailureReceipt:z.unknown().optional()}).strict()}).strict(),
]);
type Row={freeze_id?:string|null;id:string;owner_id:string;evaluation_id:string;arm:string;step:number;route_index:number;source_kind:string;snapshot_hash:string;input:unknown;input_hash:string};
/** Must commit before returning. Supplied by a dedicated collector connection, never HTTP input. */
export type SkillCollectorTransaction=<T>(ownerId:string,work:(client:PoolClient)=>Promise<T>)=>Promise<T>;
export async function assertSkillCollector(client:PoolClient){
 const role=(await client.query<{name:string;super:boolean;bypass:boolean}>('select current_user as name,rolsuper as super,rolbypassrls as bypass from pg_roles where rolname=current_user')).rows[0];
 if(!role||role.name!=='network_copilot_skill_collector'||role.super||role.bypass)throw new Error('Dedicated restricted Skill collector required');
}
function checkOutput(input:unknown,value:unknown){
 const output=outputSchema.parse(value);
 if(output.status==='success'){
  modelReplySchema.parse(output.data.value.message);
  if(!auditModelProtocol({input,input_hash:digest(input),output}).bound)throw new Error('Skill model response wire binding invalid');
 }
 return output;
}

/** Append-only PostgreSQL receipts. Hashes detect tampering; collector authenticity is a separate gate. */
export function createSkillModelJournal(transaction:SkillCollectorTransaction,binding:z.infer<typeof bindingSchema>){
 const pin=bindingSchema.parse(binding);
 return {
  async begin(input:unknown){
   assertLocalAnalysisBoundary();const request=inputSchema.parse(input),hash=digest(request);
   return transaction(pin.ownerId,async client=>{
    await assertSkillCollector(client);
    const inserted=await client.query<{id:string}>(`insert into agent_skill_model_attempt(owner_id,evaluation_id,arm,step,route_index,source_kind,snapshot_hash,input,input_hash,freeze_id)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict(owner_id,evaluation_id,arm,step,route_index) do nothing returning id`,
    [pin.ownerId,pin.evaluationId,pin.arm,pin.step,request.index,pin.sourceKind,pin.snapshotHash,JSON.stringify(request),hash,pin.freezeId??null]);
    const row=(await client.query<Row>(`select * from agent_skill_model_attempt where owner_id=$1 and evaluation_id=$2 and arm=$3 and step=$4 and route_index=$5`,
     [pin.ownerId,pin.evaluationId,pin.arm,pin.step,request.index])).rows[0];
    if(!row||(row.freeze_id??null)!==(pin.freezeId??null)||row.input_hash!==hash||digest(row.input)!==hash||row.snapshot_hash!==pin.snapshotHash||row.source_kind!==pin.sourceKind)throw new Error('Skill model attempt binding changed');
    const saved=(await client.query<{output:unknown;output_hash:string}>('select output,output_hash from agent_skill_model_outcome where owner_id=$1 and attempt_id=$2',[pin.ownerId,row.id])).rows[0];
    if(saved&&digest(saved.output)!==saved.output_hash)throw new Error('Skill model outcome changed');
    return {id:row.id,fresh:inserted.rows.length===1,output:saved?checkOutput(row.input,saved.output):null};
   });
  },
  async save(id:string,index:number,outcome:{status:'success';value:unknown}|{status:'unavailable';retryable:boolean;reason:string;transportFailureReceipt?:unknown}){
   assertLocalAnalysisBoundary();z.uuid().parse(id);z.number().int().min(0).max(2).parse(index);
   return transaction(pin.ownerId,async client=>{
    await assertSkillCollector(client);
    const row=(await client.query<Row>(`select * from agent_skill_model_attempt where id=$1 and owner_id=$2 and evaluation_id=$3 and arm=$4 and step=$5 and route_index=$6`,[id,pin.ownerId,pin.evaluationId,pin.arm,pin.step,index])).rows[0];
    if(!row||(row.freeze_id??null)!==(pin.freezeId??null)||row.snapshot_hash!==pin.snapshotHash||row.source_kind!==pin.sourceKind||digest(row.input)!==row.input_hash)throw new Error('Skill model attempt unavailable');
    const output=checkOutput(row.input,outcome.status==='success'?{status:'success',data:{value:outcome.value}}:{status:'unavailable',data:{retryable:outcome.retryable,reason:outcome.reason,
     ...(outcome.transportFailureReceipt!==undefined?{transportFailureReceipt:outcome.transportFailureReceipt}:{})}});
    await client.query('insert into agent_skill_model_outcome(attempt_id,owner_id,output,output_hash) values($1,$2,$3,$4) on conflict(attempt_id) do nothing',[id,pin.ownerId,JSON.stringify(output),digest(output)]);
    const saved=(await client.query<{output:unknown;output_hash:string}>('select output,output_hash from agent_skill_model_outcome where owner_id=$1 and attempt_id=$2',[pin.ownerId,id])).rows[0];
    if(!saved||saved.output_hash!==digest(output)||digest(saved.output)!==digest(output))throw new Error('Skill model outcome conflict');
   });
  },
 };
}
