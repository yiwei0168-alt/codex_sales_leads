import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root='experiments/hybrid-evaluation-quality-v1';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const sha=s=>createHash('sha256').update(s.replaceAll('\r\n','\n')).digest('hex');
const quality=await read(`${root}/results/review.json`);
const fixture=await read('experiments/hybrid-evaluation-v1/business-fixtures.json');
const binding=await read('.local-runtime/hybrid-evaluation-v1/mail-binding.json');
const tasks=await read('experiments/hybrid-evaluation-v1/performance-tasks.json');
const latest=fixture.companies.map(c=>({company:c,mail:fixture.mails.filter(m=>m.companyId===c.id).sort((a,b)=>b.date.localeCompare(a.date))[0]}))
 .sort((a,b)=>a.mail.date.localeCompare(b.mail.date)||binding.companyIds[a.company.id].localeCompare(binding.companyIds[b.company.id]));
const rows=[],checks=[],transportFailures=[];
for(const version of ['v3','v4','v4b']){
 const progress=await read(`experiments/hybrid-evaluation-${version}/results/progress.json`);
 for(const r of progress.rows){
  const path=`.local-runtime/hybrid-evaluation-${version}/performance/${r.taskId}-${r.arm}-1.trace.json`;
  const text=await readFile(path,'utf8'),trace=JSON.parse(text);
  assert.equal(sha(text),r.traceHash);
  const q=quality.rows.find(q=>q.version===version&&q.taskId===r.taskId&&q.arm===r.arm);
  assert(q&&q.runId===trace.runId);
  const answer=trace.final?.result?.reply??'';
  const cited=[...answer.matchAll(/\/api\/mailbox\/messages\/([a-f0-9-]{36})/g)].map(m=>m[1]);
  const ids=new Set(Object.values(binding.messageIds));
  assert(cited.every(id=>ids.has(id)),'Unknown mail source');
  if(r.taskId==='P09'){
   const lines=answer.split('\n').filter(l=>l.startsWith('|')&&l.includes('/api/mailbox/messages/'));
   assert.equal(lines.length,12);
   for(let i=0;i<12;i++){
    const {company,mail}=latest[i];
    for(const value of [company.name,binding.companyIds[company.id],mail.date.slice(0,10),binding.messageIds[mail.id]])assert(lines[i].includes(value));
   }
   checks.push({taskId:r.taskId,arm:r.arm,check:'12 rows: UTC date, runtime company UUID tie-break, company/mail identity',passed:true});
  }
  if(q.passed&&['P01','P02','P23'].includes(r.taskId)){
   const task=tasks.find(t=>t.id===r.taskId),required=task.assertions.latestMailId??task.assertions.mailId;
   assert(cited.includes(binding.messageIds[required]));
   const company=required.split('-')[0];
   const permitted=new Set(fixture.mails.filter(m=>m.companyId===company).map(m=>binding.messageIds[m.id]));
   assert(cited.every(id=>permitted.has(id)));
   checks.push({taskId:r.taskId,arm:r.arm,check:'Required latest/request mail cited; all mail citations belong to requested customer',passed:true});
  }
  for(const c of trace.calls)if(c.tool_id==='main_model'&&c.metrics?.failureDiagnostic)
   transportFailures.push({version,taskId:r.taskId,arm:r.arm,model:c.metrics.requestedModel,diagnostic:c.metrics.failureDiagnostic});
  let auditHold=null;
  let taskValidityReason=null;
  if(r.taskId==='P10')taskValidityReason='Year omitted and fixture clock not supplied to executing model.';
  if(r.taskId==='P24'){
   const systemTexts=trace.calls.filter(c=>c.tool_id==='main_model').flatMap(c=>c.input?.messages??[])
    .filter(m=>m.role==='system').map(m=>m.content??'');
   assert(systemTexts.some(text=>text.includes('涉及新版且版本不明时询问版本或是否查找最新已登记版本')));
   taskValidityReason='Frozen system policy requires clarification for an unspecified new version. Original task omitted version IDs while expecting direct v1/v2 comparison. This policy/assertion conflict invalidates qualification; preserve original grading, do not count compliant clarification as capability failure.';
  }
  if(r.taskId==='P02'&&r.arm==='C'){
   const timeline=trace.calls.find(c=>c.tool_id==='customer_timeline').output.data;
   assert.equal(timeline.hasMore,false);assert.equal(timeline.events.length,4);
   assert(answer.includes('时间线显示还有更早记录'));
   auditHold='Model reviewer passed, but answer says the timeline contains older records after describing all four. Actual page has four events and hasMore=false; workflow read only three bodies. Coverage wording is ambiguous/misleading. Hold this record out of accepted quality/performance pending correction; preserve original reviewer score.';
  }
  rows.push({...r,version,reviewScore:q.total,modelReviewPassed:q.passed,taskValid:taskValidityReason===null,taskValidityReason,auditHold,
   acceptedForDiagnosticComparison:taskValidityReason===null&&q.passed&&!auditHold});
 }
}
assert.equal(rows.length,18);
const pairs=[];
for(const taskId of [...new Set(rows.map(r=>r.taskId))])for(const [baseline,treatment] of [['A','B'],['A','C'],['B','C']]){
 const a=rows.find(r=>r.taskId===taskId&&r.arm===baseline),b=rows.find(r=>r.taskId===taskId&&r.arm===treatment);
 const qualityEligible=a.acceptedForDiagnosticComparison&&b.acceptedForDiagnosticComparison;
 const costEligible=qualityEligible&&a.billingComplete&&b.billingComplete;
 pairs.push({taskId,baseline,treatment,qualityEligible,costEligible,
  latencyReductionFraction:qualityEligible?1-b.backendEnqueueToTerminalMs/a.backendEnqueueToTerminalMs:null,
  costReductionFraction:costEligible?1-b.knownCostUsd/a.knownCostUsd:null});
}
const report={version:'six-task-diagnostic-panel-audit-v2',modelReviewPassed:quality.passed,records:rows.length,
 validTaskRecords:rows.filter(r=>r.taskValid).length,acceptedAfterAudit:rows.filter(r=>r.acceptedForDiagnosticComparison).length,
 arms:Object.fromEntries(['A','B','C'].map(arm=>[arm,{valid:rows.filter(r=>r.arm===arm&&r.taskValid).length,
  accepted:rows.filter(r=>r.arm===arm&&r.acceptedForDiagnosticComparison).length}])),
 knownTaskCostUsd:rows.reduce((s,r)=>s+r.knownCostUsd,0),unknownTaskCharges:rows.reduce((s,r)=>s+r.unknownCharges.length,0),
 knownQualityReviewCostUsd:quality.knownReviewCostUsd,previousUnknownChargesOutsidePanel:6,
 timing:'Backend enqueue to terminal only; no browser TTFT/user-visible latency.',
 conclusion:'Diagnostic only, not qualification. Mixed prospective execution versions, one repetition per task, synthetic sources, no pagination pressure or external discovery. P10 invalid context; P24 system-policy/assertion conflict; P02-C post-review coverage hold. Unknown fees are not zero. No pooled savings, CI, or overall pass claim. Audit v2 supersedes v1 denominators, preserving original model grades and previous audit in Git history.',
 checks,transportFailures,rows,pairs,productionChanged:false};
await writeFile(`${root}/results/panel-audit.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({records:report.records,valid:report.validTaskRecords,accepted:report.acceptedAfterAudit,knownTaskCostUsd:report.knownTaskCostUsd,unknown:report.unknownTaskCharges,pairs:pairs.filter(p=>p.qualityEligible)},null,2));
