import {z} from 'zod';
import type {PoolClient} from 'pg';
import {tenantTransaction} from '@/lib/rag/db';
import {digest} from './contracts';
import {skillAcceptancePlanSchema} from './skill-acceptance-policy';
import {assertSkillCollector,type SkillCollectorTransaction} from './skill-model-journal';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';

const draftSchema=skillAcceptancePlanSchema.omit({frozenAt:true});
export async function freezeSkillAcceptancePlan(context:{userId:string},input:unknown,transaction:SkillCollectorTransaction){
 assertLocalAnalysisBoundary();const draft=draftSchema.parse(input);
 if(draft.pin.ownerId!==context.userId||new Set(draft.cases.map(row=>row.id)).size!==draft.cases.length)throw new Error('Freeze owner or case binding invalid');
 return transaction(context.userId,async client=>{
  await assertSkillCollector(client);
  const row=(await client.query<{id:string;frozen_at:Date}>(`insert into agent_skill_acceptance_freeze(owner_id,skill_id,version,plan_draft,draft_hash)
   values($1,$2,$3,$4,$5) returning id,frozen_at`,[context.userId,draft.pin.skillId,draft.pin.version,JSON.stringify(draft),digest(draft)])).rows[0];
  const plan=skillAcceptancePlanSchema.parse({...draft,frozenAt:row.frozen_at.toISOString()});
  if(Date.parse(plan.expiresAt)<=Date.parse(plan.frozenAt))throw new Error('Freeze plan already expired');
  return {freezeId:row.id,plan,planHash:digest(plan),freezeRecorded:true,runtimeIdentityVerified:false,automaticActivation:false};
 });
}
/** Point-in-time status for history/review. Database failures propagate. */
export async function inspectSkillAcceptanceFreeze(client:PoolClient,userId:string,freezeId:string,expectedPlan:unknown){
 z.uuid().parse(freezeId);const plan=skillAcceptancePlanSchema.parse(expectedPlan);
 const row=(await client.query<{owner_id:string;skill_id:string;version:number;plan_draft:unknown;draft_hash:string;frozen_at:Date;checked_at:Date;revoked:boolean}>(
  `select f.*,clock_timestamp() as checked_at,exists(select 1 from agent_skill_acceptance_freeze_revocation r where r.freeze_id=f.id and r.owner_id=f.owner_id) as revoked
   from agent_skill_acceptance_freeze f where f.id=$1 and f.owner_id=$2`,[freezeId,userId])).rows[0];
 if(!row)return 'missing' as const;
 if(row.revoked)return 'revoked' as const;
 if(digest(row.plan_draft)!==row.draft_hash||row.owner_id!==plan.pin.ownerId||row.skill_id!==plan.pin.skillId||row.version!==plan.pin.version)return 'changed' as const;
 const saved=skillAcceptancePlanSchema.parse({...draftSchema.parse(row.plan_draft),frozenAt:row.frozen_at.toISOString()});
 if(digest(saved)!==digest(plan))return 'changed' as const;
 if(Date.parse(saved.expiresAt)<=row.checked_at.getTime())return 'expired' as const;
 return 'active' as const;
}
export async function requireSkillAcceptanceFreeze(context:{userId:string},freezeId:string,expectedPlan:unknown){
 assertLocalAnalysisBoundary();const plan=skillAcceptancePlanSchema.parse(expectedPlan);
 const state=await tenantTransaction(context.userId,client=>inspectSkillAcceptanceFreeze(client,context.userId,freezeId,plan));
 if(state==='missing'||state==='revoked')throw new Error('Acceptance freeze unavailable or revoked');
 if(state!=='active')throw new Error('Acceptance freeze changed or expired');
 return {freezeId,planHash:digest(plan),frozenAt:plan.frozenAt,expiresAt:plan.expiresAt};
}
/** Append revocation; re-enabling requires a new freeze record. Internal only. */
export async function revokeSkillAcceptanceFreeze(context:{userId:string},input:{freezeId:string;reason:string}){
 const p=z.object({freezeId:z.uuid(),reason:z.string().trim().min(1).max(2000)}).strict().parse(input);
 return tenantTransaction(context.userId,async client=>{
  const row=(await client.query('select id from agent_skill_acceptance_freeze where id=$1 and owner_id=$2',[p.freezeId,context.userId])).rows[0];
  if(!row)throw new Error('Acceptance freeze unavailable');
  await client.query('insert into agent_skill_acceptance_freeze_revocation(freeze_id,owner_id,reason) values($1,$2,$3) on conflict(freeze_id) do nothing',[p.freezeId,context.userId,p.reason]);
  return {freezeId:p.freezeId,revoked:true,automaticActivation:false};
 });
}
