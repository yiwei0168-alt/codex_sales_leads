import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {validationCaseSchema,validationInput,summarizeValidation,validatedOutcome,type ValidationCase,type ValidationOutcome} from '../../src/lib/assistant/main/decision-validation';
import {requestDecision} from '../../src/providers/openrouter-decisions';
import {parseDecisionResponse} from '../../src/providers/decision-contract';
import {MODEL,VERSION,atomicResponseSchema,atomicRoute,type AtomicPolicy} from './contract';
import {GRID,GATES,selectPolicy,developmentStats,type DevRow} from './evaluation';
import {requestAtomic} from './transport';
import {once,type Receipt} from './receipts';

const root='experiments/jev-routing-optimization',local='.local-runtime/jev-atomic-v1-20261109';
const action=process.argv[2];
if(!['freeze-development','development','calibrate','freeze-validation','validate','report'].includes(action))throw Error('Explicit action required');
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
async function file(path:string){return (await readFile(path,'utf8')).replace(/\r\n/g,'\n');}
async function cases(path:string){return (JSON.parse(await file(path)) as unknown[]).map(r=>validationCaseSchema.parse(r));}
const devPath='experiments/decision-routing-validation/cases-v2.json';
const sourceFiles=[`${root}/contract.ts`,`${root}/evaluation.ts`,`${root}/transport.ts`,`${root}/receipts.ts`,`${root}/run.ts`,
  devPath,'src/providers/decision-contract.ts','src/providers/decision-thresholds.ts','config/agent/decision-thresholds-v2.json',
  'src/providers/openrouter-decisions.ts','src/lib/assistant/main/decision-validation.ts','src/lib/assistant/main/decision-routing.ts',
  'src/lib/assistant/main/hybrid-routing.ts'];
async function hashes(paths:string[]){return Object.fromEntries(await Promise.all(paths.map(async p=>[p,sha(await file(p))])));}
async function freeze(name:string,paths:string[],extra:object){
  const manifest={version:VERSION,createdAt:new Date().toISOString(),baseCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    hashes:await hashes(paths),model:MODEL,grid:GRID,gates:GATES,...extra};
  await writeFile(`${root}/${name}.json`,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({frozen:name,...extra}));
}
async function verified(name:string){
  const text=await file(`${root}/${name}.json`),manifest=JSON.parse(text);
  if(JSON.stringify(manifest.hashes)!==JSON.stringify(await hashes(Object.keys(manifest.hashes))))throw Error('Frozen source drift');
  return sha(text);
}
async function receipt(path:string,identity:string){const text=await file(path),saved=JSON.parse(text) as Receipt;
  if(saved.identity!==identity)throw Error('Receipt identity drift');return {saved,hash:sha(text)};}
