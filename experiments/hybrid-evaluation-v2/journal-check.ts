import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {bindRuntime,userId,json,otherUserId} from '../hybrid-evaluation-v1/runtime';

// Ordinary run in the existing isolated synthetic database, no graph/model invocation.
const admin=await bindRuntime();
try{
 const {enqueueRun,claimRun,finishRun}=await import('../../src/lib/assistant/main/repository');
 const {automaticModelConfig}=await import('../../src/lib/assistant/main/automatic-execution');
 const {dispatchTool}=await import('../../src/lib/assistant/main/executor');
 const {readInterpreterReceipt}=await import('../../src/lib/assistant/main/interpreter-receipts');
 const {availableTools}=await import('../../src/lib/assistant/main/tools');
 const {PROGRAM_LEAVES}=await import('../../src/lib/assistant/main/hybrid-contracts');
 assert.equal((await admin.query("select count(*)::int n from agent_run where status in('running','queued','waiting_user')")).rows[0].n,0);
 const run=await enqueueRun(userId,{content:'Offline journal receipt regression; no model invocation',attachments:[],requestKey:randomUUID()},automaticModelConfig());
 const claim=await claimRun('receipt-integration-check');assert.equal(claim?.id,run.id);
 const c={userId,runId:run.id,leaseToken:claim!.lease_token,role:'member' as const,mode:'deep' as const};
 let ok=false;
 try{
  const source=await dispatchTool({id:'read-list',type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool:'customer_timeline',arguments:{offset:0}})}},c);
  assert.equal(source.status,'success');assert.ok(source.callId);
  const output=await dispatchTool({id:'reuse-list',type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool:'programmatic_tools',arguments:{code:`return tools.receipt('${source.callId}').data;`}})}},c);
  assert.equal(output.status,'success');assert.deepEqual((output.data as {value:unknown}).value,JSON.parse(JSON.stringify(source.data)));
  assert.equal((await admin.query("select count(*)::int n from agent_tool_call where user_id=$1 and run_id=$2 and tool_id='customer_timeline'",[userId,run.id])).rows[0].n,1);
  const foreign=(await admin.query("select id from agent_tool_call where user_id=$1 and run_id<>$2 and tool_id='customer_timeline' and status='completed' limit 1",[userId,run.id])).rows[0];
  assert.ok(foreign);
  await assert.rejects(()=>readInterpreterReceipt(c,foreign.id,PROGRAM_LEAVES,()=>availableTools(c)),/unavailable/);
  await assert.rejects(()=>readInterpreterReceipt({...c,userId:otherUserId},source.callId!,PROGRAM_LEAVES,()=>availableTools(c)));
  await assert.rejects(()=>readInterpreterReceipt({...c,knowledgeScope:['product']},source.callId!,PROGRAM_LEAVES,()=>availableTools({...c,knowledgeScope:['product']})),/unavailable/);
  assert.equal((await admin.query('select count(*)::int n from paid_call_reservation where user_id=$1 and operation_id=$2',[userId,run.id])).rows[0].n,0);
  ok=true;
 }finally{await finishRun(c,ok?'completed':'failed',ok?'Receipt integration regression passed':'Receipt integration regression failed');}
 await mkdir('experiments/hybrid-evaluation-v2/results',{recursive:true});
 const report={version:'interpreter-journal-regression-v2',runId:run.id,sameRunReuse:true,originalToolCalls:1,
  crossRunRejected:true,crossAccountRejected:true,knowledgeScopeRejected:true,modelCalls:0,productionDatabaseAccess:false};
 await writeFile('experiments/hybrid-evaluation-v2/results/journal.json',json(report));console.log(json(report));
}finally{await admin.end();const {getPool}=await import('../../src/lib/rag/db');await getPool().end();}
