import type {PoolClient} from 'pg';
import {z} from 'zod';
import {digest} from './contracts';
import {skillAcceptanceRunIds} from './skill-acceptance-run-locks';
import {lockCurrentSkillExperienceSources,type SourcedSkillVersion} from './skill-source-guard';
import {skillActivationCurrent,type ActivationBoundSkill} from './skill-activation-binding';

type Artifact=Parameters<typeof skillAcceptanceRunIds>[0];
type Pin=SourcedSkillVersion&ActivationBoundSkill&{run_id:string;skill_id:string;version:number;enabled:boolean;published:boolean};

/** Called after task/journal locks. A pin is eligible only after its current
 * method rows and local-experience provenance have been locked and rechecked. */
export async function lockSkillAcceptancePinnedMethods(client:PoolClient,userId:string,artifact:Artifact){
 z.uuid().parse(userId);const ids=skillAcceptanceRunIds(artifact);
 const count=(await client.query<{n:number}>('select lock_skill_pinned_method_sources($1::uuid[]) n',[ids])).rows[0]?.n;
 if(typeof count!=='number'||!Number.isSafeInteger(count)||count<0)throw new Error('Acceptance pinned method lock incomplete');
 const pins=(await client.query<Pin>(`select p.run_id,p.skill_id,p.version,s.enabled,s.published,s.scope,s.owner_id,
  v.source,v.validation,v.content_hash,v.files,to_jsonb(s)->'activation_binding' activation_binding from agent_run_skill p
  join agent_skill s on s.id=p.skill_id join agent_skill_version v on v.skill_id=p.skill_id and v.version=p.version
  where p.user_id=$1 and p.run_id=any($2::uuid[]) order by p.skill_id,p.version,p.run_id`,[userId,ids])).rows;
 if(pins.length!==count)throw new Error('Acceptance pinned method source unavailable');
 const methods=new Map<string,Pin>();
 for(const pin of pins){
  if(!pin.enabled||!(pin.owner_id===userId||(pin.scope==='global'&&pin.published))
   ||!pin.files||digest(pin.files)!==pin.content_hash)throw new Error('Acceptance pinned method source changed');
  methods.set(`${pin.skill_id}:${pin.version}`,pin);
 }
 let experienceObservationCount=0;
 for(const version of methods.values()){
  if(!await skillActivationCurrent(client,userId,version.skill_id,version.version,version.activation_binding))
   throw new Error('Acceptance pinned method activation qualification changed');
  experienceObservationCount+=(await lockCurrentSkillExperienceSources(client,userId,version)).observationCount;
 }
 return {pinnedMethodSourcesLocked:true as const,pinnedMethodPinCount:count,pinnedMethodVersionCount:methods.size,
  pinnedMethodExperienceObservationCount:experienceObservationCount};
}
