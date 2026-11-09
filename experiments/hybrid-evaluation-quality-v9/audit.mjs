import {readFile,writeFile} from 'node:fs/promises';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const root='experiments/hybrid-evaluation-quality-v9',review=await read(`${root}/results/review.json`);
const progress=await read('experiments/hybrid-evaluation-v9/results/progress.json');
const freeze=await read('.local-runtime/hybrid-evaluation-v9/performance/freeze.json');
const rows=[];
for(const arm of ['A','B','C']){
 const trace=await read(`.local-runtime/hybrid-evaluation-v9/performance/P10-${arm}-1.trace.json`);
 const pages=trace.calls.filter(c=>c.tool_id==='mailbox_message_list'),items=pages.flatMap(p=>p.output.data?.items??[]),counts={};
 for(const item of items){const day=new Date(Date.parse(item.sentAt)+8*3600000).toISOString().slice(0,10);counts[day]=(counts[day]??0)+1;}
 const range=pages.length>0&&pages.every(p=>Date.parse(p.input.from)===Date.parse('2026-11-02T00:00:00+08:00')&&Date.parse(p.input.until)===Date.parse('2026-11-06T00:00:00+08:00'));
 const chain=pages.length===2&&pages[0].input.offset===0&&pages[0].output.data.nextOffset===20&&pages[0].output.data.hasMore===true&&pages[1].input.offset===20&&pages[1].output.data.hasMore===false;
 const expected={'2026-11-02':8,'2026-11-03':12,'2026-11-04':12,'2026-11-05':8};
 const correct=Object.keys(counts).length===4&&Object.entries(expected).every(([day,n])=>counts[day]===n);
 const observation=progress.rows.find(r=>r.taskId==='P10'&&r.arm===arm),grade=review.rows.find(r=>r.taskId==='P10'&&r.arm===arm);
 if(!observation||!grade)throw Error('Incomplete pilot coverage');
 rows.push({arm,paginationPassed:range&&chain&&correct&&items.length===40&&new Set(items.map(i=>i.id)).size===40,
  pages:pages.length,counts,uniqueMessages:new Set(items.map(i=>i.id)).size,qualityPassed:grade.passed,qualityScore:grade.total,
  ...observation,routerContextReady:trace.calls.find(c=>c.tool_id==='decision_router')?.output?.data?.response?.answers?.context_ready?.probabilities?.yes??null});
}
const byArm=Object.fromEntries(rows.map(r=>[r.arm,r]));
const eligible=rows.every(r=>r.paginationPassed&&r.qualityPassed&&r.status==='answered'&&r.billingComplete);
const comparison=eligible?{cToACostReduction:1-byArm.C.knownCostUsd/byArm.A.knownCostUsd,
 cToALatencyReduction:1-byArm.C.backendEnqueueToTerminalMs/byArm.A.backendEnqueueToTerminalMs,
 bToACostReduction:1-byArm.B.knownCostUsd/byArm.A.knownCostUsd,
 bToALatencyReduction:1-byArm.B.backendEnqueueToTerminalMs/byArm.A.backendEnqueueToTerminalMs}:null;
const expectedModel=freeze.configs.C.automatic.profiles.interpreter.routes[0].model;
const routeIntegrationPassed=byArm.C.models.includes(expectedModel)&&byArm.C.successfulPrograms>0;
const report={version:'v9-p10-quality-cost-latency-audit',rows,comparison,routeIntegrationPassed,
 numericalPilotGatesPassed:Boolean(eligible&&routeIntegrationPassed&&comparison.cToACostReduction>=.2&&comparison.cToALatencyReduction>=.2),
 sampleBusinessTasks:1,repetitions:1,p95Qualification:false,overallAcceptancePassed:false,
 knownTaskCostUsd:progress.knownCostUsd,unknownTaskCharges:progress.unknownCharges,historicalUnknownCharges:26,knownReviewCostUsd:review.knownReviewCostUsd,
 productionChanged:false,limitations:'Single diagnostic business task; no broad/repeated-task or browser-visible latency claim. Preserve older failures, candidates and charge uncertainty.'};
await writeFile(`${root}/results/audit.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({eligible,comparison,routeIntegrationPassed,numericalPilotGatesPassed:report.numericalPilotGatesPassed,overallAcceptancePassed:false}));