const identity=(manifestHash:string,arm:string,sample:ValidationCase)=>sha(JSON.stringify({manifestHash,arm,model:MODEL,sample}));
async function developmentRows(){
  const hash=await verified('development-manifest'),rows:DevRow[]=[],receipts=[];
  for(const sample of (await cases(devPath)).filter(s=>!s.guard)){
    const {saved,hash:receiptHash}=await receipt(`${local}/development/${sample.id}.json`,identity(hash,'atomic',sample));
    if(saved.status!=='completed')throw Error('Incomplete development; never retry unknown calls');
    rows.push({sample,response:atomicResponseSchema.parse(saved.response)});receipts.push({id:sample.id,hash:receiptHash});
  }
  return {rows,receiptSetHash:sha(JSON.stringify(receipts))};
}
if(action==='freeze-development'){
  await freeze('development-manifest',sourceFiles,{callsMaximum:48,questionsPerCall:3,
    labels:'previously-exposed-v2-synthetic-cases-now-development-only',maximumVariants:1});
}else if(action==='development'){
  const hash=await verified('development-manifest');await mkdir(`${local}/development`,{recursive:true});
  let failures=0,completed=0;
  for(const sample of (await cases(devPath)).filter(s=>!s.guard)){
    const state=validationInput(sample).state;if(!state)throw Error('Invalid development eligibility');
    const saved=await once(`${local}/development/${sample.id}.json`,identity(hash,'atomic',sample),()=>requestAtomic(state));
    if(saved.status==='completed'){atomicResponseSchema.parse(saved.response);completed++;failures=0;}else failures++;
    if(failures>=3){console.log(JSON.stringify({stopped:true,lastCase:sample.id}));break;}
  }
  console.log(JSON.stringify({completed,expected:48,model:MODEL}));
}else if(action==='calibrate'){
  const {rows,receiptSetHash}=await developmentRows(),policy=selectPolicy(rows);
  await writeFile(`${root}/policy-v1.json`,JSON.stringify(policy,null,2)+'\n',{flag:'wx'});
  await writeFile(`${root}/development-results.json`,JSON.stringify({policy,receiptSetHash,stats:developmentStats(rows,policy),
    samples:48,independentValidation:false,productionActivated:false},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({policy,stats:developmentStats(rows,policy)}));
}else if(action==='freeze-validation'){
  await verified('development-manifest');
  const samples=await cases(`${root}/validation-cases.json`),dev=await cases(devPath);
  if(samples.length!==60||new Set(samples.map(s=>s.id)).size!==60||samples.filter(s=>!s.guard).length!==48
    ||samples.some(s=>dev.some(d=>d.request===s.request)))throw Error('Invalid new validation cases');
  for(const s of samples)if(Boolean(validationInput(s).state)===Boolean(s.guard))throw Error(`Eligibility mismatch ${s.id}`);
  const {rows}=await developmentRows(),saved=JSON.parse(await file(`${root}/policy-v1.json`));
  if(JSON.stringify(selectPolicy(rows))!==JSON.stringify(saved))throw Error('Non-reproducible development policy');
  await freeze('validation-manifest',[...sourceFiles,`${root}/development-manifest.json`,`${root}/policy-v1.json`,`${root}/validation-cases.json`],
    {eligiblePerArm:48,guardedPerArm:12,callsMaximum:96,arms:['baseline','atomic'],labels:'new-developer-synthetic-not-business-Gold'});
}else{
  const hash=await verified('validation-manifest'),samples=await cases(`${root}/validation-cases.json`);
  const policy=JSON.parse(await file(`${root}/policy-v1.json`)) as AtomicPolicy;
  if(action==='validate'){
    for(const arm of ['baseline','atomic'])await mkdir(`${local}/${arm}`,{recursive:true});
    let failures=0;
    // Paired, alternating order limits systematic network-time bias; no model cascade in the product.
    for(const [index,sample] of samples.entries()){
      const state=validationInput(sample).state;if(!state)continue;
      for(const arm of index%2?['atomic','baseline']:['baseline','atomic']){
        const saved=await once(`${local}/${arm}/${sample.id}.json`,identity(hash,arm,sample),()=>arm==='atomic'?requestAtomic(state):requestDecision(MODEL,state));
        failures=saved.status==='completed'?0:failures+1;
        if(failures>=3)throw Error('Three consecutive failures; no retries');
      }
    }
  }
  const reports=[];
  for(const arm of ['baseline','atomic']){
    const outcomes:ValidationOutcome[]=[],receipts=[];let inputTokens=0,outputTokens=0;
    for(const sample of samples){
      const input=validationInput(sample);
      if(!input.state){outcomes.push({id:sample.id,status:'guarded',appliedRoute:input.ruleRoute,latencyMs:null});continue;}
      let record:Awaited<ReturnType<typeof receipt>>;
      try{record=await receipt(`${local}/${arm}/${sample.id}.json`,identity(hash,arm,sample));}
      catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')continue;throw error;}
      const {saved,hash:receiptHash}=record;receipts.push({id:sample.id,hash:receiptHash});
      if(saved.status!=='completed'){outcomes.push({id:sample.id,status:'failed-or-unknown',appliedRoute:'dynamic_agent',latencyMs:null});continue;}
      if(!Number.isFinite(saved.latencyMs)||saved.latencyMs!<0)throw Error('Invalid latency');
      if(arm==='atomic'){
        const response=atomicResponseSchema.parse(saved.response);inputTokens+=response.usage.input_tokens;outputTokens+=response.usage.output_tokens;
        outcomes.push({id:sample.id,status:'completed',appliedRoute:atomicRoute(response,policy),latencyMs:saved.latencyMs!});
      }else{
        const response=parseDecisionResponse(saved.response,MODEL);inputTokens+=response.usage.input_tokens;outputTokens+=response.usage.output_tokens;
        outcomes.push(validatedOutcome(sample.id,response,saved.latencyMs!));
      }
    }
    reports.push({arm,...summarizeValidation(samples,outcomes),policyVersion:arm==='atomic'?policy.version:'hybrid-decision-thresholds-v2',
      receiptSetHash:sha(JSON.stringify(receipts)),inputTokens,outputTokens,
      missedPositiveIds:samples.filter(s=>!s.guard&&s.expected!=='dynamic_agent'&&!outcomes.some(o=>o.id===s.id&&o.appliedRoute===s.expected)).map(s=>s.id),
      missingIds:samples.filter(s=>!outcomes.some(o=>o.id===s.id)).map(s=>s.id)});
  }
  const [baseline,atomic]=reports,fixedGain=atomic.fixed.ratio-baseline.fixed.ratio;
  const gatePassed=atomic.gatePassed&&baseline.allRecorded&&baseline.availability>=GATES.minimumAvailability
    &&fixedGain+1e-12>=GATES.minimumFixedGain&&atomic.interpreter.ratio>=baseline.interpreter.ratio
    &&atomic.p95Ms!==null&&atomic.p95Ms<=GATES.maximumP95Ms;
  const report={version:VERSION,model:MODEL,manifestHash:hash,policy,reports,fixedGain,gatePassed,gates:GATES,
    synthetic:true,productionActivated:false,realBusinessData:false,businessToolsExecuted:false,fullTaskLatencyMeasured:false};
  await writeFile(`${local}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
