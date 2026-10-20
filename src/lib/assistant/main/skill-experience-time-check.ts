import type {PoolClient} from 'pg';
import {z} from 'zod';
import {skillAcceptanceRunIds} from './skill-acceptance-run-locks';

type Artifact=Parameters<typeof skillAcceptanceRunIds>[0]&{plan:{pin:{ownerId:string;skillId:string;version:number};expiresAt:string}};
const signedDeadlinesSchema=z.object({runnerDeclarationValidBefore:z.iso.datetime().optional(),transportValidBefore:z.iso.datetime().optional(),runtimePackageValidBefore:z.iso.datetime().optional(),memoryTimeValidBefore:z.iso.datetime().optional()}).strict();
/** Full provenance and source locks must already be established. Recheck every
 * target/pinned method's local-experience clock at one database instant after
 * preparation, including previously authenticated signature deadlines. The
 * returned time is not a lease or permission to activate. */
export async function revalidateLockedSkillExperienceTimes(client:PoolClient,userId:string,artifact:Artifact,signedDeadlines:z.infer<typeof signedDeadlinesSchema>={}){
 z.uuid().parse(userId);
 const pin=z.object({ownerId:z.uuid(),skillId:z.uuid(),version:z.number().int().positive()}).passthrough().parse(artifact.plan.pin);
 if(pin.ownerId!==userId)throw new Error('Acceptance experience time owner changed');
 const expiresAt=z.iso.datetime().parse(artifact.plan.expiresAt),runs=skillAcceptanceRunIds(artifact);
 const deadlines=signedDeadlinesSchema.parse(signedDeadlines);
 const signedUntil=Math.min(Date.parse(expiresAt),...Object.values(deadlines).filter((value):value is string=>typeof value==='string').map(Date.parse));
 const row=(await client.query<{checked_at:Date;valid:boolean;observation_count:number;valid_before:Date}>(`
  with checked as materialized(select clock_timestamp() checked_at), target as (
   select v.skill_id,v.version,v.source,v.validation from agent_skill_version v join agent_skill s on s.id=v.skill_id
   where s.owner_id=$1 and s.id=$3 and v.version=$4
  ), methods as (
   select * from target union
   select v.skill_id,v.version,v.source,v.validation from agent_run_skill p join agent_skill_version v
    on v.skill_id=p.skill_id and v.version=p.version where p.user_id=$1 and p.run_id=any($2::uuid[])
  ), local_methods as (
   select validation,case when jsonb_typeof(validation->'sourceObservations')='array'
    then validation->'sourceObservations' else '[]'::jsonb end refs from methods
   where source like 'local-experience:%' or validation->>'sourceQuality'='repeated-user-report-unverified'
  ), refs as (
   select distinct (ref.value->>'observationId')::uuid id from local_methods
   cross join lateral jsonb_array_elements(local_methods.refs) as ref(value)
  ), observations as (
   select r.id,m.id source_id,m.valid_from,m.valid_until from refs r
   left join agent_memory_observation m on m.id=r.id and m.owner_id=$1
  ) select checked_at,
   exists(select 1 from target) and checked_at<$5::timestamptz
   and not exists(select 1 from local_methods where jsonb_typeof(validation->'sourceObservations') is distinct from 'array'
    or jsonb_array_length(refs)<2 or jsonb_array_length(refs)>10)
   and not exists(select 1 from observations where source_id is null or id is null
    or (valid_from is not null and valid_from>checked_at) or (valid_until is not null and valid_until<=checked_at)) as valid,
   (select count(*)::integer from refs) observation_count,
   least($5::timestamptz,coalesce((select min(valid_until) from observations),$5::timestamptz)) valid_before
  from checked`,[userId,runs,pin.skillId,pin.version,expiresAt])).rows[0];
 if(!row||row.valid!==true||!(row.checked_at instanceof Date)||!Number.isFinite(row.checked_at.getTime())
  ||!(row.valid_before instanceof Date)||!Number.isFinite(row.valid_before.getTime())||row.valid_before.getTime()<=row.checked_at.getTime()
  ||!Number.isSafeInteger(row.observation_count)||row.observation_count<0)
  throw new Error('Acceptance method experience time changed after preparation');
 // The last declaration/source read can outlive a previously verified signature.
 // Use the very same DB instant as the method/plan check, never the app clock.
 if(row.checked_at.getTime()>=signedUntil)throw new Error('Acceptance signed evidence expired after preparation');
 return {methodExperienceTimesRevalidated:true as const,methodExperienceTimeCheckedAt:row.checked_at.toISOString(),
  acceptanceTimeCheckedAt:row.checked_at.toISOString(),acceptanceValidBefore:new Date(Math.min(row.valid_before.getTime(),signedUntil)).toISOString(),
  methodExperienceValidBefore:row.valid_before.toISOString(),methodExperienceTimeObservationCount:row.observation_count};
}
