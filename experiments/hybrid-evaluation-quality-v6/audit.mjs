import {readFile,writeFile} from 'node:fs/promises';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const root='experiments/hybrid-evaluation-quality-v6';
const reviewed=await read(`${root}/results/review.json`),progress=await read('experiments/hybrid-evaluation-v6/results/progress.json');
const pagination=[];
for(const arm of ['A','B','C']){
 const trace=await read(`.local-runtime/hybrid-evaluation-v6/performance/P10-${arm}-1.trace.json`);
 const pages=trace.calls.filter(c=>c.tool_id==='mailbox_message_list');
 const items=pages.flatMap(p=>p.output.data.items),counts={};
 for(const item of items){const day=new Date(Date.parse(item.sentAt)+8*3600000).toISOString().slice(0,10);counts[day]=(counts[day]??0)+1;}
 const range=pages.every(p=>Date.parse(p.input.from)===Date.parse('2026-11-02T00:00:00+08:00')&&Date.parse(p.input.until)===Date.parse('2026-11-06T00:00:00+08:00'));
 const chain=pages.length===2&&pages[0].input.offset===0&&pages[0].output.data.nextOffset===20&&pages[0].output.data.hasMore===true&&pages[1].input.offset===20&&pages[1].output.data.hasMore===false;
 const expected={'2026-11-02':8,'2026-11-03':12,'2026-11-04':12,'2026-11-05':8};
 const correct=Object.keys(counts).length===4&&Object.entries(expected).every(([day,n])=>counts[day]===n);
 pagination.push({arm,pageCount:pages.length,items:items.length,unique:new Set(items.map(i=>i.id)).size,counts,range,chain,
  passed:range&&chain&&correct&&items.length===40&&new Set(items.map(i=>i.id)).size===40});
}
const bodyCoverage=[];
for(const arm of ['A','B']){
 const trace=await read(`.local-runtime/hybrid-evaluation-v6/performance/P02-${arm}-1.trace.json`);
 const timeline=trace.calls.find(c=>c.tool_id==='customer_timeline');
 bodyCoverage.push({arm,mailBodiesRead:trace.calls.filter(c=>c.tool_id==='mail_read'&&c.output.status==='success').length,
  timelineEvents:timeline?.output?.data?.events?.length,hasMore:timeline?.output?.data?.hasMore});
}
const matched=Object.fromEntries(['A','B','C'].map(arm=>[arm,progress.rows.find(r=>r.taskId==='P10'&&r.arm===arm)]));
const matchedEligible=pagination.every(p=>p.passed)&&reviewed.rows.filter(r=>r.taskId==='P10').length===3&&reviewed.rows.filter(r=>r.taskId==='P10').every(r=>r.passed)&&Object.values(matched).every(r=>r.status==='answered'&&r.billingComplete);
const comparison=matchedEligible?{taskId:'P10',latencyMetric:'enqueue-to-terminal',
 cToACostReduction:1-matched.C.knownCostUsd/matched.A.knownCostUsd,
 cToALatencyReduction:1-matched.C.backendEnqueueToTerminalMs/matched.A.backendEnqueueToTerminalMs,
 bToACostReduction:1-matched.B.knownCostUsd/matched.A.knownCostUsd,
 bToALatencyReduction:1-matched.B.backendEnqueueToTerminalMs/matched.A.backendEnqueueToTerminalMs,
 singleTaskSingleRepetition:true,statisticalQualification:false}:null;
const trace=await read('.local-runtime/hybrid-evaluation-v6/performance/P10-C-1.trace.json');
const router=trace.calls.find(c=>c.tool_id==='decision_router');
const report={version:'v6-mechanical-and-review-audit',rawModelReviewPassed:reviewed.passed,rawModelReviewTotal:reviewed.answers,
 pagination,bodyCoverage,
 disputedReviewItems:[{taskId:'P02',arm:'A',reason:'Reviewer assumed three read bodies, but actual receipts contain four. The answer truthfully says all imported records. Raw score is retained; this grade cannot establish a product defect or acceptance.'},
 {taskId:'P02',arm:'B',reason:'Reviewer deducted for not stating literal hasMore=false and omitting oldest event; latest-progress task does not require literal API fields or exhaustive history, and answer explicitly discloses 4 events / 3 bodies. Raw score retained, adjudication unresolved; do not mark passed.'}],
 comparison,
 autoProgramTask:{taskId:'P10',arm:'C',contextReadyProbability:router?.output?.data?.response?.answers?.context_ready?.probabilities?.yes,
  actualMainModels:matched.C.models,note:'Conservative initial routing used the dynamic profile, which then chose programmatic_tools. Actual interpreter use does not prove selection of the cheaper interpreter profile.'},
 knownTaskCostUsd:progress.knownCostUsd,unknownTaskCharges:progress.unknownCharges,historicalUnknownCharges:22,
 knownReviewCostUsd:reviewed.knownReviewCostUsd,overallAcceptancePassed:false,productionChanged:false};
await writeFile(`${root}/results/audit.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
