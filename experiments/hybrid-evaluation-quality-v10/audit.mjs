import {readFile,writeFile} from 'node:fs/promises';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const root='experiments/hybrid-evaluation-quality-v10',phase=process.argv[2];
if(!['smoke','final'].includes(phase))throw Error('Use smoke or final');
const first=await read(`${root}/results/smoke-review.json`),later=phase==='final'?await read(`${root}/results/repeats-review.json`):{rows:[],knownReviewCostUsd:0};
const grades=[...first.rows,...later.rows];
const fixture=await read('experiments/hybrid-evaluation-v1/business-fixtures.json'),binding=await read('.local-runtime/hybrid-evaluation-v1/mail-binding.json'),knowledge=await read('.local-runtime/hybrid-evaluation-v1/knowledge-binding.json');
const expectedSort=fixture.companies.map(c=>{const m=fixture.mails.filter(m=>m.companyId===c.id).sort((a,b)=>b.date.localeCompare(a.date))[0];return {name:c.name,id:binding.companyIds[c.id],mail:binding.messageIds[m.id],date:m.date.slice(0,10)};}).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
const rows=[];
for(const grade of grades){
 const base=`.local-runtime/hybrid-evaluation-v10/performance/${grade.taskId}-${grade.arm}-${grade.repetition}`;
 const trace=await read(`${base}.trace.json`),observation=await read(`${base}.observation.json`),answer=trace.final?.result?.reply??'';
 const calls=trace.calls.filter(c=>c.output?.status==='success');let mechanical=true,detail={};
 if(['P01','P02','P23'].includes(grade.taskId)){
  const symbolic=grade.taskId==='P01'?'c1-m4':grade.taskId==='P02'?'c2-m4':'c2-m3';
  const expectedMail=binding.messageIds[symbolic];
  mechanical=calls.some(c=>c.tool_id==='mail_read'&&c.input.messageId===expectedMail);
  detail={requiredMail:expectedMail,read:mechanical,bodyReads:calls.filter(c=>c.tool_id==='mail_read').length};
 }
 if(grade.taskId==='P24'){
  const expectedDocs=knowledge.documents.filter(d=>d.model==='NX410').map(d=>d.documentId),text=JSON.stringify(calls.filter(c=>!['main_model','decision_router'].includes(c.tool_id)).map(c=>c.output));
  mechanical=expectedDocs.length===2&&expectedDocs.every(id=>text.includes(id));detail={bothVersionsRead:mechanical};
 }
 if(grade.taskId==='P09'){
  const lines=answer.split('\n').filter(l=>expectedSort.some(e=>l.includes(`/api/mailbox/messages/${e.mail}`)));
  const checks=expectedSort.map((e,i)=>({company:e.name,orderedSource:lines[i]?.includes(`/api/mailbox/messages/${e.mail}`)??false,dated:lines[i]?.includes(e.date)??false}));
  mechanical=lines.length===12&&checks.every(c=>c.orderedSource&&c.dated);detail={checks,rows:lines.length,nonInlineFormatNeedsExplicitAdjudication:!mechanical};
 }
 if(grade.taskId==='P10'){
  const pages=calls.filter(c=>c.tool_id==='mailbox_message_list'),items=pages.flatMap(p=>p.output.data.items),unique=new Map(items.map(i=>[i.id,i])),counts={};
  for(const m of unique.values()){const day=new Date(Date.parse(m.sentAt)+480*60000).toISOString().slice(0,10);counts[day]=(counts[day]??0)+1;}
  const interval=pages.length>0&&pages.every(p=>Date.parse(p.input.from)===Date.parse('2026-11-02T00:00:00+08:00')&&Date.parse(p.input.until)===Date.parse('2026-11-06T00:00:00+08:00'));
  const offsets=new Map(pages.map(p=>[p.input.offset,p.output.data]));
  const chain=offsets.get(0)?.hasMore===true&&offsets.get(0)?.nextOffset===20&&offsets.get(20)?.hasMore===false;
  mechanical=interval&&chain&&unique.size===40&&Object.keys(counts).length===4&&Object.entries({'2026-11-02':8,'2026-11-03':12,'2026-11-04':12,'2026-11-05':8}).every(([d,n])=>counts[d]===n);
  detail={pages:pages.length,uniqueMessages:unique.size,duplicateMessageReads:items.length-unique.size,counts,interval,chain};
 }
 const programs=calls.filter(c=>['programmatic_tools','programmatic_read'].includes(c.tool_id));
 rows.push({taskId:grade.taskId,arm:grade.arm,repetition:grade.repetition,qualityScore:grade.total,modelReviewPassed:grade.passed,mechanicalPassed:mechanical,
  correct:grade.passed&&mechanical&&observation.status==='answered'&&!trace.policyViolation,status:observation.status,policyViolation:trace.policyViolation,detail,
  billingComplete:observation.billingComplete,knownCostUsd:observation.billableEvents.reduce((s,e)=>s+(e.amount??0),0),unknownCharges:observation.billableEvents.filter(e=>e.amount===null).length,
  backendMs:observation.timingMs.enqueueToTerminal,mainCalls:observation.modelAttempts,programs:programs.length,models:[...new Set(calls.filter(c=>c.tool_id==='main_model').map(c=>c.metrics.requestedModel))]});
}
const submitted=phase==='smoke'?18:54;
if(rows.length!==submitted||new Set(rows.map(r=>`${r.taskId}/${r.arm}/${r.repetition}`)).size!==submitted)throw Error('Incomplete or duplicate review population');
const byArm=Object.fromEntries(['A','B','C'].map(arm=>{const r=rows.filter(r=>r.arm===arm);return [arm,{submitted:r.length,correct:r.filter(r=>r.correct).length,rate:r.filter(r=>r.correct).length/r.length,knownCostUsd:r.reduce((s,r)=>s+r.knownCostUsd,0),unknownCharges:r.reduce((s,r)=>s+r.unknownCharges,0)}];}));
const correctRate=rows.filter(r=>r.correct).length/rows.length;
const qualityPassed=correctRate>=.95&&byArm.C.rate>=byArm.A.rate-.05&&rows.every(r=>!r.policyViolation)&&grades.every(g=>g.hardGatePass);
const pairs=[];
for(const c of rows.filter(r=>r.arm==='C')){const a=rows.find(r=>r.arm==='A'&&r.taskId===c.taskId&&r.repetition===c.repetition);if(a.correct&&c.correct&&a.backendMs>0&&c.backendMs>0)pairs.push({taskId:c.taskId,repetition:c.repetition,a:a.backendMs,c:c.backendMs,reduction:1-c.backendMs/a.backendMs});}
const median=a=>{const s=[...a].sort((a,b)=>a-b),n=s.length;return n?n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2:null;};
const percentile=(a,p)=>[...a].sort((a,b)=>a-b)[Math.max(0,Math.ceil(a.length*p)-1)]??null;
const costKnown=rows.every(r=>r.billingComplete&&r.unknownCharges===0),costReduction=costKnown?1-byArm.C.knownCostUsd/byArm.A.knownCostUsd:null;
const latencyReduction=median(pairs.map(p=>p.reduction)),p95Increase=pairs.length?percentile(pairs.map(p=>p.c),.95)/percentile(pairs.map(p=>p.a),.95)-1:null;
let bootstrap=null;
if(phase==='final'&&pairs.length){
 const taskIds=[...new Set(rows.map(r=>r.taskId))],samples=[],costSamples=[];let seed=20261110;
 const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
 for(let i=0;i<5000;i++){const selected=Array.from({length:taskIds.length},()=>taskIds[Math.floor(random()*taskIds.length)]);
  const paired=selected.flatMap(id=>pairs.filter(p=>p.taskId===id));if(paired.length)samples.push(median(paired.map(p=>p.reduction)));
  const sampled=selected.flatMap(id=>rows.filter(r=>r.taskId===id));if(costKnown)costSamples.push(1-sampled.filter(r=>r.arm==='C').reduce((s,r)=>s+r.knownCostUsd,0)/sampled.filter(r=>r.arm==='A').reduce((s,r)=>s+r.knownCostUsd,0));}
 bootstrap={taskClusterSamples:5000,seed:20261110,medianLatencyReduction95Interval:[percentile(samples,.025),percentile(samples,.975)],totalCostReduction95Interval:costKnown?[percentile(costSamples,.025),percentile(costSamples,.975)]:null};
}
const report={version:'v10-local-read-gate',phase,submitted,qualityPassed,correctRate,byArm,rows,eligibleLatencyPairs:pairs.length,excludedLatencyPairs:submitted/3-pairs.length,
 costReduction,pairedMedianLatencyReduction:latencyReduction,p95LatencyIncrease:p95Increase,bootstrap,
 localReadQualificationPassed:phase==='final'&&qualityPassed&&costKnown&&costReduction>=.2&&latencyReduction>=.2&&p95Increase<=.1,
 overallAcceptancePassed:false,independentHumanGold:false,userVisibleTimingAvailable:false,productionChanged:false,historicalUnknownCharges:26,
 knownReviewCostUsd:first.knownReviewCostUsd+later.knownReviewCostUsd};
await writeFile(`${root}/results/${phase==='smoke'?'smoke-gate':'final-audit'}.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({phase,submitted,qualityPassed,correctRate,costReduction,latencyReduction,p95Increase,localReadQualificationPassed:report.localReadQualificationPassed,failures:rows.filter(r=>!r.correct).map(({taskId,arm,repetition,status,mechanicalPassed,modelReviewPassed})=>({taskId,arm,repetition,status,mechanicalPassed,modelReviewPassed}))}));
