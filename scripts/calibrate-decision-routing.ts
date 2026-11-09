import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {decisionRoutingSamples} from '../src/lib/assistant/main/decision-routing-samples';
import {decisionModels,buildDecisionRequest,DECISION_VERSION,parseDecisionResponse} from '../src/providers/decision-contract';
import {CALIBRATION_METHOD,calibrateThreshold,thresholdStats,type CalibrationRow} from '../src/lib/assistant/main/decision-calibration';
import policy from '../config/agent/decision-thresholds-v2.json';

// Offline only: reuse saved probabilities, never import a transport or modify raw receipts.
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const reports=[];
for(const model of decisionModels){
  const contractHash=hash({version:DECISION_VERSION,samples:decisionRoutingSamples,
    question:buildDecisionRequest(model,decisionRoutingSamples[0].state).questions});
  async function readRows(split:'development'|'holdout') {
    const rows:CalibrationRow[]=[],hashes:Array<{id:string;hash:string}>=[];
    for(const sample of decisionRoutingSamples.slice(1).filter(row=>row.split===split)){
      const text=await readFile(`.local-runtime/decision-routing-eval-20261109/${model.replaceAll('/','_')}/${sample.id}.json`,'utf8');
      const saved=JSON.parse(text);
      if(saved.status!=='completed'||saved.contractHash!==contractHash||saved.identity!==hash({contractHash,model,sample}))
        throw new Error(`Invalid calibration receipt: ${model}/${sample.id}`);
      rows.push({...sample,response:parseDecisionResponse(saved.response,model)});
      hashes.push({id:sample.id,hash:createHash('sha256').update(text).digest('hex')});
    }
    return {rows,receiptSetHash:hash(hashes)};
  }
  const development=await readRows('development');
  const selection={fixed_workflow:calibrateThreshold(development.rows,'fixed_workflow'),
    interpreter:calibrateThreshold(development.rows,'interpreter')};
  // Read old exposed holdout only AFTER selection. Never feed it to the selector.
  const regression=await readRows('holdout');
  const results=(['fixed_workflow','interpreter'] as const).map(route=>({route,threshold:selection[route].threshold,
    development:thresholdStats(development.rows,route,selection[route].threshold),
    exposedRegression:thresholdStats(regression.rows,route,selection[route].threshold),
    previousDevelopment:thresholdStats(development.rows,route,{enabled:true,topProbability:0.9,topTwoMargin:0.2}),
    previousRegression:thresholdStats(regression.rows,route,{enabled:true,topProbability:0.9,topTwoMargin:0.2})}));
  reports.push({model,contractHash,developmentRows:development.rows.length,regressionRows:regression.rows.length,
    developmentReceiptHash:development.receiptSetHash,regressionReceiptHash:regression.receiptSetHash,selection,results});
}
const report={version:'decision-calibration-20261109-v1',method:CALIBRATION_METHOD,reports,
  newModelCalls:0,labels:'developer-labeled-synthetic-template-families',independentValidation:false,
  probabilityCalibrated:false,productionActivated:false};
if(process.argv.includes('--check')){
  for(const {model,selection} of reports)for(const route of ['fixed_workflow','interpreter'] as const){
    if(JSON.stringify(policy.models[model][route])!==JSON.stringify(selection[route].threshold))
      throw new Error(`Saved threshold differs from reproducible development selection: ${model}/${route}`);
  }
}
await mkdir('.local-runtime/decision-calibration-20261109',{recursive:true});
await writeFile('.local-runtime/decision-calibration-20261109/report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(reports.map(({model,results})=>({model,results}))));
