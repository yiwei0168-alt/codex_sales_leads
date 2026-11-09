import {randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {bindRuntime,userId,otherUserId,json} from '../hybrid-evaluation-v1/runtime';
import {withProductSpend} from '../../src/lib/billing/context';
import {requestModeModel} from '../../src/lib/assistant/main/model';
import {modeModelConfig} from '../../src/lib/assistant/main/mode-config';
import {reconcileIncompleteOpenRouterGeneration} from '../../src/lib/billing/openrouter-generation-reconciliation';
const admin=await bindRuntime();process.env.PRODUCT_FINANCIAL_POLICY='observe';
const operationId=randomUUID(),generationId=`gen-synthetic-${randomUUID()}`,model='openai/gpt-6-luna';
let modelRequests=0,metadataRequests=0;
const injectedModel:typeof fetch=async()=>{modelRequests++;return new Response(`data: ${JSON.stringify({id:generationId,model,
 usage:{cost:999},choices:[{delta:{content:'Synthetic private fragment',tool_calls:[{index:0,id:'partial',function:{name:'execute_tool',arguments:'{"tool":"mail_send"'}}]},finish_reason:null}]})}\n\n`,{headers:{'content-type':'text/event-stream'}});};
try{
 await assert.rejects(()=>withProductSpend(userId,'synthetic-stream-receipt-test',()=>requestModeModel([{role:'user',content:'Synthetic injected stream test'}],modeModelConfig('quick').profile!,0,injectedModel),operationId));
 assert.equal(modelRequests,1);
 const rows=await admin.query('select id,status,reported_micros,provider_request_hash,metrics from paid_call_reservation where user_id=$1 and operation_id=$2',[userId,operationId]);
 assert.equal(rows.rows.length,1);const row=rows.rows[0];
 assert.equal(row.status,'unknown');assert.equal(row.reported_micros,null);assert.equal(row.metrics.validOutputItems,0);
 assert.equal(row.metrics.incompleteStream.generationId,generationId);
 assert.equal(row.provider_request_hash,createHash('sha256').update(generationId).digest('hex'));
 assert.ok(!JSON.stringify(row.metrics).includes('Synthetic private fragment'));assert.ok(!JSON.stringify(row.metrics).includes('mail_send'));
 const createdAt=new Date().toISOString();
 const injectedMetadata:typeof fetch=async(input,init)=>{metadataRequests++;assert.equal(init?.method,'GET');assert.equal(new URL(String(input)).searchParams.get('id'),generationId);
  return Response.json({data:{id:generationId,model,total_cost:.0012341,is_byok:false,streamed:true,cancelled:false,finish_reason:'tool_calls',created_at:createdAt}});};
 assert.equal((await reconcileIncompleteOpenRouterGeneration(otherUserId,row.id,injectedMetadata)).status,'unavailable');assert.equal(metadataRequests,0);
 const first=await reconcileIncompleteOpenRouterGeneration(userId,row.id,injectedMetadata);assert.equal(first.status,'observed');assert.equal(first.settled,true);
 const duplicate=await reconcileIncompleteOpenRouterGeneration(userId,row.id,injectedMetadata);assert.equal(duplicate.duplicate,true);
 const [settled]=(await admin.query('select settled_micros,metrics from paid_call_reservation where user_id=$1 and id=$2',[userId,row.id])).rows;
 assert.equal(Number(settled.settled_micros),1235);assert.equal(settled.metrics.validOutputItems,0);assert.equal(modelRequests,1);
 const report={version:'synthetic-incomplete-stream-integration-v1',operationId,reservationId:row.id,externalRequests:0,modelRequests,metadataRequests,
  incompleteIdentityPersisted:true,partialContentPersisted:false,partialCostAdopted:false,crossOwnerLookupBlocked:true,settlementMicros:1235,idempotencePassed:true,
  answerReleased:false,toolsExecuted:0,acceptanceScope:'injected transport + real isolated RLS database; not provider reliability or benchmark cost',passed:true};
 await mkdir('experiments/hybrid-stream-recovery-v1/results',{recursive:true});await writeFile('experiments/hybrid-stream-recovery-v1/results/isolated.json',json(report));console.log(json(report));
}finally{await admin.end();const {getPool}=await import('../../src/lib/rag/db');await getPool().end();}
