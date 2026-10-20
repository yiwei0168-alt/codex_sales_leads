import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {changeSkill} from '../../src/lib/assistant/main/skills';
import {getPool,tenantTransaction,withBoundTenantTransaction} from '../../src/lib/rag/db';

async function main(){
 if(process.env.MA24_DISPOSABLE_FINAL_ACTIVATION!=='1'||process.argv.length!==3)throw new Error('Disposable activation fixture required');
 const job=z.object({actor:z.object({userId:z.uuid(),role:z.literal('member'),runId:z.uuid(),leaseToken:z.uuid(),callId:z.uuid(),instructionIds:z.array(z.uuid())}),
  action:z.object({id:z.uuid(),version:z.number().int().positive(),operation:z.literal('enable')}),failure:z.boolean(),commitDelay:z.boolean(),bindingClear:z.boolean().default(false)}).strict()
  .parse(JSON.parse(await readFile(process.argv[2],'utf8')));
 try{
  try{
   const data=job.commitDelay||job.bindingClear?await tenantTransaction(job.actor.userId,client=>withBoundTenantTransaction(client,job.actor.userId,async()=>{
    const out=await changeSkill(job.actor,job.action);
    if(job.commitDelay)await client.query('select pg_sleep(2.1)');
    if(job.bindingClear)await client.query('update agent_skill set enabled=true where id=$1 and owner_id=$2',[job.action.id,job.actor.userId]);
    return out;
   }),job.actor.role):await changeSkill(job.actor,job.action);
   if(job.failure)throw new Error('Expected activation fixture failure');
   console.log(JSON.stringify({activationTransaction:'committed-or-reconciled',data,qualificationProducerMocked:true,humanApprovalCreated:false}));
  }catch(error){
   if(!job.failure||error instanceof Error&&error.message==='Expected activation fixture failure')throw error;
   console.log(JSON.stringify({activationTransaction:'rejected',qualificationProducerMocked:true,humanApprovalCreated:false}));
  }
 }finally{await getPool().end();}
}
main().catch(()=>{console.error('Disposable activation transaction fixture failed');process.exitCode=1;});
