import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {development,validation,type Case} from './cases';
import {once,type Receipt} from '../jev-routing-optimization/receipts';
import {PROGRAM_DECISION_VERSION,buildProgramDecisionRequest,programResponseSchema,programRoute,programStrength,
  type ProgramPolicy,type ProgramThreshold} from '../../src/providers/program-decision-contract';
import {requestProgramDecision} from '../../src/providers/program-decisions';

const root='experiments/jev-program-routing',local='.local-runtime/jev-program-v3';
const policyPath='config/agent/jev-program-policy-v3.json';
const sources=['src/providers/program-decision-contract.ts','src/providers/program-decisions.ts',
  'src/lib/assistant/main/programmatic-execution.ts','src/lib/assistant/main/hybrid-contracts.ts',`${root}/cases.ts`,`${root}/run.ts`];
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const read=(path:string)=>readFile(path,'utf8');
const json=(value:unknown)=>JSON.stringify(value,null,2)+'\n';
const guarded=(c:Case)=>c.state.hasHistory||c.state.hasAttachments||c.state.hasPolicy||c.state.hasKnowledgeScope;
const gates={minimumFixed:9,minimumInterpreter:9,maximumWrongFast:0,minimumAvailability:.9,maximumP95Ms:2500};
type Row={sample:Case;receipt:Receipt|null};
async function rows(split:'development'|'validation',manifestHash:string):Promise<Row[]>{
  return Promise.all((split==='development'?development:validation).map(async sample=>{
    if(guarded(sample))return {sample,receipt:null};
    const receipt=JSON.parse(await read(`${local}/${split}/${sample.id}.json`)) as Receipt;
    if(receipt.identity!==sha(json({manifestHash,split,id:sample.id,request:buildProgramDecisionRequest(sample.state)})))throw Error('Receipt identity drift');
    return {sample,receipt};
  }));
}
function summary(rows:Row[],policy:ProgramPolicy){
  const outcomes=rows.map(({sample,receipt})=>({id:sample.id,expected:sample.expected,
    route:receipt?.status==='completed'?programRoute(programResponseSchema.parse(receipt.response),policy,sample.state):'dynamic_agent',
    status:receipt?.status??'context-guard',latencyMs:receipt?.latencyMs??null}));
  const completed=outcomes.filter(o=>o.status==='completed');
  const latency=completed.map(o=>o.latencyMs!).sort((a,b)=>a-b), p95=latency[Math.ceil(latency.length*.95)-1]??null;
  const fixed=outcomes.filter(o=>o.expected==='fixed_workflow'&&o.route===o.expected).length;
  const interpreter=outcomes.filter(o=>o.expected==='interpreter'&&o.route===o.expected).length;
  const wrongFast=outcomes.filter(o=>o.route!=='dynamic_agent'&&o.route!==o.expected);
  const availability=completed.length/outcomes.filter(o=>o.status!=='context-guard').length;
  return {fixed,interpreter,wrongFast,availability,p95Ms:p95,
    gatePassed:fixed>=gates.minimumFixed&&interpreter>=gates.minimumInterpreter&&wrongFast.length===0&&availability>=gates.minimumAvailability&&p95!==null&&p95<=gates.maximumP95Ms,
    outcomes};
}
function calibrate(rows:Row[]):ProgramPolicy{
  const policy:ProgramPolicy={version:'jev-program-policy-v3',contractVersion:PROGRAM_DECISION_VERSION,routes:{
    fixed_workflow:{enabled:false,probability:1,margin:1},interpreter:{enabled:false,probability:1,margin:1}}};
  for(const route of ['fixed_workflow','interpreter'] as const){
    const candidates:Array<{threshold:ProgramThreshold;minimum:number;total:number}>=[];
    for(let pi=10;pi<=19;pi++)for(let mi=0;mi<=16;mi++){
      const threshold={enabled:true,probability:pi/20,margin:mi/20};
      const accepted=rows.filter(({sample,receipt})=>{
        if(!receipt||receipt.status!=='completed'||guarded(sample))return false;
        const strength=programStrength(programResponseSchema.parse(receipt.response),route);
        return strength&&strength.probability+1e-12>=threshold.probability&&strength.margin+1e-12>=threshold.margin;
      });
      if(!accepted.length||accepted.some(r=>r.sample.expected!==route))continue;
      // Two interleaved development folds; no validation responses are read here.
      const counts=[0,1].map(fold=>accepted.filter(r=>Number(r.sample.id.slice(1))%2===fold).length);
      candidates.push({threshold,minimum:Math.min(...counts),total:accepted.length});
    }
    candidates.sort((a,b)=>b.minimum-a.minimum||b.total-a.total);
    const best=candidates[0];if(!best)continue;
    const ties=candidates.filter(c=>c.minimum===best.minimum&&c.total===best.total);
    const center={p:ties.reduce((n,c)=>n+c.threshold.probability,0)/ties.length,m:ties.reduce((n,c)=>n+c.threshold.margin,0)/ties.length};
    ties.sort((a,b)=>(a.threshold.probability-center.p)**2+(a.threshold.margin-center.m)**2-
      ((b.threshold.probability-center.p)**2+(b.threshold.margin-center.m)**2)||b.threshold.probability-a.threshold.probability||b.threshold.margin-a.threshold.margin);
    policy.routes[route]=ties[0].threshold;
  }
  return policy;
}
async function main(){
  const command=process.argv[2];await mkdir(local,{recursive:true});
  if(command==='freeze'){
    const hashes=Object.fromEntries(await Promise.all(sources.map(async p=>[p,sha(await read(p))])));
    await writeFile(`${root}/manifest.json`,json({version:PROGRAM_DECISION_VERSION,sources:hashes,gates,development:development.length,validation:validation.length,
      maximumRequests:88,providerRetries:0,synthetic:true,naturalBusinessEvidence:false}),{flag:'wx'});return;
  }
  const manifestText=await read(`${root}/manifest.json`),manifestHash=sha(manifestText),manifest=JSON.parse(manifestText);
  for(const [p,hash] of Object.entries(manifest.sources))if(sha(await read(p))!==hash)throw Error(`Frozen source drift: ${p}`);
  if(command==='development'||command==='validation'){
    if(command==='validation'){
      const freeze=JSON.parse(await read(`${root}/validation-freeze.json`));
      if(freeze.policyHash!==sha(await read(policyPath))||freeze.manifestHash!==manifestHash)throw Error('Validation policy drift');
    }
    await mkdir(`${local}/${command}`,{recursive:true});
    for(const sample of command==='development'?development:validation){
      if(guarded(sample))continue;
      const identity=sha(json({manifestHash,split:command,id:sample.id,request:buildProgramDecisionRequest(sample.state)}));
      const receipt=await once(`${local}/${command}/${sample.id}.json`,identity,()=>requestProgramDecision(sample.state));
      console.log(JSON.stringify({split:command,id:sample.id,status:receipt.status,latencyMs:receipt.latencyMs}));
    }
    return;
  }
  if(command==='calibrate'){
    const data=await rows('development',manifestHash),policy=calibrate(data);
    await writeFile(policyPath,json(policy));
    await writeFile(`${root}/validation-freeze.json`,json({manifestHash,policyHash:sha(json(policy)),policy,gates,
      developmentSummary:summary(data,policy),selection:'Zero wrong fast routes; maximize worst interleaved fold then total coverage; choose center of tied grid.'}),{flag:'wx'});
    console.log(json({policy,development:summary(data,policy)}));return;
  }
  if(command==='report'){
    const policy=JSON.parse(await read(policyPath)) as ProgramPolicy;
    const freeze=JSON.parse(await read(`${root}/validation-freeze.json`));
    if(freeze.policyHash!==sha(await read(policyPath)))throw Error('Policy drift');
    const data=await rows('validation',manifestHash),report={version:PROGRAM_DECISION_VERSION,manifestHash,policy,gates,
      synthetic:true,productionActivated:false,fullTaskAcceptance:false,validation:summary(data,policy),
      receiptSetHash:sha(json(data.map(({sample,receipt})=>({id:sample.id,hash:receipt?sha(json(receipt)):null}))))};
    await writeFile('docs/evidence/jev-program-v3-validation-2026-11-09.json',json(report));console.log(json(report));return;
  }
  throw Error('Use freeze/development/calibrate/validation/report');
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Experiment failed');process.exitCode=1;});
