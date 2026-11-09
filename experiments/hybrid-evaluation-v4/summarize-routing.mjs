import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const local='.local-runtime/hybrid-evaluation-v4',target='experiments/hybrid-evaluation-v4/results';
const sha=s=>createHash('sha256').update(s.replaceAll('\r\n','\n')).digest('hex');
const cases=JSON.parse(await readFile('experiments/hybrid-evaluation-v1/routing-cases.json','utf8')).filter(c=>c.split==='holdout');
const reviewText=await readFile(`${local}/label-review/report.json`,'utf8'),review=JSON.parse(reviewText);
const rows=[];
for(const file of (await readdir(`${local}/routing/holdout`)).filter(f=>f.endsWith('.observation.json'))){
 const r=JSON.parse(await readFile(`${local}/routing/holdout/${file}`,'utf8'));
 const expected=cases.find(c=>c.id===r.caseId)?.expected.initialRoute;if(!expected)throw Error('Unknown case');
 rows.push({...r,expected});
}
rows.sort((a,b)=>a.caseId.localeCompare(b.caseId));
const routed=rows.filter(r=>r.providerRequested),completed=routed.filter(r=>r.providerStatus==='completed'),events=routed.flatMap(r=>r.billableEvents);
const classes=['fixed_workflow','interpreter','dynamic_agent'];
const perClass=Object.fromEntries(classes.map(route=>{const tp=routed.filter(r=>r.expected===route&&r.appliedRoute===route).length,
 predicted=routed.filter(r=>r.appliedRoute===route).length,expected=routed.filter(r=>r.expected===route).length;
 const precision=predicted?tp/predicted:0,recall=expected?tp/expected:0;
 return [route,{tp,predicted,expected,precision,recall,f1:precision+recall?2*precision*recall/(precision+recall):0}];}));
const latency=completed.map(r=>r.latencyMs).sort((a,b)=>a-b),complete=rows.length===64&&completed.length===routed.length;
const report={version:'route-holdout-summary-v4',reviewSha256:sha(reviewText),reviewer:review.reviewerModel,
 labelAgreement:review.differences.length===0,independentHumanGold:false,plannedCases:64,observedCases:rows.length,remainingCases:64-rows.length,
 complete,providerAttempts:routed.length,providerCompleted:completed.length,ruleOrGuardCases:rows.length-routed.length,
 guardOrRuleProviderCalls:rows.filter(r=>r.entryPath!=='jev'&&r.providerRequested).length,
 pipelineCorrect:rows.filter(r=>r.expected===r.appliedRoute).length,providerCorrect:routed.filter(r=>r.expected===r.appliedRoute).length,
 perClass,macroF1:Object.values(perClass).reduce((s,r)=>s+r.f1,0)/3,successfulP95Ms:latency[Math.ceil(latency.length*.95)-1]??null,
 errors:rows.filter(r=>r.expected!==r.appliedRoute||!['skipped','completed'].includes(r.providerStatus)).map(r=>({caseId:r.caseId,expected:r.expected,actual:r.appliedRoute,providerStatus:r.providerStatus})),
 knownRouteCostUsd:events.reduce((s,e)=>s+(e.amount??0),0),unknownRouteCharges:events.filter(e=>e.amount===null).length,
 reviewCostUsd:review.knownCostUsd,thresholdsChanged:false,
 qualification:'Diagnostic model-reviewed labels; report partial runs as partial. Not independent human Gold or business answer quality acceptance.'};
await writeFile(`${target}/routing-summary.json`,JSON.stringify(report,null,2)+'\n');
await writeFile(`${target}/routing-runtime-freeze.json`,await readFile(`${local}/routing/freeze.json`));
console.log(JSON.stringify(report,null,2));
