import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {bindRuntime,userId,json} from '../hybrid-evaluation-v1/runtime';
const admin=await bindRuntime();
try{
 const {productTools}=await import('../../src/lib/assistant/main/tools');
 const {executeProgrammatic}=await import('../../src/lib/assistant/main/programmatic-execution');
 const {PROGRAM_LEAVES}=await import('../../src/lib/assistant/main/hybrid-contracts');
 const tool=productTools.find(t=>t.id==='mailbox_message_list')!;
 const context={userId,runId:'offline-date-helper',leaseToken:'offline-date-helper',role:'member' as const,callId:'offline-date-helper'};
 const calls:unknown[]=[];
 const result=await executeProgrammatic({code:`const counts={};let offset=0;for(let i=0;i<10;i++){const p=tools.call('mailbox_message_list',{from:'2026-11-02T00:00:00+08:00',until:'2026-11-06T00:00:00+08:00',offset}).data;for(const item of p.items){const day=tools.time(item.sentAt,480).localDate;counts[day]=(counts[day]||0)+1;}if(!p.hasMore)return {counts,total:Object.values(counts).reduce((a,b)=>a+b,0)};offset=p.nextOffset;}tools.handoff('Unread pages',counts);`},context,
  {allowed:PROGRAM_LEAVES,validate:async()=>{},dispatch:async(call)=>{const args=JSON.parse(call.function.arguments);assert.equal(args.tool,tool.id);calls.push(args.arguments);return tool.output.parse(await tool.execute(args.arguments,context));}});
 assert.equal(result.status,'success');assert.equal(calls.length,2);
 assert.deepEqual((result.data as {value:unknown}).value,{counts:{'2026-11-02':8,'2026-11-03':12,'2026-11-04':12,'2026-11-05':8},total:40});
 const report={version:'date-grouping-metadata-schema-real-wasm-db',passed:true,realDatabase:true,realWasm:true,pages:2,total:40,modelCalls:0,fixtureMutations:0,scope:'Deterministic date helper integration, not model-generated code acceptance.'};
 await mkdir('experiments/hybrid-evaluation-v9/results',{recursive:true});await writeFile('experiments/hybrid-evaluation-v9/results/time-integration.json',json(report));console.log(json(report));
}finally{await admin.end();const {getPool}=await import('../../src/lib/rag/db');await getPool().end();}
