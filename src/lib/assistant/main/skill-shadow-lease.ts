import type {PoolClient} from 'pg';
import {z} from 'zod';

/** Caller supplies the account-bound transaction; use wall time even in an old transaction. */
export async function assertSkillShadowLease(client:Pick<PoolClient,'query'>,context:{userId:string;jobId:string;leaseToken:string},maximumAgeSeconds:number){
 z.uuid().parse(context.userId);z.uuid().parse(context.jobId);z.uuid().parse(context.leaseToken);
 z.number().int().positive().max(1800).parse(maximumAgeSeconds);
 const current=await client.query<{valid:boolean}>(`select true as valid
  from agent_skill_shadow_job j join agent_skill_shadow_campaign c on c.id=j.campaign_id and c.owner_id=j.owner_id
  where j.id=$1 and j.owner_id=$2 and j.state='running' and j.lease_token=$3
   and j.lease_until>clock_timestamp() and c.enabled and c.expires_at>clock_timestamp()
   and j.ready_at>clock_timestamp()-($4::integer*interval '1 second')`,
 [context.jobId,context.userId,context.leaseToken,maximumAgeSeconds]);
 if(current.rows.length!==1||current.rows[0].valid!==true)throw new Error('Shadow lease or task age changed during preparation');
}
