import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {withSpendContext} from '../../src/lib/billing/context';
import {getPool,tenantQuery} from '../../src/lib/rag/db';
import {result,type ModelMessage} from '../../src/lib/assistant/main/contracts';
import {modeConfigSchema} from '../../src/lib/assistant/main/mode-config';
import {modeTransportFailure} from '../../src/lib/assistant/main/mode-transport-failure';
import {completeCall} from '../../src/lib/assistant/main/repository';
import {disableLocalAnalysisTracing} from '../../src/lib/assistant/main/local-analysis-boundary';
import {createConfiguredTaskModeRequest} from '../../src/lib/assistant/main/task-model-transport-request';

/** Disposable compiled fixture uses build-time synthetic network/billing adapters. */
async function main(){
 assert.equal(process.env.MA24_DISPOSABLE_TRANSPORT_JOURNAL,'1');assert.equal(process.argv.length,3);
 const job=z.object({userId:z.uuid(),runId:z.uuid(),callId:z.uuid(),callKey:z.string(),otherUserId:z.uuid()}).strict().parse(JSON.parse(await readFile(process.argv[2],'utf8')));
 globalThis.fetch=async()=>{throw new Error('External network disabled in admission fixture');};disableLocalAnalysisTracing();
 try{
  await withSpendContext({userId:job.userId,operationId:job.runId,stage:'synthetic-admission'},async()=>{
   const request=await createConfiguredTaskModeRequest(job,{callId:job.callId,callKey:job.callKey});assert.equal(typeof request,'function');
   await withSpendContext({userId:job.userId,operationId:job.callId,stage:'synthetic-admission'},async()=>{
    await assert.rejects(createConfiguredTaskModeRequest({...job,runId:job.callId},{callId:job.callId,callKey:job.callKey}),/stored call unavailable/);
   });
   const stored=(await tenantQuery<{input:unknown}>(job.userId,'select input from agent_tool_call where id=$1 and user_id=$2',[job.callId,job.userId]))[0];
   const args=z.object({messages:z.array(z.unknown()),profile:modeConfigSchema,index:z.number()}).parse(stored.input);
   if(args.index===0){
    let receipt:unknown;
    try{await request(args.messages as ModelMessage[],args.profile,args.index);assert.fail('Synthetic HTTP failure expected');}
    catch(error){receipt=modeTransportFailure(error);assert(receipt,'Observed synthetic failure must have a signed receipt');}
    await completeCall({...job,leaseToken:job.callId,role:'member'},job.callId,
     result({retryable:true,reason:'http-503',transportFailureReceipt:receipt},{status:'unavailable'}),{syntheticFixture:true});
   }else{
    const output=await request(args.messages as ModelMessage[],args.profile,args.index);
    assert.equal(output.message.content,'Synthetic streamed reply');assert(output.transportReceipt);
    await completeCall({...job,leaseToken:job.callId,role:'member'},job.callId,result({value:output}),{syntheticFixture:true});
   }
  });
  await withSpendContext({userId:job.otherUserId,operationId:job.runId,stage:'synthetic-admission'},async()=>{
   await assert.rejects(createConfiguredTaskModeRequest({userId:job.otherUserId,runId:job.runId},{callId:job.callId,callKey:job.callKey}),/stored call unavailable/);
  });
  await assert.rejects(createConfiguredTaskModeRequest(job,{callId:job.callId,callKey:job.callKey}),/paid-call scope/);
  await withSpendContext({userId:job.userId,operationId:job.callId,stage:'synthetic-admission'},async()=>{
   await assert.rejects(createConfiguredTaskModeRequest(job,{callId:job.callId,callKey:job.callKey}),/bound to the task/);
  });
  console.log(JSON.stringify({originalTaskCompiledAdmission:'passed',ownedStartedCallVerified:true,crossAccountRejected:true,foreignRunRejected:true,missingBillingRejected:true,syntheticRequestExecuted:true,signedOutcomePersisted:true,actualModelCalls:0}));
 }finally{await getPool().end();}
}
main().catch(()=>{console.error('Original task compiled admission fixture failed');process.exitCode=1;});
