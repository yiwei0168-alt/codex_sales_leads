import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {decisionRoutingSamples} from '../src/lib/assistant/main/decision-routing-samples';
import {buildDecisionRequest,decisionModelSchema,DECISION_VERSION,acceptedRoute} from '../src/providers/decision-contract';
import {requestDecision,DecisionRequestError} from '../src/providers/openrouter-decisions';
import {LEGACY_DECISION_POLICY_VERSION} from '../src/providers/decision-thresholds';

// Explicit, bounded synthetic evaluation. No user database, real emails or product settings.
const args=process.argv.slice(2),live=args.includes('--live');
const model=decisionModelSchema.parse(args.find(a=>a.startsWith('--model='))?.slice(8)??'typesafe/jev-1.14');
const limit=Number(args.find(a=>a.startsWith('--limit='))?.slice(8)??128);
const offset=Number(args.find(a=>a.startsWith('--offset='))?.slice(9)??0);
if(!Number.isInteger(limit)||limit<1||limit>128)throw new Error('limit must be 1..128');
if(!Number.isInteger(offset)||offset<0||offset>127||offset+limit>128)throw new Error('invalid sample window');
const samples=decisionRoutingSamples.slice(offset,offset+limit);
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const contractHash=hash({version:DECISION_VERSION,samples:decisionRoutingSamples,question:buildDecisionRequest(model,samples[0].state).questions});
if(!live){console.log(JSON.stringify({live:false,model,total:decisionRoutingSamples.length,selected:samples.length,
  development:64,holdout:64,contractHash,kind:'synthetic-regression-not-business-Gold'}));}
else {
  const directory=resolve('.local-runtime/decision-routing-eval-20261109',model.replaceAll('/','_'));
  await mkdir(directory,{recursive:true});
  let completed=0,correct=0,falseFast=0;const latencies:number[]=[];
  for(const sample of samples){
    const path=resolve(directory,`${sample.id}.json`),identity=hash({contractHash,model,sample});
    let saved:Record<string,unknown>|null=null;
    try{saved=JSON.parse(await readFile(path,'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    if(saved){
      if(saved.identity!==identity||saved.status!=='completed'){
        console.log(JSON.stringify({stopped:true,sample:sample.id,reason:'existing-incomplete-or-changed-receipt-no-retry'}));break;
      }
    }else{
      // Exclusive pending receipt before the paid boundary; interrupted runs cannot duplicate a call.
      const base={identity,contractHash,model,sample,createdAt:new Date().toISOString()};
      await writeFile(path,JSON.stringify({...base,status:'started'},null,2),{flag:'wx'});
      const started=Date.now();
      try{
        const response=await requestDecision(model,sample.state);
        saved={...base,status:'completed',response,latencyMs:Date.now()-started,
          rawChoice:response.answers.route.choice,policyVersion:LEGACY_DECISION_POLICY_VERSION,
          appliedRoute:acceptedRoute(response,LEGACY_DECISION_POLICY_VERSION)};
        await writeFile(path,JSON.stringify(saved,null,2));
      }catch(error){
        const reason=error instanceof DecisionRequestError?`${error.reason}_${error.status??'schema'}`:'transport-or-receipt-unknown';
        const cause=error as Error&{code?:string;cause?:{code?:string}};
        const rawCode=cause.cause?.code??cause.code;
        const transportCode=typeof rawCode==='string'&&/^[A-Z_0-9]{1,60}$/.test(rawCode)?rawCode:undefined;
        await writeFile(path,JSON.stringify({...base,status:'failed-or-unknown',reason,transportCode,latencyMs:Date.now()-started},null,2));
        console.log(JSON.stringify({stopped:true,model,sample:sample.id,reason,noRetry:true}));break;
      }
    }
    completed++;if(saved.rawChoice===sample.expected)correct++;
    if(saved.appliedRoute==='fixed_workflow'&&sample.expected!=='fixed_workflow')falseFast++;
    latencies.push(Number(saved.latencyMs));
  }
  latencies.sort((a,b)=>a-b);
  const summary={model,contractHash,selected:samples.length,completed,correct,falseFast,
    p95Ms:latencies.length?latencies[Math.ceil(latencies.length*0.95)-1]:null,
    businessAcceptance:false,kind:'synthetic-routing-only',noProductActivation:true};
  await writeFile(resolve(directory,`summary-${offset}-${limit}.json`),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
}
