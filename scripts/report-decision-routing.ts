import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {decisionRoutingSamples} from '../src/lib/assistant/main/decision-routing-samples';
import {decisionModels,buildDecisionRequest,DECISION_VERSION,parseDecisionResponse,acceptedRoute} from '../src/providers/decision-contract';
import {LEGACY_DECISION_POLICY_VERSION} from '../src/providers/decision-thresholds';

// Read-only analysis of the common 127-case pool. No model calls, no business data.
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const reports=[];
for(const model of decisionModels){
  const contractHash=hash({version:DECISION_VERSION,samples:decisionRoutingSamples,
    question:buildDecisionRequest(model,decisionRoutingSamples[0].state).questions});
  const rows:Array<{sample:typeof decisionRoutingSamples[number];latencyMs:number;rawChoice:string;appliedRoute:string;receiptHash:string}>=[];
  for(const sample of decisionRoutingSamples.slice(1)){
    const text=await readFile(`.local-runtime/decision-routing-eval-20261109/${model.replaceAll('/','_')}/${sample.id}.json`,'utf8');
    const saved=JSON.parse(text);
    if(saved.status!=='completed'||saved.contractHash!==contractHash||saved.identity!==hash({contractHash,model,sample}))
      throw new Error(`Unusable evaluation receipt: ${model}/${sample.id}`);
    const response=parseDecisionResponse(saved.response,model);
    rows.push({sample,latencyMs:Number(saved.latencyMs),rawChoice:response.answers.route.choice,
      appliedRoute:acceptedRoute(response,LEGACY_DECISION_POLICY_VERSION),receiptHash:createHash('sha256').update(text).digest('hex')});
  }
  const groups=['all','development','holdout'].map(split=>{
    const selected=rows.filter(r=>split==='all'||r.sample.split===split);
    const latency=selected.map(r=>r.latencyMs).sort((a,b)=>a-b);
    return {split,completed:selected.length,rawLabelAgreement:selected.filter(r=>r.rawChoice===r.sample.expected).length,
      falseFixedWorkflowSuggestions:selected.filter(r=>r.appliedRoute==='fixed_workflow'&&r.sample.expected!=='fixed_workflow').length,
      fixedWorkflowSuggestions:selected.filter(r=>r.appliedRoute==='fixed_workflow').length,
      interpreterSuggestions:selected.filter(r=>r.appliedRoute==='interpreter').length,
      dynamicFallbacks:selected.filter(r=>r.appliedRoute==='dynamic_agent').length,
      p95Ms:latency[Math.ceil(latency.length*0.95)-1]};
  });
  reports.push({model,contractHash,groups,receiptSetHash:hash(rows.map(r=>({id:r.sample.id,hash:r.receiptHash}))),
    mismatches:rows.filter(r=>r.rawChoice!==r.sample.expected).map(r=>({id:r.sample.id,expected:r.sample.expected,raw:r.rawChoice,applied:r.appliedRoute}))});
}
const report={kind:'synthetic-template-family-regression',sameSamples:127,reports,
  threshold:{topProbability:0.9,topTwoMargin:0.2,calibrated:false},
  businessAcceptance:false,endToEndLatencyMeasured:false,productionEnabled:false};
await writeFile('.local-runtime/decision-routing-eval-20261109/comparison.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
