import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {z} from 'zod';
import {decisionModelSchema,parseDecisionResponse} from '../src/providers/decision-contract';
import {DecisionRequestError,requestDecision} from '../src/providers/openrouter-decisions';
import {validationCaseSchema,validationInput,validatedOutcome,summarizeValidation,VALIDATION_GATES,type ValidationOutcome} from '../src/lib/assistant/main/decision-validation';

const args=process.argv.slice(2),live=args.includes('--live');
const model=decisionModelSchema.parse(args.find(a=>a.startsWith('--model='))?.slice(8)??'typesafe/jev-1.14');
const root='experiments/decision-routing-validation',manifestPath=`${root}/manifest-v2.json`;
const cases=z.array(validationCaseSchema).parse(JSON.parse(await readFile(`${root}/cases-v2.json`,'utf8')));
if(cases.length!==60||new Set(cases.map(s=>s.id)).size!==60||cases.filter(s=>!s.guard).length!==48)throw Error('Unexpected frozen sample count');
for(const sample of cases)if(Boolean(validationInput(sample).state)===Boolean(sample.guard))throw Error(`Eligibility mismatch: ${sample.id}`);
const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
const files=[`${root}/cases-v2.json`,'config/agent/decision-thresholds-v2.json','src/providers/decision-contract.ts',
  'src/providers/decision-thresholds.ts','src/providers/openrouter-decisions.ts','src/lib/assistant/main/decision-routing.ts',
  'src/lib/assistant/main/hybrid-routing.ts','src/lib/assistant/main/decision-validation.ts','scripts/validate-decision-routing.ts'];
const hashes=Object.fromEntries(await Promise.all(files.map(async file=>[file,sha((await readFile(file,'utf8')).replace(/\r\n/g,'\n'))])));
if(args.includes('--freeze')){
  if(live)throw Error('Freeze must precede inference in a separate invocation');
  const manifest={version:'decision-v2-validation-20261109',createdAt:new Date().toISOString(),
    sourceBase:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),hashes,gates:VALIDATION_GATES,
    samples:60,modelCallsPerModelMaximum:48,labels:'developer-authored-new-synthetic-not-independent-business-Gold'};
  await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({frozen:true,samples:60,maxCallsPerModel:48}));
}else{
  const manifestText=(await readFile(manifestPath,'utf8')).replace(/\r\n/g,'\n'),manifest=JSON.parse(manifestText);
  if(JSON.stringify(manifest.hashes)!==JSON.stringify(hashes)||JSON.stringify(manifest.gates)!==JSON.stringify(VALIDATION_GATES))
    throw Error('Frozen protocol drift; do not retune or reuse this validation run');
  const manifestHash=sha(manifestText);
  if(!live)console.log(JSON.stringify({verified:true,manifestHash,model,samples:60,eligible:48,guarded:12,live:false}));
  else{
    const directory=resolve('.local-runtime/decision-validation-v2-20261109',model.replaceAll('/','_'));
    await mkdir(directory,{recursive:true});
    const outcomes:ValidationOutcome[]=[];let consecutiveFailures=0;
    for(const sample of cases){
      const path=resolve(directory,`${sample.id}.json`),input=validationInput(sample);
      const identity=sha(JSON.stringify({manifestHash,model,sample}));
      let saved:Record<string,unknown>|null=null;
      try{saved=JSON.parse(await readFile(path,'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
      if(saved&&saved.identity!==identity)throw Error('Receipt identity drift');
      if(!saved){
        const base={identity,manifestHash,model,caseId:sample.id};
        if(!input.state){
          saved={...base,status:'guarded',appliedRoute:input.ruleRoute,latencyMs:null};
          await writeFile(path,JSON.stringify(saved,null,2),{flag:'wx'});
        }else{
          await writeFile(path,JSON.stringify({...base,status:'started'},null,2),{flag:'wx'});
          const started=Date.now();
          try{
            const response=await requestDecision(model,input.state);
            saved={...base,...validatedOutcome(sample.id,response,Date.now()-started)};
          }catch(error){
            const reason=error instanceof DecisionRequestError?`${error.reason}_${error.status??'schema'}`:'transport-or-receipt-unknown';
            saved={...base,status:'failed-or-unknown',appliedRoute:'dynamic_agent',latencyMs:Date.now()-started,reason};
          }
          await writeFile(path,JSON.stringify(saved,null,2));
        }
      }
      const outcome:ValidationOutcome=saved.status==='completed'
        ?validatedOutcome(sample.id,parseDecisionResponse(saved.response,model),Number(saved.latencyMs))
        :saved.status==='guarded'?{id:sample.id,status:'guarded',appliedRoute:String(saved.appliedRoute),latencyMs:null}
        :{id:sample.id,status:'failed-or-unknown',appliedRoute:'dynamic_agent',latencyMs:null};
      outcomes.push(outcome);
      consecutiveFailures=outcome.status==='failed-or-unknown'?consecutiveFailures+1:0;
      if(consecutiveFailures>=3){console.log(JSON.stringify({stopped:true,reason:'three-consecutive-failures-no-retries',lastCase:sample.id}));break;}
    }
    const summary={model,manifestHash,...summarizeValidation(cases,outcomes),gates:VALIDATION_GATES,
      missingIds:cases.filter(s=>!outcomes.some(o=>o.id===s.id)).map(s=>s.id),productionActivated:false};
    await writeFile(resolve(directory,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
  }
}
