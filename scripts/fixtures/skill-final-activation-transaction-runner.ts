import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {changeSkill} from '../../src/lib/assistant/main/skills';
import {getPool,tenantTransaction,withBoundTenantTransaction} from '../../src/lib/rag/db';

async function main(){
 if(process.env.MA24_DISPOSABLE_FINAL_ACTIVATION!=='1'||process.argv.length!==3)throw new Error('Disposable activation fixture required');
 const job=z.object({actor:z.object({userId:z.uuid(),role:z.literal('member'),runId:z.uuid(),leaseToken:z.uuid(),callId:z.uuid(),instructionIds:z.array(z.uuid())}),
  action:z.object({id:z.uuid(),version:z.number().int().positive(),operation:z.literal('enable')}),failure:z.boolean(),commitDelay:z.boolean(),bindingClear:z.boolean().default(false),commitDelaySeconds:z.number().min(0).max(10).default(2.1),
  lateWrite:z.enum(['memory','source-run','source-message','receipt','knowledge','mail','rearm','guc-reset','early-constraints','empty-source-write']).optional()}).strict()
  .parse(JSON.parse(await readFile(process.argv[2],'utf8')));
 let activationReturnedBeforeCommit=false;
 try{
  try{
   const data=job.commitDelay||job.bindingClear||job.lateWrite?await tenantTransaction(job.actor.userId,client=>withBoundTenantTransaction(client,job.actor.userId,async()=>{
    const out=await changeSkill(job.actor,job.action);
    activationReturnedBeforeCommit=true;
    if(job.commitDelay)await client.query('select pg_sleep($1)',[job.commitDelaySeconds]);
    if(job.bindingClear)await client.query('update agent_skill set enabled=true where id=$1 and owner_id=$2',[job.action.id,job.actor.userId]);
    if(job.lateWrite){
     const binding=(await client.query('select activation_binding from agent_skill where id=$1 and owner_id=$2',[job.action.id,job.actor.userId])).rows[0].activation_binding;
     if(job.lateWrite==='early-constraints')await client.query('set constraints skill_activation_source_commit_guard immediate');
     if(job.lateWrite==='guc-reset')await client.query("select set_config('app.skill_activation_source_fence','',true)");
     if(['memory','guc-reset','early-constraints'].includes(job.lateWrite))await client.query(`insert into agent_memory(owner_id,scope,kind,memory_key,source_kind)
      values($1,'account','preference',$2,'explicit')`,[job.actor.userId,job.actor.callId]);
     if(job.lateWrite==='source-run')await client.query("update agent_run set status='failed' where user_id=$1 and id=$2",[job.actor.userId,binding.sources[0].runId]);
     if(job.lateWrite==='source-message')await client.query("update assistant_message set content='Synthetic late write' where user_id=$1 and role='user' and metadata->>'runId'=$2",[job.actor.userId,binding.sources[0].runId]);
     if(job.lateWrite==='receipt')await client.query("update agent_tool_call set output=output||'{\"late\":true}'::jsonb where user_id=$1 and id=$2",[job.actor.userId,job.actor.callId]);
     if(job.lateWrite==='knowledge')await client.query(`insert into knowledge_document(collection_id,external_id,title,source_type,content_sha256,owner_id,visibility)
      select id,$2,'Synthetic late source','synthetic',$3,$1,'private' from knowledge_collection order by id limit 1`,[job.actor.userId,job.actor.callId,'0'.repeat(64)]);
     if(job.lateWrite==='mail')await client.query("update mailbox_customer set archived=true where user_id=$1",[job.actor.userId]);
     if(job.lateWrite==='empty-source-write')await client.query('update agent_memory set active=false where false');
     if(job.lateWrite==='rearm')await client.query('select begin_skill_activation_source_fence($1,$2,$3,$4,$5,$6,$7,$8)',
      [job.actor.runId,job.actor.callId,job.action.id,job.action.version,binding.bundleId,binding.activationProofHash,binding.validBefore,job.actor.leaseToken]);
    }
    return out;
   }),job.actor.role):await changeSkill(job.actor,job.action);
   if(job.failure)throw new Error('Expected activation fixture failure');
   console.log(JSON.stringify({activationTransaction:'committed-or-reconciled',data,qualificationProducerMocked:true,humanApprovalCreated:false}));
  }catch(error){
   if(!job.failure||error instanceof Error&&error.message==='Expected activation fixture failure')throw error;
   const message=error instanceof Error?error.message:'';
   console.log(JSON.stringify({activationTransaction:'rejected',activationReturnedBeforeCommit,
    sourceFenceRejected:/Skill activation source (transaction sealed|fence already armed)/.test(message),qualificationProducerMocked:true,humanApprovalCreated:false}));
  }
 }finally{await getPool().end();}
}
main().catch(()=>{console.error('Disposable activation transaction fixture failed');process.exitCode=1;});
