import type {PoolClient} from 'pg';
import {z} from 'zod';

type Receipt={tool:string;input:unknown};
/** Capture the next clock-driven change while the caller retains memory source
 * admission. Fixed historical clocks remain fixed; ordinary decision memory is
 * always current and therefore always contributes its activation/expiry times.
 * This returns no memory contents and is not an activation qualification. */
export async function captureSkillMemoryTimeFence(client:PoolClient,userId:string,receipts:readonly Receipt[]){
 z.uuid().parse(userId);
 let movingBusiness=false,movingKnowledge=false;
 for(const receipt of receipts){
  if(receipt.tool!=='memory_observation_search')continue;
  const input=z.object({businessAt:z.iso.datetime().optional(),knownAt:z.iso.datetime().optional()}).passthrough().parse(receipt.input);
  movingBusiness||=input.businessAt===undefined;movingKnowledge||=input.knownAt===undefined;
 }
 const row=(await client.query<{checked_at:Date;valid_before:Date|null}>(`
  with checked as materialized(select clock_timestamp() checked_at), boundaries as (
   select m.valid_from boundary from agent_memory m where m.active
   union all select m.valid_until from agent_memory m where m.active
   union all select m.valid_from from agent_memory_observation m where m.owner_id=$1 and $2::boolean
   union all select m.valid_until from agent_memory_observation m where m.owner_id=$1 and $2::boolean
   union all select m.recorded_at from agent_memory_observation m where m.owner_id=$1 and $3::boolean
   union all select c.created_at from agent_memory_conflict c where c.owner_id=$1 and $3::boolean
   union all select c.resolved_at from agent_memory_conflict c where c.owner_id=$1 and $3::boolean
  ) select checked_at,(select min(boundary) from boundaries where boundary>checked_at) valid_before from checked`,
 [userId,movingBusiness,movingKnowledge])).rows[0];
 if(!(row?.checked_at instanceof Date)||!Number.isFinite(row.checked_at.getTime())
  ||row.valid_before!==null&&(!(row.valid_before instanceof Date)||!Number.isFinite(row.valid_before.getTime())||row.valid_before<=row.checked_at))
  throw new Error('Acceptance memory time fence unavailable');
 return {memoryTimeFenceRevalidated:true as const,memoryTimeCheckedAt:row.checked_at.toISOString(),
  memoryTimeValidBefore:row.valid_before?.toISOString()??null};
}

export function earliestSkillMemoryTimeFence(...fences:Array<{memoryTimeValidBefore:string|null}>){
 const values=fences.map(fence=>fence.memoryTimeValidBefore).filter((value):value is string=>value!==null);
 if(!values.length)return undefined;
 return new Date(Math.min(...values.map(value=>Date.parse(z.iso.datetime().parse(value))))).toISOString();
}
