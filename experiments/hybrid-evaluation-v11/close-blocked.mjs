import {readFile,writeFile} from 'node:fs/promises';
import {checkMechanics} from '../hybrid-evaluation-quality-v11/mechanics.mjs';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const progress=await read('experiments/hybrid-evaluation-v11/results/progress.json');
if(progress.submitted!==18)throw Error('Expected complete first repeat only');
const env={fixture:await read('experiments/hybrid-evaluation-v1/business-fixtures.json'),mail:await read('.local-runtime/hybrid-evaluation-v1/mail-binding.json'),knowledge:await read('.local-runtime/hybrid-evaluation-v1/knowledge-binding.json'),extension:await read('.local-runtime/hybrid-local-read-extension-v1/binding.json')};
const rows=[];
for(const r of progress.rows){
 const t=await read(`.local-runtime/hybrid-evaluation-v11/performance/${r.taskId}-${r.arm}-${r.repetition}.trace.json`);
 rows.push({taskId:r.taskId,arm:r.arm,status:r.status,httpStatuses:t.wire.map(w=>w.status??null),paymentRequired:t.wire.some(w=>w.status===402),mechanics:checkMechanics(r.taskId,t.calls,env),qualityScore:null,reviewed:false,traceHash:r.traceHash});
}
const report={version:'v11-closed-credit-blocked',closed:true,submitted:18,planned:54,unsubmitted:36,answered:progress.answered,partial:18-progress.answered,
 paymentRequiredTasks:rows.filter(r=>r.paymentRequired).length,mechanicalPasses:rows.filter(r=>r.mechanics.passed).length,reviewed:0,
 knownTaskCostUsd:progress.knownCostUsd,unknownTaskCharges:progress.unknownCharges,historicalUnknownCharges:33,
 knownReviewCostUsd:0,unknownReviewCharges:0,qualityPassed:false,performanceGatePassed:false,overallAcceptancePassed:false,
 maximumPossibleCorrectRate:progress.answered/18,reason:'First repeat already cannot meet >=95% correct-completed gate. Reviewer and repeat requests were not issued; no grades fabricated. Read-only account query confirmed approximately USD 0.050230136 remaining and no per-key limit. Exact 402 limit_source was not captured, so the precise admission constraint is not proven.',
 productionChanged:false,rows};
await writeFile('experiments/hybrid-evaluation-v11/results/closed-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({submitted:18,answered:report.answered,paymentRequiredTasks:report.paymentRequiredTasks,mechanicalPasses:report.mechanicalPasses,unknownTaskCharges:report.unknownTaskCharges,qualityPassed:false}));
