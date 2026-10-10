import {createHash} from 'node:crypto';
import {z} from 'zod';
import {tenantTransaction} from '@/lib/rag/db';
import {observeMemoryInTransaction,type MemoryObservationInput} from './temporal-memory';

export const memoryCorrectionSchema=z.object({
  id:z.uuid(),content:z.string().trim().min(3).max(800),reason:z.string().trim().max(500).default(''),
}).strict();
type Target={id:string;kind:MemoryObservationInput['kind'];content:string;memory_key:string|null;
  market_code:string|null;company_id:string|null;market_codes:string[];company_ids:string[];
  valid_from:string|null;valid_until:string|null;confidence:number|null;invalidates_id:string|null;
  source_receipt:Record<string,unknown>};

/** An authenticated user's explicit correction; never a model-selected replacement. */
export async function correctMemory(userId:string,input:z.input<typeof memoryCorrectionSchema>){
  const p=memoryCorrectionSchema.parse(input);
  return tenantTransaction(userId,async client=>{
    const target=(await client.query<Target>(`select id,kind,content,memory_key,market_code,company_id,
      market_codes,company_ids,valid_from,valid_until,confidence,invalidates_id,source_receipt
      from agent_memory_observation where owner_id=$1 and id=$2`,[userId,p.id])).rows[0];
    if(!target)throw new Error('Memory target is unavailable');
    // Legacy observations mirror an independently versioned store. Its original editor owns updates.
    if(String(target.source_receipt.type).startsWith('agent-memory-'))throw new Error('Use original memory editor');
    if(target.invalidates_id)throw new Error('Memory version changed');
    if(target.content===p.content)throw new Error('Memory correction is unchanged');
    if(target.memory_key)await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[
      `${userId}:${target.kind}:${target.memory_key}:${target.market_code??''}:${target.company_id??''}:${target.market_codes.join(',')}:${target.company_ids.join(',')}`]);
    await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`memory-target:${userId}:${p.id}`]);
    const key=`user-correction:${p.id}:${createHash('sha256').update(JSON.stringify([p.content,p.reason])).digest('hex')}`;
    const replay=(await client.query<{id:string}>('select id from agent_memory_observation where owner_id=$1 and idempotency_key=$2',[userId,key])).rows[0];
    if(replay)return replay.id;
    const replaced=await client.query('select id from agent_memory_observation where owner_id=$1 and (corrects_id=$2 or invalidates_id=$2) limit 1',[userId,p.id]);
    if(replaced.rows.length)throw new Error('Memory version changed');
    return observeMemoryInTransaction(client,userId,{
      kind:target.kind,content:p.content,memoryKey:target.memory_key??undefined,
      marketCode:target.market_code??undefined,companyId:target.company_id??undefined,
      marketCodes:target.market_codes,companyIds:target.company_ids,
      validFrom:target.valid_from,validUntil:target.valid_until,
      confidence:target.confidence===null?undefined:Math.min(target.confidence,0.7),
      correctsId:p.id,idempotencyKey:key,
      sourceReceipt:{type:'user-correction',targetId:p.id,sourceQuote:p.content,reason:p.reason,
        usage:'unverified-internal-only',successVerified:false,observationBasis:'user-correction'},
    });
  });
}
