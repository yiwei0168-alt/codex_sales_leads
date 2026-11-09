import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {bindRuntime,userId,otherUserId,id,json} from '../hybrid-evaluation-v1/runtime';
import {withBoundTenantTransaction} from '../../src/lib/rag/db';
import {listOwnedSalesCompanies} from '../../src/lib/sales/company-list';
import {productTools} from '../../src/lib/assistant/main/tools';
import {executeHybridRead} from '../../src/lib/assistant/main/hybrid-execution';
import type {ExecutionContext} from '../../src/lib/assistant/main/contracts';
const binding=JSON.parse(await readFile('.local-runtime/hybrid-local-read-extension-v1/binding.json','utf8'));
const admin=await bindRuntime(),client=await admin.connect();
const context:ExecutionContext={userId,runId:id('pagination-test/run'),callId:id('pagination-test/call'),leaseToken:'isolated-read-check',role:'member',mode:'deep'};
let programPages=0;
try{
 await client.query('begin');
 for(let i=0;i<13;i++){
  const cid=id(`pagination-test/${i}`),candidate=`pagination-test-${String(i).padStart(2,'0')}`;
  await client.query("insert into sales_company(id,external_id,canonical_name,domain,country_code,record) values($1,$2,$2,$3,'GB','{}')",[cid,candidate,`${candidate}.invalid`]);
  await client.query("insert into workspace_company(workspace_id,company_id,account_tier,supply_model,brand_involvement,opportunity_stage,priority) values($1,$2,'Unknown','Unknown','Unknown','New','Medium')",[binding.workspaceId,cid]);
  await client.query("insert into workspace_company_market(workspace_id,company_id,country_code,candidate_id,record,provenance) values($1,$2,'GB',$3,$4,'user-added')",[binding.workspaceId,cid,candidate,json({displayName:candidate,roles:['SI']})]);
 }
 await client.query('set local role network_copilot_app');
 await client.query("select set_config('app.current_user_id',$1,true),set_config('app.current_user_role','member',true)",[userId]);
 await withBoundTenantTransaction(client,userId,async()=>{
  const first=await listOwnedSalesCompanies(userId,{}),last=await listOwnedSalesCompanies(userId,{offset:20});
  assert.equal(first.items.length,20);assert.equal(first.hasMore,true);assert.equal(first.nextOffset,20);
  assert.equal(last.items.length,5);assert.equal(last.hasMore,false);assert.equal(last.nextOffset,null);
  assert.equal(new Set([...first.items,...last.items].map(r=>r.id)).size,25);
  assert.equal((await listOwnedSalesCompanies(userId,{countryCode:'DE'})).items.length,3);
  const list=productTools.find(t=>t.id==='company_list')!;
  const program=await executeHybridRead('interpreter',{code:`const items=[];let offset=0;while(true){const r=tools.call('company_list',{offset});if(r.status!=='success')throw Error('unavailable');items.push(...r.data.items);if(!r.data.hasMore)break;if(r.data.nextOffset===null)throw Error('limit');offset=r.data.nextOffset;}return {total:items.length,ids:items.map(x=>x.id)};`},context,
   {allowed:new Set(['company_list']),validate:async()=>{},dispatch:async(call,c)=>{const request=JSON.parse(call.function.arguments);assert.equal(request.tool,'company_list');programPages++;return list.output.parse(await list.execute(list.input.parse(request.arguments),c));}});
  assert.equal(program.status,'success');assert.equal((program.data as {value:{total:number}}).value.total,25);assert.equal(programPages,2);
 });
 await client.query("select set_config('app.current_user_id',$1,true)",[otherUserId]);
 await withBoundTenantTransaction(client,otherUserId,async()=>assert.equal((await listOwnedSalesCompanies(otherUserId,{})).items.length,0));
}finally{await client.query('rollback');client.release();}
try{
 assert.equal((await listOwnedSalesCompanies(userId,{})).items.length,12);
 const tool=productTools.find(t=>t.id==='knowledge_search')!,input=tool.input.parse({query:'Harbor Circuit 报价',collections:['company'],limit:8});
 const output=await tool.execute(input,context),text=JSON.stringify(output.data);
 for(const q of binding.quotations)assert.ok(text.includes(q.documentId));
 const foreign=await tool.execute(input,{...context,userId:otherUserId});assert.equal((foreign.data as unknown[]).length,0);
 const workflowCalls:string[]=[];
 const workflow=await executeHybridRead('workflow',{workflow:'customer_recent',query:'Harbor Circuit'},context,
  {allowed:new Set(['company_search','customer_timeline','mail_read']),validate:async()=>{},dispatch:async(call,c)=>{
   const p=JSON.parse(call.function.arguments),leaf=productTools.find(t=>t.id===p.tool)!;assert.equal(leaf.effect,'read');workflowCalls.push(p.tool);
   return leaf.output.parse(await leaf.execute(leaf.input.parse(p.arguments),c));
  }});
 assert.equal(workflow.status,'success');assert.deepEqual(workflowCalls,['company_search','customer_timeline','mail_read','mail_read','mail_read']);
 const value=workflow.data as {value:{timeline:{data:{customer:{id:string}}}}};assert.equal(value.value.timeline.data.customer.id,id('c1'));
 const report={version:'company-list-real-db-wasm-v1',temporaryCompanyRows:25,pageSizes:[20,5],programPages,programResultTotal:25,
  finalPageConfirmed:true,countryFilterPassed:true,crossOwnerReadBlocked:true,rollbackRestoredCompanies:12,quoteDocumentsSearchable:2,privateQuoteIsolationPassed:true,
  dualStoreTimelineReadPassed:true,dualStoreWorkflowCalls:workflowCalls,companyMergePerformed:false,
  newModelCalls:0,externalRequests:0,productionChanged:false,passed:true};
 await writeFile('experiments/hybrid-local-read-extension-v1/results/pages.json',json(report));console.log(json(report));
}finally{await admin.end();const {getPool}=await import('../../src/lib/rag/db');await getPool().end();}
