import assert from 'node:assert/strict';
import type {Pool} from 'pg';
import {tenantTransaction,withBoundTenantTransaction} from '../../src/lib/rag/db';
import {changeSkill} from '../../src/lib/assistant/main/skills';

/** Actual product mutation on synthetic fixture rows only. No quality judgment
 * or automatic activation is created. Caller owns the disposable database. */
export async function verifyManualSkillSourceDatabase(pool:Pool,input:{owner:string;skillId:string;messageId:string;quote:string}){
 const {owner,skillId,messageId,quote}=input,context={userId:owner,role:'member' as const};
 const action={id:skillId,version:1,operation:'enable' as const};
 await changeSkill(context,{...action,operation:'disable'},true);
 let pending:Promise<unknown>|undefined,finished=false;
 try{
  await tenantTransaction(owner,client=>withBoundTenantTransaction(client,owner,async()=>{
   assert.deepEqual(await changeSkill(context,action,true),{updated:true});
   const pid=(await client.query('select pg_backend_pid() pid')).rows[0].pid;
   assert.equal((await client.query('select enabled from agent_skill where id=$1',[skillId])).rows[0].enabled,true);
   pending=pool.query('update assistant_message set content=$2 where id=$1',[messageId,'Changed synthetic source after manual activation']);
   void pending.then(()=>{finished=true;},()=>{finished=true;});
   let waiting=false;
   for(let i=0;i<100;i++){
    waiting=(await pool.query('select exists(select 1 from pg_stat_activity where $1::int=any(pg_blocking_pids(pid))) waiting',[pid])).rows[0].waiting;
    if(waiting||finished)break;
    await new Promise(resolve=>setTimeout(resolve,20));
   }
   assert.equal(waiting,true,'Manual activation must retain original-message protection until its owning transaction ends');
   assert.equal(finished,false);
  }));
 }finally{if(pending)await pending;}
 await changeSkill(context,{...action,operation:'disable'},true);
 await assert.rejects(changeSkill(context,action,true),/experience.*changed/i);
 assert.equal((await pool.query('select enabled from agent_skill where id=$1',[skillId])).rows[0].enabled,false);
 await pool.query('update assistant_message set content=$2 where id=$1',[messageId,quote]);
 console.log(JSON.stringify({manualSkillSourceDatabase:'passed',actualChangeSkill:true,originalEditWaitsUntilOuterCommit:true,
  changedSourceEnableRejected:true,disableAfterSourceChangeAllowed:true,syntheticHumanAction:true,automaticActivation:false,modelCalls:0}));
}
