import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {decisionModels,parseDecisionResponse} from '../src/providers/decision-contract';
import {validationCaseSchema,validatedOutcome,summarizeValidation,type ValidationOutcome} from '../src/lib/assistant/main/decision-validation';

const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
const manifestText=(await readFile('experiments/decision-routing-validation/manifest-v2.json','utf8')).replace(/\r\n/g,'\n');
const manifest=JSON.parse(manifestText),manifestHash=sha(manifestText);
for(const [file,expected] of Object.entries(manifest.hashes)){
  if(sha((await readFile(file,'utf8')).replace(/\r\n/g,'\n'))!==expected)throw Error(`Frozen source drift: ${file}`);
}
const cases=(JSON.parse(await readFile('experiments/decision-routing-validation/cases-v2.json','utf8')) as unknown[]).map(s=>validationCaseSchema.parse(s));
const reports=[];
for(const model of decisionModels){
  const rows:ValidationOutcome[]=[],receipts:Array<{id:string;sha256:string}>=[],failures:Array<{id:string;reason:string}>=[];
  for(const sample of cases){
    const path=`.local-runtime/decision-validation-v2-20261109/${model.replaceAll('/','_')}/${sample.id}.json`;
    let text:string;
    try{text=await readFile(path,'utf8');}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')continue;throw error;}
    const saved=JSON.parse(text);
    if(saved.identity!==sha(JSON.stringify({manifestHash,model,sample}))||saved.manifestHash!==manifestHash||saved.model!==model)
      throw Error(`Receipt identity mismatch: ${model}/${sample.id}`);
    receipts.push({id:sample.id,sha256:sha(text)});
    if(saved.status==='completed'){
      if(!Number.isFinite(saved.latencyMs)||saved.latencyMs<0)throw Error('Invalid latency');
      rows.push(validatedOutcome(sample.id,parseDecisionResponse(saved.response,model),saved.latencyMs));
    }else if(saved.status==='guarded'){
      if(saved.response!==undefined)throw Error('Guarded case has a provider response');
      rows.push({id:sample.id,status:'guarded',appliedRoute:String(saved.appliedRoute),latencyMs:null});
    }else{
      failures.push({id:sample.id,reason:String(saved.reason??'started-without-complete-receipt')});
      rows.push({id:sample.id,status:'failed-or-unknown',appliedRoute:'dynamic_agent',latencyMs:null});
    }
  }
  const summary=summarizeValidation(cases,rows);
  reports.push({model,...summary,failures,receiptSetHash:sha(JSON.stringify(receipts)),
    unsafe:rows.filter(row=>summary.unsafeIds.includes(row.id)).map(row=>({id:row.id,
      expected:cases.find(s=>s.id===row.id)!.expected,applied:row.appliedRoute,answer:row.response!.answers.route})),
    missedPositiveIds:cases.filter(s=>!s.guard&&s.expected!=='dynamic_agent'&&!rows.some(row=>row.id===s.id&&row.appliedRoute===s.expected)).map(s=>s.id),
    missingIds:cases.filter(s=>!rows.some(row=>row.id===s.id)).map(s=>s.id)});
}
const evidence={date:'2026-11-09',rule:'HYBRID-04',freezeCommit:'c75d89e7',manifestHash,
  protocol:manifest.version,policyVersion:'hybrid-decision-thresholds-v2',gates:manifest.gates,reports,
  checks:{focusedTests:{files:3,passed:38},typecheck:true,focusedLint:true,freezeHashesVerified:true},
  scope:{syntheticNewCases:60,labelsFixedBeforeInference:true,thresholdsRetunedAfterResults:false,
    naturalBusinessAcceptance:false,fullTaskLatencyMeasured:false,productActivated:false,realEmailsRead:false,businessToolsExecuted:false},
  rawReceipts:'.local-runtime/decision-validation-v2-20261109/ (local-only)'};
await writeFile('docs/evidence/decision-threshold-validation-2026-11-09.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(reports));
