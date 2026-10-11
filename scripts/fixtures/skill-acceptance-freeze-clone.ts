import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {digest} from '../../src/lib/assistant/main/contracts';
import {importSkill} from '../../src/lib/assistant/main/skills';
import {freezeSkillAcceptancePlan,requireSkillAcceptanceFreeze,revokeSkillAcceptanceFreeze} from '../../src/lib/assistant/main/skill-acceptance-freeze';
import type {SkillCollectorTransaction} from '../../src/lib/assistant/main/skill-model-journal';

export async function verifyAcceptanceFreezeFixture(pool:Pool,owner:string,other:string){
 assert(/^ma11_replay_[a-f0-9]{12}$/.test((await pool.query('select current_database() as name')).rows[0].name));
 const skill=await importSkill({userId:owner,role:'member'},{name:'Freeze fixture',source:'synthetic-fixture',files:{'SKILL.md':'Synthetic freeze instructions.'},dependencies:[]});
 const context={userId:owner},hash=digest('synthetic'),ids:string[]=[];
 const draft={protocol:'skill-acceptance-plan-v1',pin:{ownerId:owner,skillId:skill.id,version:1,contentHash:hash,sourceHash:hash},identity:{runtimeHash:hash,promptHash:hash,toolSchemaHash:hash,modelConfigHash:hash,scopeHash:hash},expiresAt:new Date(Date.now()+3600000).toISOString(),
  cases:['replay','negative','injection','permissions','shadow'].map(category=>({id:category,category,inputHash:hash,sourceHash:hash,provenance:category==='replay'?'historical-task':category==='shadow'?'prospective-task':'safety-fixture'}))};
 const transaction:SkillCollectorTransaction=async(userId,work)=>{const client=await pool.connect();try{
  await client.query('begin');await client.query('set local role network_copilot_skill_collector');await client.query("select set_config('app.current_user_id',$1,true)",[userId]);
  const out=await work(client);await client.query('commit');return out;
 }catch(error){await client.query('rollback');throw error;}finally{client.release();}};
 try{
  const before=(await pool.query('select clock_timestamp() as time')).rows[0].time as Date;
  const frozen=await freezeSkillAcceptancePlan(context,draft,transaction);ids.push(frozen.freezeId);
  assert(Date.parse(frozen.plan.frozenAt)>=before.getTime());assert.equal(frozen.runtimeIdentityVerified,false);
  assert.equal((await requireSkillAcceptanceFreeze(context,frozen.freezeId,frozen.plan)).planHash,frozen.planHash);
  await assert.rejects(freezeSkillAcceptancePlan(context,{...draft,frozenAt:'2000-01-01T00:00:00Z'},transaction));
  await assert.rejects(freezeSkillAcceptancePlan({userId:other},draft,transaction),/owner or case/);
  await assert.rejects(freezeSkillAcceptancePlan(context,{...draft,expiresAt:'2000-01-01T00:00:00Z'},transaction),/expired/);
  await assert.rejects(requireSkillAcceptanceFreeze({userId:other},frozen.freezeId,frozen.plan),/unavailable/);
  await assert.rejects(requireSkillAcceptanceFreeze(context,frozen.freezeId,{...frozen.plan,identity:{...draft.identity,runtimeHash:digest('changed')}}),/changed/);
  await assert.rejects(revokeSkillAcceptanceFreeze({userId:other},{freezeId:frozen.freezeId,reason:'foreign'}),/unavailable/);
  await revokeSkillAcceptanceFreeze(context,{freezeId:frozen.freezeId,reason:'Synthetic owner revocation'});
  await assert.rejects(requireSkillAcceptanceFreeze(context,frozen.freezeId,frozen.plan),/revoked/);
  await assert.rejects(pool.query('delete from agent_skill_acceptance_freeze_revocation where freeze_id=$1',[frozen.freezeId]),/append-only/);
  await assert.rejects(pool.query("update agent_skill_acceptance_freeze set frozen_at='2000-01-01' where id=$1",[frozen.freezeId]),/append-only/);
  const forged=randomUUID();ids.push(forged);
  await pool.query(`insert into agent_skill_acceptance_freeze(id,owner_id,skill_id,version,plan_draft,draft_hash,frozen_at) values($1,$2,$3,1,$4,$5,'2000-01-01')`,[forged,owner,skill.id,JSON.stringify(draft),digest(draft)]);
  assert((await pool.query('select frozen_at from agent_skill_acceptance_freeze where id=$1',[forged])).rows[0].frozen_at.getTime()>=before.getTime());
  const app=await pool.connect();try{await app.query('begin');await app.query('set local role network_copilot_app');await app.query("select set_config('app.current_user_id',$1,true)",[owner]);
   await assert.rejects(app.query('insert into agent_skill_acceptance_freeze(owner_id,skill_id,version,plan_draft,draft_hash) values($1,$2,1,$3,$4)',[owner,skill.id,JSON.stringify(draft),digest(draft)]),/permission denied/);await app.query('rollback');
  }finally{app.release();}
  return {databaseStampedFreeze:true,callerAndRawInsertBackdatingPrevented:true,expiredDraftRejected:true,crossAccountReadAndRevokeRejected:true,changedPlanRejected:true,appendOnlyRevocation:true,ordinaryApplicationCannotFreeze:true,runtimeIdentityVerified:false,automaticActivation:false};
 }finally{
  const client=await pool.connect();try{await client.query('begin');await client.query('set local session_replication_role=replica');
   await client.query('delete from agent_skill_acceptance_freeze_revocation where freeze_id=any($1::uuid[])',[ids]);await client.query('delete from agent_skill_acceptance_freeze where skill_id=$1',[skill.id]);
   await client.query('delete from agent_skill_version where skill_id=$1',[skill.id]);await client.query('delete from agent_skill where id=$1',[skill.id]);await client.query('commit');
  }catch(error){await client.query('rollback');throw error;}finally{client.release();}
 }
}
