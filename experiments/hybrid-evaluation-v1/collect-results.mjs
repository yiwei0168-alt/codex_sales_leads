import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const local='.local-runtime/hybrid-evaluation-v1',target='experiments/hybrid-evaluation-v1/results/2026-11-09';
const json=v=>JSON.stringify(v,null,2)+'\n';
const sha=s=>createHash('sha256').update(s.replaceAll('\r\n','\n')).digest('hex');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
await mkdir(target,{recursive:true});
const route=await read(`${local}/routing/development-summary.json`);
const replay=await read(`${local}/program-failure-replay.json`);
const labelReceipt=await read(`${local}/label-review/receipt.json`);
const labelReview={status:labelReceipt.status,latencyMs:labelReceipt.latencyMs,error:labelReceipt.error??null,
 receiptSha256:sha(json(labelReceipt)),paidAttempts:1,knownCostUsd:labelReceipt.response?.usage?.cost??null,
 labelReviewCompleted:false,holdoutRouterCalls:0,retried:false};
const tasks=await read('experiments/hybrid-evaluation-v1/performance-tasks.json');
const rows=[],identities=new Set(),reviewPackets=[];
for(const file of (await readdir(`${local}/performance`)).filter(f=>f.endsWith('.observation.json')).sort()){
 const o=await read(`${local}/performance/${file}`),text=await readFile(o.traceRef,'utf8'),trace=JSON.parse(text);
 for(const event of o.billableEvents)if(event.requestId){
  if(identities.has(event.requestId))throw Error('Duplicate provider request across performance tasks; reconcile before totaling');
  identities.add(event.requestId);
 }
 const uncertainty=o.billableEvents.filter(e=>e.amount===null).map(e=>({stage:e.stage,status:e.status,eventId:e.eventId}));
 rows.push({taskId:o.taskId,arm:o.arm,repetition:o.repetition,status:o.status,backendEnqueueToTerminalMs:o.timingMs.enqueueToTerminal,
  userVisibleMs:null,modelAttempts:o.modelAttempts,programAttempts:o.programCalls,
  successfulPrograms:trace.calls.filter(c=>c.tool_id==='programmatic_tools'&&c.output?.status==='success').length,
  knownCostUsd:o.billableEvents.reduce((sum,e)=>sum+(e.amount??0),0),unknownCharges:uncertainty,qualityReview:null,
  implementationAuthorInspection:o.taskId==='P23'?'Answer says no explicit deadline, cites the correct synthetic quote-request mail, no invented deadline; not blind independent acceptance.':null,
  traceSha256:sha(text),observationSha256:sha(json(o)),runtimeFreezeHash:o.runtimeFreezeHash});
 const reviewId=sha(`${o.runId}/blind-review`).slice(0,16);
 reviewPackets.push({reviewId,question:tasks.find(t=>t.id===o.taskId).prompt,answer:trace.final?.result?.reply??'',taskId:o.taskId});
}
const totals={submittedTasks:rows.length,plannedSmokeTasks:18,answered:rows.filter(r=>r.status==='answered').length,
 partial:rows.filter(r=>r.status==='partial').length,unstarted:18-rows.length,
 knownTaskCostUsd:rows.reduce((s,r)=>s+r.knownCostUsd,0),unknownTaskChargeCount:rows.reduce((s,r)=>s+r.unknownCharges.length,0)};
const report={version:'hybrid-evaluation-progress-2026-11-09',routeDevelopment:route,performance:{totals,rows,
 gatePassed:false,comparisonConclusion:'No overall efficiency/cost claim: only one task has a complete A/B/C block, three charges unknown, independent quality review pending, batch stopped on P09-B partial outcome.',
 remaining:'14 smoke tasks, holdout semantic review and 64 holdout cases, remaining controlled repeats, pagination/sales/external bindings and 27 live-search trials.'},
 diagnosis:replay,labelReview,productionChanged:false,
 costs:{routingKnownUsd:route.knownCostUsd,taskKnownUsd:totals.knownTaskCostUsd,
  combinedKnownUsd:route.knownCostUsd+totals.knownTaskCostUsd+(labelReview.knownCostUsd??0),
  qualityReviewKnownUsd:labelReview.knownCostUsd,unknownCharges:route.unknownChargeCount+totals.unknownTaskChargeCount+(labelReview.knownCostUsd===null?1:0),
  definition:'Provider-reported usage.cost, not invoice reconciliation; unknown charges excluded from known subtotal, never treated as zero. No price estimate.'}};
await writeFile(`${target}/progress.json`,json(report));
await writeFile(`${target}/route-development.json`,json(route));
await writeFile(`${target}/program-failure-replay.json`,json(replay));
for(const [from,to] of [['routing/freeze.json','routing-runtime-freeze.json'],['performance/freeze.json','performance-runtime-freeze.json'],
 ['mail-binding.json','mail-binding.json'],['knowledge-binding.json','knowledge-binding.json']])
 await writeFile(`${target}/${to}`,await readFile(`${local}/${from}`));
// No arms, model identities, timings or costs in the future review packet.
reviewPackets.sort((a,b)=>a.reviewId.localeCompare(b.reviewId));
await writeFile(`${local}/blind-answer-packets.json`,json(reviewPackets));
console.log(json({routingCases:route.cases,routeAccuracy:route.accuracyIncludingFallback,...totals,combinedKnownUsd:report.costs.combinedKnownUsd,
 performanceAccepted:false,productionChanged:false}));
