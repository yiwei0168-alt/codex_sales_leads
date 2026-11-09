import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {executeProgrammatic} from '../../src/lib/assistant/main/programmatic-execution';
import {digest,type ToolResult} from '../../src/lib/assistant/main/contracts';
import {type HybridLeaf} from '../../src/lib/assistant/main/hybrid-contracts';
import {sha,json,userId} from '../hybrid-evaluation-v1/runtime';

// Offline snapshot regression: no database, network or model calls.
const text=await readFile('.local-runtime/hybrid-evaluation-v1/performance/P09-B-1.trace.json','utf8'),trace=JSON.parse(text);
type Call={id:string;tool_id:string;input:Record<string,unknown>;output:ToolResult};
const calls=trace.calls as Call[],original=calls.find(c=>c.tool_id==='programmatic_tools')!;
const reads=calls.filter(c=>c.tool_id==='customer_timeline'&&c.output.status==='success');
assert.equal(reads.length,13); // One company list, twelve timelines.
const receipts=new Map<string,HybridLeaf>(reads.map(c=>[c.id,{key:c.id,tool:c.tool_id,arguments:c.input,output:c.output}]));
const originalCode=original.input.code as string;
const code=`const saved=${JSON.stringify(reads.map(c=>c.id))}.map(id=>tools.receipt(id));
const all=saved.filter(r=>r.data.customer);
`+originalCode.slice(originalCode.indexOf('const issues ='))
 .replace("function epoch(t){return Date.parse(t.replace(' ','T').replace(/\\+00$/, '+00:00'));}",
   'function epoch(t){return tools.time(t).epochMs;}')
 .replace('new Date(epoch(e.time)).toISOString().slice(0,10)','tools.time(e.time).utcIso.slice(0,10)');
assert.ok(!code.includes('Date.'));assert.ok(!code.includes('tools.parallel'));
let reused=0,validated=0;
const out=await executeProgrammatic({code},{userId,runId:trace.runId,leaseToken:'offline',callId:original.id,role:'member',mode:'deep'},
 {allowed:new Set(['customer_timeline']),dispatch:async()=>{throw Error('No new reads allowed');},
  readReceipt:async id=>{const leaf=receipts.get(id);assert.ok(leaf);reused++;return structuredClone(leaf);},
  validate:async leaves=>{for(const leaf of leaves)assert.equal(digest(leaf),digest(receipts.get(leaf.output.callId!)));validated++;}});
assert.equal(out.status,'success');
const data=out.data as {leaves:HybridLeaf[];value:{rows:Array<{companyId:string;dateKey:string;callId:string}>}};
assert.equal(data.leaves.length,13);assert.equal(data.value.rows.length,12);
const order=data.value.rows.map(r=>`${r.dateKey}/${r.companyId}`);assert.deepEqual(order,[...order].sort());
assert.equal(new Set(data.value.rows.map(r=>r.companyId)).size,12);
const result={version:'interpreter-receipt-regression-v2',traceHash:sha(text),codeHash:sha(code),
 status:out.status,rows:12,uniqueCompanies:12,sorted:true,serverSnapshotReceipts:reused,validationPasses:validated,
 modelCalls:0,newToolDispatches:0,databaseCalls:0,limitation:'Offline snapshot validation; live journal permissions are tested separately.'};
await mkdir('experiments/hybrid-evaluation-v2/results',{recursive:true});
await writeFile('experiments/hybrid-evaluation-v2/results/replay.json',json(result));console.log(json(result));
