import assert from 'node:assert/strict';
import type {Pool} from 'pg';
import {tenantTransaction} from '../../src/lib/rag/db';
import {digest} from '../../src/lib/assistant/main/contracts';
import {appendSkillAcceptanceJudgment,readLockedSkillAcceptanceEvidence} from '../../src/lib/assistant/main/skill-acceptance-store';

export async function verifyLockedEvidenceDatabase(pool:Pool,owner:string,other:string,bundleId:string){
 const read=()=>tenantTransaction(owner,client=>readLockedSkillAcceptanceEvidence(client,{userId:owner},bundleId));
 const initial=await read();assert.equal(initial.lockedEvidenceRead,true);assert.equal(initial.automaticActivation,false);
 assert.equal(initial.judgments.length,0);assert.deepEqual(initial.currentPin,initial.artifact.plan.pin);
 await assert.rejects(tenantTransaction(other,client=>readLockedSkillAcceptanceEvidence(client,{userId:other},bundleId)),/unavailable/);
 const observation=initial.artifact.observations[0],verdict={answer:false,citation:false,permission:false,injection:false};
 const review={bundleId,artifactHash:initial.artifactHash,expectedRevision:0,judgment:{caseId:observation.caseId,
  observationHash:digest(observation),revoked:false,baseline:verdict,candidate:verdict,rationale:'Synthetic development-only locked read check.'}};
 await appendSkillAcceptanceJudgment({userId:owner,reviewerKind:'assistant-development'},review);
 const before=await read();assert.equal(before.judgments[0].revision,1);
 const holder=await pool.connect();let pending:Promise<unknown>|undefined,completed=false;
 try{
  await holder.query('begin');await holder.query('set local role network_copilot_app');
  await holder.query("select set_config('app.current_user_id',$1,true)",[owner]);
  const locked=await readLockedSkillAcceptanceEvidence(holder,{userId:owner},bundleId);
  assert.equal(locked.latestReviewHash,before.latestReviewHash);
  const pid=(await holder.query('select pg_backend_pid() as pid')).rows[0].pid as number;
  pending=appendSkillAcceptanceJudgment({userId:owner,reviewerKind:'assistant-development'},
   {...review,expectedRevision:1,judgment:{...review.judgment,revoked:true,rationale:'Revoke synthetic development-only locked read check.'}}).finally(()=>{completed=true;});
  void pending.catch(()=>undefined);
  let waiting=false;
  for(let i=0;i<100&&!completed;i++){
   waiting=(await pool.query('select exists(select 1 from pg_stat_activity where $1::int=any(pg_blocking_pids(pid))) as waiting',[pid])).rows[0].waiting;
   if(waiting)break;await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(waiting,true,'Latest review writer must wait for the locked reader');assert.equal(completed,false);
 }finally{await holder.query('rollback');holder.release();}
 await pending;
 const after=await read();assert.equal(after.judgments[0].revision,2);assert.equal(after.judgments[0].revoked,true);
 assert.notEqual(after.latestReviewHash,before.latestReviewHash);assert.equal(after.sourcePayloadsRevalidated,false);
 return {lockedEvidenceLatestReviewSerialized:true,lockedEvidenceCrossAccountRejected:true,lockedPinDerivedFromCurrentSkill:true,
  lockedReadRetainsRevokedLatestReview:true,humanApprovalCreated:false,automaticActivation:false};
}
