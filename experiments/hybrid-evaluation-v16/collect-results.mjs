import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const local='.local-runtime/hybrid-evaluation-v16',target='experiments/hybrid-evaluation-v16/results';
const json=value=>JSON.stringify(value,null,2)+'\n';
const sha=text=>createHash('sha256').update(text.replaceAll('\r\n','\n')).digest('hex');
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const freezeText=await readFile(`${local}/performance/freeze.json`,'utf8'),freezeHash=sha(freezeText);
const rows=[],providerIds=new Set(),packets=[];
const tasks=await read('experiments/hybrid-evaluation-v16/performance-tasks.json');
for(const name of (await readdir(`${local}/performance`)).filter(f=>f.endsWith('.observation.json')).sort()){
 const o=await read(`${local}/performance/${name}`),text=await readFile(o.traceRef,'utf8'),trace=JSON.parse(text);
 if(o.runtimeFreezeHash!==freezeHash)throw Error('Mixed runtime versions');
 for(const e of o.billableEvents)if(e.requestId){if(providerIds.has(e.requestId))throw Error('Duplicate billed request');providerIds.add(e.requestId);}
 rows.push({taskId:o.taskId,arm:o.arm,repetition:o.repetition,status:o.status,backendEnqueueToTerminalMs:o.timingMs.enqueueToTerminal,
  modelAttempts:o.modelAttempts,models:[...new Set(trace.calls.filter(c=>c.tool_id==='main_model').map(c=>c.metrics?.requestedModel).filter(Boolean))],
  programAttempts:o.programCalls,successfulPrograms:trace.calls.filter(c=>['programmatic_tools','programmatic_read'].includes(c.tool_id)&&c.output?.status==='success').length,
  actualRoutes:o.actualRoutes,knownCostUsd:o.billableEvents.reduce((s,e)=>s+(e.amount??0),0),
  unknownCharges:o.billableEvents.filter(e=>e.amount===null).map(e=>({eventId:e.eventId,stage:e.stage,status:e.status})),
  billingComplete:o.billingComplete,qualityReview:null,traceHash:sha(text),observationHash:sha(json(o))});
 const task=tasks.find(t=>t.id===o.taskId);
 packets.push({reviewId:sha(`${o.runId}/blind-v2`).slice(0,16),taskId:o.taskId,question:task.prompt,
  answer:trace.final?.result?.reply??'',assertions:task.assertions,sourceCoverage:task.sourceCoverage,forbiddenEffects:task.forbiddenEffects});
}
const report={version:'hybrid-performance-six-task-v16-progress',runtimeFreezeHash:freezeHash,submitted:rows.length,planned:54,
 answered:rows.filter(r=>r.status==='answered').length,remaining:54-rows.length,
 knownCostUsd:rows.reduce((s,r)=>s+r.knownCostUsd,0),unknownCharges:rows.reduce((s,r)=>s+r.unknownCharges.length,0),rows,
 historicalUnknownCharges:61,independentQualityAccepted:false,performanceGatePassed:false,userVisibleTimingAvailable:false,
 conclusion:'Diagnostic smoke only. Independent quality/holdout review and broader fixtures remain required before claiming overall latency/cost improvement.',
 productionChanged:false};
await mkdir(target,{recursive:true});await writeFile(`${target}/progress.json`,json(report));
await writeFile(`${target}/performance-runtime-freeze.json`,freezeText);
packets.sort((a,b)=>a.reviewId.localeCompare(b.reviewId));await writeFile(`${local}/blind-answer-packets.json`,json(packets));
console.log(json({submitted:report.submitted,answered:report.answered,remaining:report.remaining,knownCostUsd:report.knownCostUsd,unknownCharges:report.unknownCharges}));
