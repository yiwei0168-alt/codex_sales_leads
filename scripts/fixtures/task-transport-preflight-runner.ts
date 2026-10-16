import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {withSpendContext} from '../../src/lib/billing/context';
import {getPool} from '../../src/lib/rag/db';
import {disableLocalAnalysisTracing} from '../../src/lib/assistant/main/local-analysis-boundary';
import {createConfiguredTaskModeRequest} from '../../src/lib/assistant/main/task-model-transport-request';

/** Disposable compiled-process admission check. No request closure is invoked. */
async function main(){
 assert.equal(process.env.MA24_DISPOSABLE_TRANSPORT_JOURNAL,'1');assert.equal(process.argv.length,3);
 const job=z.object({userId:z.uuid(),runId:z.uuid(),callId:z.uuid(),callKey:z.string(),otherUserId:z.uuid()}).strict().parse(JSON.parse(await readFile(process.argv[2],'utf8')));
 globalThis.fetch=async()=>{throw new Error('External network disabled in admission fixture');};disableLocalAnalysisTracing();
 try{
  await withSpendContext({userId:job.userId,operationId:job.runId,stage:'synthetic-admission'},async()=>{
   const request=await createConfiguredTaskModeRequest(job,{callId:job.callId,callKey:job.callKey});assert.equal(typeof request,'function');
   await assert.rejects(createConfiguredTaskModeRequest({...job,runId:job.callId},{callId:job.callId,callKey:job.callKey}),/stored call unavailable/);
  });
  await withSpendContext({userId:job.otherUserId,operationId:job.runId,stage:'synthetic-admission'},async()=>{
   await assert.rejects(createConfiguredTaskModeRequest({userId:job.otherUserId,runId:job.runId},{callId:job.callId,callKey:job.callKey}),/stored call unavailable/);
  });
  await assert.rejects(createConfiguredTaskModeRequest(job,{callId:job.callId,callKey:job.callKey}),/paid-call scope/);
  console.log(JSON.stringify({originalTaskCompiledAdmission:'passed',ownedStartedCallVerified:true,crossAccountRejected:true,foreignRunRejected:true,missingBillingRejected:true,requestExecuted:false,actualModelCalls:0}));
 }finally{await getPool().end();}
}
main().catch(()=>{console.error('Original task compiled admission fixture failed');process.exitCode=1;});
