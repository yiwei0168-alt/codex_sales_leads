import {readFile,writeFile,copyFile,constants} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root='experiments/hybrid-evaluation-quality-v10',phase=process.argv[2];
if(!['smoke','final'].includes(phase))throw Error('Use smoke or final');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const file=`${root}/results/${phase==='smoke'?'smoke-gate':'final-audit'}.json`,rawFile=file.replace('.json','.raw.json');
try{await copyFile(file,rawFile,constants.COPYFILE_EXCL);}catch(e){if(e.code!=='EEXIST')throw e;}
const rawText=await readFile(rawFile,'utf8'),report=JSON.parse(rawText);
const adjudication=await read('experiments/hybrid-quality-adjudication-v10/results/review.json');
if(adjudication.rows.length!==1||adjudication.rows[0].taskId!=='P02'||adjudication.rows[0].arm!=='A')throw Error('Unexpected adjudication population');
const grade=adjudication.rows[0],knowledge=await read('.local-runtime/hybrid-evaluation-v1/knowledge-binding.json');
const expected=knowledge.documents.filter(d=>d.model==='NX410');
for(const row of report.rows){
 if(row.taskId==='P24'){
  const trace=await read(`.local-runtime/hybrid-evaluation-v10/performance/P24-${row.arm}-${row.repetition}.trace.json`);
  const returned=trace.calls.filter(c=>c.tool_id==='knowledge_compare'&&['success','partial'].includes(c.output?.status)).flatMap(c=>c.output?.data?.entities?.flatMap(e=>e.evidence??[])??[]);
  const checks=expected.map(d=>({version:d.version,present:returned.some(e=>e.documentId===d.documentId&&e.sourceUrl===`fixture://products/p1/${d.version}#page=2`&&e.content.includes(`版本：${d.version}`)&&e.content.includes(`端口数：${d.version==='v1'?5:8}`))}));
  row.mechanicalPassed=row.mechanicalPassed||checks.length===2&&checks.every(c=>c.present);
  row.detail={...row.detail,partialSourceCorrection:checks};
 }
 if(row.taskId==='P02'&&row.arm==='A'&&row.repetition===1){
  const observation=await read('.local-runtime/hybrid-evaluation-v10/performance/P02-A-1.observation.json');
  if(observation.runId!==grade.runId)throw Error('Adjudication run mismatch');
  row.rawModelReviewPassed=row.modelReviewPassed;row.rawQualityScore=row.qualityScore;
  row.modelReviewPassed=grade.passed;row.qualityScore=grade.total;row.adjudicationRef='experiments/hybrid-quality-adjudication-v10/results/review.json';
 }
 row.correct=row.modelReviewPassed&&row.mechanicalPassed&&row.status==='answered'&&!row.policyViolation;
}
const rows=report.rows,originalGrades=[...(await read(`${root}/results/smoke-review.json`)).rows,...(phase==='final'?(await read(`${root}/results/repeats-review.json`)).rows:[])];
const effectiveGrades=originalGrades.map(g=>g.runId===grade.runId?grade:g);
for(const arm of ['A','B','C']){const r=rows.filter(r=>r.arm===arm);report.byArm[arm].correct=r.filter(r=>r.correct).length;report.byArm[arm].rate=r.filter(r=>r.correct).length/r.length;}
report.correctRate=rows.filter(r=>r.correct).length/rows.length;
report.qualityPassed=report.correctRate>=.95&&report.byArm.C.rate>=report.byArm.A.rate-.05&&rows.every(r=>!r.policyViolation)&&effectiveGrades.every(g=>g.hardGatePass);
const pairs=rows.filter(r=>r.arm==='C').flatMap(c=>{const a=rows.find(r=>r.arm==='A'&&r.taskId===c.taskId&&r.repetition===c.repetition);return a.correct&&c.correct&&a.backendMs>0&&c.backendMs>0?[{taskId:c.taskId,a:a.backendMs,c:c.backendMs,reduction:1-c.backendMs/a.backendMs}]:[];});
const median=a=>{const s=[...a].sort((a,b)=>a-b),n=s.length;return n?n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2:null;};
const percentile=(a,p)=>[...a].sort((a,b)=>a-b)[Math.max(0,Math.ceil(a.length*p)-1)]??null;
report.eligibleLatencyPairs=pairs.length;report.excludedLatencyPairs=rows.length/3-pairs.length;
report.pairedMedianLatencyReduction=median(pairs.map(p=>p.reduction));
report.p95LatencyIncrease=pairs.length?percentile(pairs.map(p=>p.c),.95)/percentile(pairs.map(p=>p.a),.95)-1:null;
if(phase==='final'){
 let seed=20261110;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
 const ids=[...new Set(rows.map(r=>r.taskId))],samples=[];
 for(let i=0;i<5000;i++){const draws=Array.from({length:ids.length},()=>ids[Math.floor(random()*ids.length)]),selected=draws.flatMap(id=>pairs.filter(p=>p.taskId===id));if(selected.length)samples.push(median(selected.map(p=>p.reduction)));}
 report.bootstrap={...report.bootstrap,medianLatencyReduction95Interval:[percentile(samples,.025),percentile(samples,.975)]};
}
report.version='v10-explicitly-corrected-local-read-gate';
report.rawGateRef=rawFile;report.rawGateHash=createHash('sha256').update(rawText).digest('hex');
report.knownAdjudicationCostUsd=adjudication.knownReviewCostUsd;
report.corrections=['P24 accepts actual source originals in partial comparison output; no inference from status alone.','P02-A first repeat uses the once-only independent-context coverage adjudication; original grade preserved.'];
report.localReadQualificationPassed=phase==='final'&&report.qualityPassed&&rows.every(r=>r.billingComplete&&r.unknownCharges===0)&&report.costReduction>=.2&&report.pairedMedianLatencyReduction>=.2&&report.p95LatencyIncrease<=.1;
await writeFile(file,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({phase,qualityPassed:report.qualityPassed,correctRate:report.correctRate,costReduction:report.costReduction,latencyReduction:report.pairedMedianLatencyReduction,p95Increase:report.p95LatencyIncrease,localReadQualificationPassed:report.localReadQualificationPassed}));
