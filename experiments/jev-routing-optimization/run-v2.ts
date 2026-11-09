import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {validationCaseSchema,validationInput,summarizeValidation,validatedOutcome,type ValidationCase,type ValidationOutcome} from '../../src/lib/assistant/main/decision-validation';
import {parseDecisionResponse} from '../../src/providers/decision-contract';
import {requestDecision} from '../../src/providers/openrouter-decisions';
import {MODEL,atomicResponseSchema,atomicRoute,type AtomicPolicy} from './contract';
import {requestAtomic} from './transport';
import {once,type Receipt} from './receipts';
import {METHOD,policySchema,selectV2,statsV2,routeV2,type Row} from './admission-v2';

const root='experiments/jev-routing-optimization',oldLocal='.local-runtime/jev-atomic-v1-20261109',local='.local-runtime/jev-admission-v2-20261109';
const action=process.argv[2];
if(!['calibrate','freeze','validate','report'].includes(action))throw Error('Explicit action required');
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const file=async(p:string)=>(await readFile(p,'utf8')).replace(/\r\n/g,'\n');
const samples=async(p:string)=>(JSON.parse(await file(p)) as unknown[]).map(s=>validationCaseSchema.parse(s));
async function hashes(paths:string[]){return Object.fromEntries(await Promise.all(paths.map(async p=>[p,sha(await file(p))])));}
async function verify(path:string){const text=await file(path),manifest=JSON.parse(text);
  if(JSON.stringify(manifest.hashes)!==JSON.stringify(await hashes(Object.keys(manifest.hashes))))throw Error('Frozen source drift');return {hash:sha(text),manifest};}
const identity=(manifestHash:string,arm:string,sample:ValidationCase)=>sha(JSON.stringify({manifestHash,arm,model:MODEL,sample}));
const gates={availability:0.95,minimumFixedCoverage:0.5,minimumInterpreterCoverage:0.5,minimumFixedGainOverOriginal:0.25,
  noCoverageRegressionAgainstAtomicV1:true,noInterpreterRegressionAgainstOriginal:true,wrongFastSuggestions:0,guardViolations:0,p95Ms:2000};
