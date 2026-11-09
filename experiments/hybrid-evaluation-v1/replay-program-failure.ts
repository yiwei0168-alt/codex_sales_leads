import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {executeProgrammatic} from '../../src/lib/assistant/main/programmatic-execution';
import {interpretReadProgram} from '../../src/lib/assistant/main/hybrid-interpreter';
import {digest,type ModelToolCall,type ToolResult} from '../../src/lib/assistant/main/contracts';
import {id,json,local,sha,userId} from './runtime';

// Replay saved synthetic leaf responses only. No database or provider calls.
const traceText=await readFile(`${local}/performance/P09-B-1.trace.json`,'utf8'),trace=JSON.parse(traceText);
const original=trace.calls.find((c:{tool_id:string})=>c.tool_id==='programmatic_tools');
type Leaf={tool:string;arguments:unknown;output:ToolResult};
const leaves=original.output.data.leaves as Leaf[];
const snapshot=new Map(leaves.map(leaf=>[digest({tool:leaf.tool,arguments:leaf.arguments}),leaf.output]));
const probe=await interpretReadProgram('return {dateType:typeof Date, clockType:typeof globalThis.performance};',async()=>{throw Error('No bridge expected');});
assert.deepEqual(probe,{dateType:'undefined',clockType:'undefined'});
async function replay(code:string){
 let reads=0;
 const output=await executeProgrammatic({code},{userId,runId:id('offline-replay'),leaseToken:'offline',callId:original.id,role:'member',mode:'deep'},
  {allowed:new Set(['customer_timeline']),validate:async()=>{},dispatch:async(call:ModelToolCall)=>{
   const args=JSON.parse(call.function.arguments),saved=snapshot.get(digest(args));
   if(!saved)throw Error('Read not in original saved response set');reads++;return saved;
  }});
 return {reads,output};
}
const unchanged=await replay(original.input.code);
assert.equal(unchanged.reads,11);assert.equal(unchanged.output.status,'partial');
// A narrow diagnostic for this exact UTC fixture: explicit timestamp validation,
// lexical sort and substring. Not a general timezone parser or product code change.
const corrected=original.input.code
 .replace("function epoch(t){return Date.parse(t.replace(' ','T').replace(/\\+00$/, '+00:00'));}","function epoch(t){if(!/^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}\\+00$/.test(t))tools.handoff('Unsupported timestamp', {time:t});return t;}")
 .replace("if(events.some(e=>!Number.isFinite(epoch(e.time)))) tools.handoff('Unrecognized event timestamp',{result:r});","events.forEach(e=>epoch(e.time));")
 .replace('epoch(b.time)-epoch(a.time)','(epoch(a.time)<epoch(b.time)?1:epoch(a.time)>epoch(b.time)?-1:0)')
 .replace('new Date(epoch(e.time)).toISOString().slice(0,10)','epoch(e.time).slice(0,10)');
assert.notEqual(corrected,original.input.code);assert.equal(corrected.includes('Date.'),false);assert.equal(corrected.includes('new Date('),false);
const candidate=await replay(corrected);
assert.equal(candidate.reads,11);assert.equal(candidate.output.status,'success');
const rows=(candidate.output.data as {value:{rows:Array<{companyId:string;dateKey:string}>}}).value.rows;
assert.equal(rows.length,12);
assert.deepEqual(rows.map(r=>`${r.dateKey}/${r.companyId}`),rows.map(r=>`${r.dateKey}/${r.companyId}`).sort());
const report={version:'hybrid-program-failure-replay-v1',traceHash:sha(traceText),sandboxProbe:probe,
 original:{status:unchanged.output.status,reads:unchanged.reads,missing:unchanged.output.missing},
 correctedDiagnostic:{status:candidate.output.status,reads:candidate.reads,rows:rows.length,sorted:true,codeHash:sha(corrected)},
 conclusion:'The original program calls Date.parse/new Date, but this WASM contract removes Date. Same 11 saved reads plus the prior one produce 12 sorted rows with explicit UTC string handling.',
 databaseCalls:0,modelCalls:0,productionCodeChanged:false,generalTimezoneSupportProven:false};
await writeFile(`${local}/program-failure-replay.json`,json(report));console.log(json(report));
