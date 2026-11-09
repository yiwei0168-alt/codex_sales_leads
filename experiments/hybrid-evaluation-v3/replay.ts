import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {executeProgrammatic} from '../../src/lib/assistant/main/programmatic-execution';
import {toolModelView} from '../../src/lib/assistant/main/tool-model-view';
import {digest,type ModelMessage,type ToolResult} from '../../src/lib/assistant/main/contracts';
import {type HybridLeaf} from '../../src/lib/assistant/main/hybrid-contracts';
import {id,json,sha,userId} from '../hybrid-evaluation-v1/runtime';
const text=await readFile('.local-runtime/hybrid-evaluation-v2/performance/P09-B-1.trace.json','utf8'),trace=JSON.parse(text);
type Call={id:string;tool_id:string;input:Record<string,unknown>;output:ToolResult};
const calls=trace.calls as Call[],parent=calls.find(c=>c.tool_id==='programmatic_tools')!;
const reads=calls.filter(c=>c.tool_id==='customer_timeline'&&c.output.status==='success');
const receipts=new Map<string,HybridLeaf>(reads.map(c=>[c.id,{key:c.id,tool:c.tool_id,arguments:c.input,output:c.output}]));
assert.equal(receipts.size,13);
const code=`const saved=${JSON.stringify(reads.map(c=>c.id))}.map(id=>tools.receipt(id));
const timelines=saved.filter(r=>r.data.customer);
if(timelines.some(r=>r.data.hasMore||!r.data.events.length)) tools.handoff('Incomplete timeline');
const rows=timelines.map(r=>{const latest=r.data.events.slice().sort((a,b)=>tools.time(b.time).epochMs-tools.time(a.time).epochMs||a.id.localeCompare(b.id))[0];
return {company:r.data.customer.name,companyId:r.data.customer.id,date:tools.time(latest.time).utcIso.slice(0,10),
time:latest.time,messageId:latest.id,sourceUrl:latest.sourceUrl,callId:r.callId};});
rows.sort((a,b)=>a.date.localeCompare(b.date)||a.companyId.localeCompare(b.companyId));
return {rows,coverage:{companies:rows.length,events:timelines.reduce((n,r)=>n+r.data.events.length,0),hasMore:false,scope:'Imported mail only'}};`;
let used=0;
const output=await executeProgrammatic({code},{userId,runId:trace.runId,leaseToken:'snapshot',callId:parent.id,role:'member',mode:'deep'},
 {allowed:new Set(['customer_timeline']),dispatch:async()=>{throw Error('No new read allowed');},
  readReceipt:async key=>{const r=receipts.get(key);assert.ok(r);used++;return structuredClone(r);},
  validate:async leaves=>{for(const l of leaves)assert.equal(digest(l),digest(receipts.get(l.output.callId!)));}});
assert.equal(output.status,'success');
const value=(output.data as {value:{rows:Array<{companyId:string;date:string;messageId:string}>;coverage:{events:number}}}).value;
const fixture=JSON.parse(await readFile('experiments/hybrid-evaluation-v1/business-fixtures.json','utf8'));
const expected=fixture.companies.map((c:{id:string})=>{const m=fixture.mails.filter((m:{companyId:string})=>m.companyId===c.id)
 .sort((a:{date:string},b:{date:string})=>b.date.localeCompare(a.date))[0];return {companyId:id(c.id),date:m.date.slice(0,10),messageId:id(m.id)};})
 .sort((a:{date:string;companyId:string},b:{date:string;companyId:string})=>a.date.localeCompare(b.date)||a.companyId.localeCompare(b.companyId));
assert.deepEqual(value.rows.map(({companyId,date,messageId})=>({companyId,date,messageId})),expected);assert.equal(value.coverage.events,48);
function view(out:ToolResult){const messages:ModelMessage[]=[{role:'assistant',content:null,tool_calls:[{id:'p',type:'function',function:{name:'execute_tool',arguments:'{"tool":"programmatic_tools","arguments":{}}'}}]},
 {role:'tool',tool_call_id:'p',content:JSON.stringify(out)}];return JSON.parse(toolModelView(messages)[1].content!);}
assert.equal(view(parent.output).status,'partial');assert.equal(view(output).status,'success');
const report={version:'compact-program-projection-replay-v3',sourceTraceHash:sha(text),codeHash:sha(code),reusedReceipts:used,rows:value.rows.length,
 allDatesOrderAndMailIdsCorrect:true,eventsCovered:48,originalValueChars:JSON.stringify((parent.output.data as {value:unknown}).value).length,
 compactValueChars:JSON.stringify(value).length,newModelCalls:0,newToolDispatches:0,storedEvidencePreserved:true,
 scope:'Offline regression only; character reduction is not measured token, latency or cost savings.'};
await mkdir('experiments/hybrid-evaluation-v3/results',{recursive:true});await writeFile('experiments/hybrid-evaluation-v3/results/replay.json',json(report));console.log(json(report));
