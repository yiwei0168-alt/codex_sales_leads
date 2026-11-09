import {readFile,writeFile} from 'node:fs/promises';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const root='experiments/hybrid-evaluation-quality-v10';
const execution=await read('experiments/hybrid-evaluation-v10/results/progress.json');
const first=await read(`${root}/results/smoke-review.json`),later=await read(`${root}/results/repeats-review.json`);
const adjudication=await read('experiments/hybrid-quality-adjudication-v10/results/review.json');
const grades=[...first.rows,...later.rows],effective=grades.map(g=>adjudication.rows.find(a=>a.runId===g.runId)??g);
const report={version:'v10-closed-incomplete-review',submitted:execution.submitted,answered:execution.answered,
 maximumPossibleCorrectRate:execution.answered/execution.submitted,requiredCorrectRate:.95,
 executionGatePassed:execution.answered/execution.submitted>=.95,reviewed:grades.length,
 rawReviewPassed:grades.filter(g=>g.passed).length,effectiveReviewPassed:effective.filter(g=>g.passed).length,
 unreviewed:later.unreviewed,reviewComplete:false,qualityPassed:false,localReadQualificationPassed:false,overallAcceptancePassed:false,
 costReduction:null,qualityMatchedLatencyReduction:null,
 knownTaskCostUsd:execution.knownCostUsd,unknownTaskCharges:execution.unknownCharges,
 knownReviewCostUsd:first.knownReviewCostUsd+later.knownReviewCostUsd+adjudication.knownReviewCostUsd,
 unknownReviewCharges:later.unknownReviewCharges,historicalUnknownCharges:execution.historicalUnknownCharges,
 partialTasks:execution.rows.filter(r=>r.status!=='answered').map(({taskId,arm,repetition,status})=>({taskId,arm,repetition,status})),
 byArm:Object.fromEntries(['A','B','C'].map(arm=>{const rows=execution.rows.filter(r=>r.arm===arm);return [arm,{submitted:rows.length,answered:rows.filter(r=>r.status==='answered').length,knownCostUsd:rows.reduce((s,r)=>s+r.knownCostUsd,0),unknownCharges:rows.reduce((s,r)=>s+r.unknownCharges.length,0)}];})),
 reason:'3/54 incomplete tasks already exceed the 5% limit. Two unknown review calls leave 12 answers ungraded. No scores or provider charges imputed; no failed requests reissued. Original smoke correction retained separately.',
 productionChanged:false,userVisibleTimingAvailable:false,independentHumanGold:false};
await writeFile(`${root}/results/incomplete-audit.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({submitted:report.submitted,answered:report.answered,reviewed:report.reviewed,effectiveReviewPassed:report.effectiveReviewPassed,maximumPossibleCorrectRate:report.maximumPossibleCorrectRate,unknownReviewCharges:report.unknownReviewCharges,acceptance:false}));
