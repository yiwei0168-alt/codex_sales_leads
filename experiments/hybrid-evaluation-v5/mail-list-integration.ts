import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {bindRuntime,userId,otherUserId,json} from '../hybrid-evaluation-v1/runtime';
const admin=await bindRuntime();
let datedSentinel:{id:string;sentAt:string|null}|null=null;
try{
 const pending=await admin.query("select count(*)::int n from agent_run where status in ('running','queued','waiting_user')");
 assert.equal(pending.rows[0].n,0);
 datedSentinel=(await admin.query('select id,sent_at::text as "sentAt" from mailbox_message where user_id=$1 order by id limit 1',[otherUserId])).rows[0];
 assert(datedSentinel);
 await admin.query('update mailbox_message set sent_at=$3::timestamptz where user_id=$1 and id=$2',[otherUserId,datedSentinel.id,'2026-11-03T09:00:00Z']);
 const {productTools}=await import('../../src/lib/assistant/main/tools');
 const {executeProgrammatic}=await import('../../src/lib/assistant/main/programmatic-execution');
 const {PROGRAM_LEAVES}=await import('../../src/lib/assistant/main/hybrid-contracts');
 const {modeAllowsTool}=await import('../../src/lib/assistant/main/mode-tools');
 const {assertCurrentPrivateReplayMessages}=await import('../../src/lib/assistant/main/private-replay-guard');
 const tool=productTools.find(t=>t.id==='mailbox_message_list')!;
 assert(tool&&tool.effect==='read');
 for(const mode of ['quick','standard','deep'] as const)assert(modeAllowsTool(mode,tool.id));
 const context={userId,runId:'offline-validation',leaseToken:'offline-validation',role:'member' as const,callId:'offline-validation'};
 const input={from:'2026-11-02T00:00:00+08:00',until:'2026-11-06T00:00:00+08:00',offset:0};
 const records:Array<{id:string;sentAt:string}>=[],pages=[];
 let offset=0;
 for(let i=0;i<10;i++){
  const args={...input,offset},out=await tool.execute(args,context);
  const data=out.data as {items:Array<{id:string;sentAt:string}>;hasMore:boolean;nextOffset:number|null};
  assert.equal(out.status,'success');records.push(...data.items);pages.push({count:data.items.length,hasMore:data.hasMore});
  await assertCurrentPrivateReplayMessages(userId,[{role:'assistant',content:null,tool_calls:[{id:'read',type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool:tool.id,arguments:args})}}]},{role:'tool',tool_call_id:'read',content:JSON.stringify(out)}]);
  if(offset===0)await assert.rejects(()=>assertCurrentPrivateReplayMessages(otherUserId,[{role:'assistant',content:null,tool_calls:[{id:'read',type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool:tool.id,arguments:args})}}]},{role:'tool',tool_call_id:'read',content:JSON.stringify(out)}]));
  if(!data.hasMore)break;assert(data.nextOffset!==null);offset=data.nextOffset;
 }
 assert.equal(records.length,40);assert.equal(new Set(records.map(r=>r.id)).size,40);
 assert.deepEqual(pages,[{count:20,hasMore:true},{count:20,hasMore:false}]);
 const foreign=(await admin.query('select id from mailbox_message where user_id=$1',[otherUserId])).rows;
 assert(foreign.length>0);assert(records.every(r=>!foreign.some(f=>f.id===r.id)));
 const other=await tool.execute(input,{...context,userId:otherUserId});
 assert((other.data as {items:Array<{id:string}>}).items.some(r=>r.id===datedSentinel!.id));
 const counts=[2,3,4,5].map(day=>records.filter(r=>new Date(Date.parse(r.sentAt)+8*3600000).toISOString().slice(0,10)===`2026-11-0${day}`).length);
 assert.deepEqual(counts,[8,12,12,8]);
 const out=await executeProgrammatic({code:`const counts=[0,0,0,0];const from='${input.from}',until='${input.until}';const start=tools.time(from).epochMs;let offset=0;for(let i=0;i<10;i++){const p=tools.call('mailbox_message_list',{from,until,offset}).data;for(const m of p.items){counts[Math.floor((tools.time(m.sentAt).epochMs-start)/86400000)]++;}if(!p.hasMore)return {counts,total:counts.reduce((a,b)=>a+b,0)};offset=p.nextOffset;}tools.handoff('Unread pages',counts);`},context,
  {allowed:PROGRAM_LEAVES,validate:async()=>{},dispatch:async(call)=>{const r=JSON.parse(call.function.arguments);assert.equal(r.tool,tool.id);return tool.execute(r.arguments,context);}});
 assert.equal(out.status,'success');assert.deepEqual((out.data as {value:unknown}).value,{counts:[8,12,12,8],total:40});
 await admin.query('update mailbox_message set sent_at=$3::timestamptz where user_id=$1 and id=$2',[otherUserId,datedSentinel.id,datedSentinel.sentAt]);datedSentinel=null;
 const report={version:'mailbox-message-list-isolated-integration-v2',pages,counts,total:40,crossAccountIdsExcluded:true,datedForeignSentinelVisibleOnlyToOwner:true,crossAccountReplayRejected:true,temporarySentinelDateRestored:true,realWasmProgram:true,replayGuardPassed:true,modelCalls:0,scope:'Actual isolated database reads and WASM through tool execute; not queued-agent/model end-to-end acceptance.'};
 await writeFile('experiments/hybrid-evaluation-v5/results/mail-list-integration.json',json(report));console.log(json(report));
}finally{if(datedSentinel)await admin.query('update mailbox_message set sent_at=$3::timestamptz where user_id=$1 and id=$2',[otherUserId,datedSentinel.id,datedSentinel.sentAt]);await admin.end();const {getPool}=await import('../../src/lib/rag/db');await getPool().end();}
