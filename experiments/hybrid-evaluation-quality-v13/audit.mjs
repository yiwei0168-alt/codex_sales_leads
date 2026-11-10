import {readFile,writeFile} from 'node:fs/promises';
import {checkMechanics} from './mechanics.mjs';
const read=async p=>JSON.parse(await readFile(p,'utf8')),root='experiments/hybrid-evaluation-quality-v13',phase=process.argv[2];
if(!['smoke','final'].includes(phase))throw Error('Use smoke or final');
const first=await read(`${root}/results/smoke-review.json`),later=phase==='final'?await read(`${root}/results/repeats-review.json`):{rows:[],knownReviewCostUsd:0,unknownReviewCharges:0};
const grades=[...first.rows,...later.rows],tasks=await read('experiments/hybrid-evaluation-v13/performance-tasks.json');
const env={fixture:await read('experiments/hybrid-evaluation-v1/business-fixtures.json'),mail:await read('.local-runtime/hybrid-evaluation-v1/mail-binding.json'),
 knowledge:await read('.local-runtime/hybrid-evaluation-v1/knowledge-binding.json'),extension:await read('.local-runtime/hybrid-local-read-extension-v1/binding.json')};
const rows=[];
for(const task of tasks)for(const repetition of phase==='smoke'?[1]:[1,2,3])for(const arm of ['A','B','C']){
 const path=`.local-runtime/hybrid-evaluation-v13/performance/${task.id}-${arm}-${repetition}`,o=await read(`${path}.observation.json`),trace=await read(`${path}.trace.json`);
 const matches=grades.filter(g=>g.runId===o.runId);if(matches.length>1)throw Error('Duplicate grade');const grade=matches[0],mechanical=checkMechanics(task.id,trace.calls,env);
 rows.push({taskId:task.id,arm,repetition,runId:o.runId,status:o.status,qualityScore:grade?.total??null,reviewed:Boolean(grade),modelReviewPassed:grade?.passed===true,
  mechanicalPassed:mechanical.passed,detail:mechanical,correct:grade?.passed===true&&mechanical.passed&&o.status==='answered'&&!trace.policyViolation,
  policyViolation:trace.policyViolation,hardGatePass:grade?.hardGatePass??null,knownCostUsd:o.billableEvents.reduce((n,e)=>n+(e.amount??0),0),
  unknownCharges:o.billableEvents.filter(e=>e.amount===null).length,billingComplete:o.billingComplete,backendMs:o.timingMs.enqueueToTerminal,mainCalls:o.modelAttempts,programs:o.programCalls});
}
const byArm=Object.fromEntries(['A','B','C'].map(arm=>{const r=rows.filter(r=>r.arm===arm);return [arm,{submitted:r.length,correct:r.filter(r=>r.correct).length,rate:r.filter(r=>r.correct).length/r.length,
 knownCostUsd:r.reduce((s,r)=>s+r.knownCostUsd,0),unknownCharges:r.reduce((s,r)=>s+r.unknownCharges,0)}];}));
const correctRate=rows.filter(r=>r.correct).length/rows.length;
const qualityPassed=correctRate>=.95&&byArm.C.rate>=byArm.A.rate-.05&&rows.every(r=>r.reviewed&&r.hardGatePass&&!r.policyViolation);
const median=a=>{const s=[...a].sort((a,b)=>a-b),n=s.length;return n?n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2:null;};
const percentile=(a,p)=>[...a].sort((a,b)=>a-b)[Math.max(0,Math.ceil(a.length*p)-1)]??null;
const pairs=rows.filter(r=>r.arm==='C').flatMap(c=>{const a=rows.find(r=>r.arm==='A'&&r.taskId===c.taskId&&r.repetition===c.repetition);return a.correct&&c.correct&&a.backendMs>0&&c.backendMs>0?[{taskId:c.taskId,a:a.backendMs,c:c.backendMs,reduction:1-c.backendMs/a.backendMs}]:[];});
const completeBilling=rows.every(r=>r.billingComplete&&r.unknownCharges===0),costReduction=completeBilling?1-byArm.C.knownCostUsd/byArm.A.knownCostUsd:null;
const pairedMedianLatencyReduction=median(pairs.map(p=>p.reduction)),p95LatencyIncrease=pairs.length?percentile(pairs.map(p=>p.c),.95)/percentile(pairs.map(p=>p.a),.95)-1:null;
let bootstrap=null;
if(phase==='final'){
 let seed=20261110;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
 const times=[],costs=[];
 for(let n=0;n<5000;n++){const sample=Array.from({length:tasks.length},()=>tasks[Math.floor(random()*tasks.length)].id),p=sample.flatMap(id=>pairs.filter(p=>p.taskId===id));if(p.length)times.push(median(p.map(p=>p.reduction)));
  const r=sample.flatMap(id=>rows.filter(r=>r.taskId===id));if(completeBilling)costs.push(1-r.filter(r=>r.arm==='C').reduce((s,r)=>s+r.knownCostUsd,0)/r.filter(r=>r.arm==='A').reduce((s,r)=>s+r.knownCostUsd,0));}
 bootstrap={taskClusterSamples:5000,seed:20261110,medianLatencyReduction95Interval:[percentile(times,.025),percentile(times,.975)],totalCostReduction95Interval:completeBilling?[percentile(costs,.025),percentile(costs,.975)]:null};
}
const report={version:'v13-expanded-local-read-gate',phase,submitted:rows.length,reviewed:rows.filter(r=>r.reviewed).length,qualityPassed,correctRate,byArm,rows,
 eligibleLatencyPairs:pairs.length,excludedLatencyPairs:rows.length/3-pairs.length,costReduction,pairedMedianLatencyReduction,p95LatencyIncrease,bootstrap,
 localReadQualificationPassed:phase==='final'&&qualityPassed&&completeBilling&&costReduction>=.2&&pairedMedianLatencyReduction>=.2&&p95LatencyIncrease<=.1,
 overallAcceptancePassed:false,independentHumanGold:false,productionChanged:false,userVisibleTimingAvailable:false,historicalUnknownCharges:45,
 knownReviewCostUsd:first.knownReviewCostUsd+later.knownReviewCostUsd,unknownReviewCharges:first.unknownReviewCharges+later.unknownReviewCharges};
await writeFile(`${root}/results/${phase==='smoke'?'smoke-gate':'final-audit'}.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({phase,submitted:rows.length,reviewed:report.reviewed,qualityPassed,correctRate,costReduction,pairedMedianLatencyReduction,p95LatencyIncrease,localReadQualificationPassed:report.localReadQualificationPassed,
 failures:rows.filter(r=>!r.correct).map(({taskId,arm,repetition,status,reviewed,mechanicalPassed,modelReviewPassed})=>({taskId,arm,repetition,status,reviewed,mechanicalPassed,modelReviewPassed}))}));