async function development(){
  const rows:Row[]=[],receiptHashes=[],excluded=[];
  for(const group of ['development','exposed-validation'] as const){
    const dev=group==='development',manifestPath=`${root}/${dev?'development':'validation'}-manifest.json`;
    const {hash}=await verify(manifestPath);
    const source=dev?'experiments/decision-routing-validation/cases-v2.json':`${root}/validation-cases.json`;
    for(const sample of (await samples(source)).filter(s=>!s.guard)){
      const text=await file(`${oldLocal}/${dev?'development':'atomic'}/${sample.id}.json`),saved=JSON.parse(text) as Receipt;
      if(saved.identity!==identity(hash,'atomic',sample))throw Error('Development receipt identity mismatch');
      receiptHashes.push({group,id:sample.id,hash:sha(text)});
      if(saved.status!=='completed'){excluded.push({group,id:sample.id,status:saved.status});continue;}
      rows.push({group,id:sample.id,expected:sample.expected,response:atomicResponseSchema.parse(saved.response)});
    }
  }
  return {rows,receiptSetHash:sha(JSON.stringify(receiptHashes)),excluded};
}
if(action==='calibrate'){
  const {rows,receiptSetHash,excluded}=await development(),selection=selectV2(rows);
  await writeFile(`${root}/policy-v2.json`,JSON.stringify(selection.policy,null,2)+'\n',{flag:'wx'});
  const report={...selection,method:METHOD,rows:rows.length,receiptSetHash,excluded,
    stats:(['fixed_workflow','interpreter'] as const).map(r=>statsV2(rows,selection.policy,r)),newModelCalls:0,independentValidation:false};
  await writeFile(`${root}/development-v2.json`,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
}else if(action==='freeze'){
  const {rows}=await development(),policy=policySchema.parse(JSON.parse(await file(`${root}/policy-v2.json`)));
  if(JSON.stringify(policy)!==JSON.stringify(selectV2(rows).policy))throw Error('Non-reproducible policy');
  const fresh=await samples(`${root}/validation-v2-cases.json`);
  const old=[...await samples('experiments/decision-routing-validation/cases-v2.json'),...await samples(`${root}/validation-cases.json`)];
  if(fresh.length!==60||new Set(fresh.map(s=>s.id)).size!==60||new Set(fresh.map(s=>s.request)).size!==60
    ||fresh.some(s=>old.some(o=>o.request===s.request)))throw Error('Invalid fresh validation');
  for(const route of ['fixed_workflow','interpreter','dynamic_agent'])if(fresh.filter(s=>!s.guard&&s.expected===route).length!==(route==='dynamic_agent'?24:12))throw Error('Invalid label balance');
  for(const sample of fresh)if(Boolean(validationInput(sample).state)===Boolean(sample.guard))throw Error('Invalid bypass');
  const {manifest:oldManifest}=await verify(`${root}/validation-manifest.json`);
  const paths=[...Object.keys(oldManifest.hashes),`${root}/admission-v2.ts`,`${root}/run-v2.ts`,`${root}/policy-v2.json`,`${root}/validation-v2-cases.json`];
  await writeFile(`${root}/validation-v2-manifest.json`,JSON.stringify({version:'jev-admission-v2-validation',createdAt:new Date().toISOString(),
    baseCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),hashes:await hashes(paths),gates,
    callsMaximum:96,arms:['original','atomic-v1','atomic-v2'],sharedAtomicResponse:true,labels:'new-synthetic-developer-authored-not-business-Gold'},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({frozen:true,callsMaximum:96}));
}else{
  const {hash,manifest}=await verify(`${root}/validation-v2-manifest.json`),fresh=await samples(`${root}/validation-v2-cases.json`);
  const policy=policySchema.parse(JSON.parse(await file(`${root}/policy-v2.json`))),v1=JSON.parse(await file(`${root}/policy-v1.json`)) as AtomicPolicy;
  if(action==='validate'){
    for(const arm of ['original','atomic'])await mkdir(`${local}/${arm}`,{recursive:true});
    let failures=0;
    for(const [i,sample] of fresh.entries()){
      const state=validationInput(sample).state;if(!state)continue;
      for(const arm of i%2?['atomic','original']:['original','atomic']){
        const saved=await once(`${local}/${arm}/${sample.id}.json`,identity(hash,arm,sample),()=>arm==='atomic'?requestAtomic(state):requestDecision(MODEL,state));
        failures=saved.status==='completed'?0:failures+1;if(failures>=3)throw Error('Three consecutive failures, no retries');
      }
    }
  }
  const reports=[];
  for(const arm of ['original','atomic-v1','atomic-v2']){
    const outcomes:ValidationOutcome[]=[],receipts=[],failedIds=[];let inputTokens=0,outputTokens=0;
    for(const sample of fresh){
      const input=validationInput(sample);
      if(!input.state){outcomes.push({id:sample.id,status:'guarded',appliedRoute:input.ruleRoute,latencyMs:null});continue;}
      const transportArm=arm==='original'?'original':'atomic';let text:string;
      try{text=await file(`${local}/${transportArm}/${sample.id}.json`);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')continue;throw e;}
      const saved=JSON.parse(text) as Receipt;if(saved.identity!==identity(hash,transportArm,sample))throw Error('Receipt identity mismatch');
      receipts.push({id:sample.id,hash:sha(text)});
      if(saved.status!=='completed'){failedIds.push(sample.id);outcomes.push({id:sample.id,status:'failed-or-unknown',appliedRoute:'dynamic_agent',latencyMs:null});continue;}
      if(!Number.isFinite(saved.latencyMs)||saved.latencyMs!<0)throw Error('Invalid latency');
      if(arm==='original'){
        const response=parseDecisionResponse(saved.response,MODEL);outcomes.push(validatedOutcome(sample.id,response,saved.latencyMs!));
        inputTokens+=response.usage.input_tokens;outputTokens+=response.usage.output_tokens;
      }else{
        const response=atomicResponseSchema.parse(saved.response);
        outcomes.push({id:sample.id,status:'completed',appliedRoute:arm==='atomic-v1'?atomicRoute(response,v1):routeV2(response,policy),latencyMs:saved.latencyMs!});
        inputTokens+=response.usage.input_tokens;outputTokens+=response.usage.output_tokens;
      }
    }
    reports.push({arm,...summarizeValidation(fresh,outcomes),policyVersion:arm==='original'?'hybrid-decision-thresholds-v2':arm==='atomic-v1'?v1.version:policy.version,
      failedIds,receiptSetHash:sha(JSON.stringify(receipts)),inputTokens,outputTokens,
      missedPositiveIds:fresh.filter(s=>!s.guard&&s.expected!=='dynamic_agent'&&!outcomes.some(o=>o.id===s.id&&o.appliedRoute===s.expected)).map(s=>s.id)});
  }
  const [original,atomicV1,candidate]=reports;
  const passed=candidate.gatePassed&&reports.every(r=>r.allRecorded&&r.availability>=gates.availability)
    &&candidate.fixed.ratio>=atomicV1.fixed.ratio&&candidate.interpreter.ratio>=atomicV1.interpreter.ratio
    &&candidate.interpreter.ratio>=original.interpreter.ratio&&candidate.fixed.ratio-original.fixed.ratio+1e-12>=gates.minimumFixedGainOverOriginal
    &&candidate.p95Ms!==null&&candidate.p95Ms<=gates.p95Ms;
  await mkdir(local,{recursive:true});
  const report={version:manifest.version,manifestHash:hash,model:MODEL,policy,gates,reports,gatePassed:passed,
    atomicArmsReuseIdenticalResponses:true,promptChanged:false,synthetic:true,productionActivated:false,fullTaskAcceptance:false};
  await writeFile(`${local}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
