import '../hybrid-evaluation-v5/trace-off';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {bindRuntime,once,id,json,sha,userId} from '../hybrid-evaluation-v1/runtime';
import {requestProgramDecision} from '../../src/providers/program-decisions-v6';
import {programStateSchema,programResponseSchema,programRoute} from '../../src/providers/program-decision-contract-v6';
import policy from '../../config/agent/jev-program-policy-v6.json';
import {withProductSpend} from '../../src/lib/billing/context';
const root='experiments/hybrid-route-context-v6',local='.local-runtime/hybrid-route-context-v6-development';
const command=process.argv[2];if(!['freeze','run'].includes(command))throw Error('Use freeze or run');
await mkdir(local,{recursive:true});
const known=JSON.parse(await readFile('experiments/hybrid-route-context-v5b/cases.json','utf8')) as Array<{id:string;state:unknown;expectedRoute:string}>;
const task=JSON.parse(await readFile('experiments/hybrid-evaluation-v5/performance-inputs.json','utf8')).find((t:{id:string})=>t.id==='P10');
const cases=[...known.filter(c=>['C5-06','C5-17','C5-18'].includes(c.id)),{id:'P10-v6-development',state:{request:task.prompt,mode:'deep',hasHistory:false,hasAttachments:false,hasPolicy:false,hasKnowledgeScope:false},expectedRoute:'interpreter'}];
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','src','config','package.json','package-lock.json',root],{encoding:'utf8'}).trim().split(/\r?\n/).filter(p=>!p.includes('/results/'));
const sources:Record<string,string>={};for(const path of files)sources[path]=sha(await readFile(path,'utf8'));
const frozen={version:'jev-context-v6-development',cases,policy,sources,maxRequests:4,retries:0,holdout:false},identity=sha(json(frozen));
if(command==='freeze'){await writeFile(`${local}/input.json`,json(frozen),{flag:'wx'});console.log(json({frozen:true,developmentCases:4,modelCalls:0}));}
else{
 if(sha(await readFile(`${local}/input.json`,'utf8'))!==identity)throw Error('Development source drift');
 const admin=await bindRuntime(),rows=[];
 try{
  for(const c of cases){
   const state=programStateSchema.parse(c.state),operation=id(`${identity}/${c.id}`);
   const receipt=await once(`${local}/${c.id}.receipt.json`,sha(json({identity,state})),()=>withProductSpend(userId,'jev-context-development',()=>requestProgramDecision(state),operation));
   await writeFile(`${local}/${c.id}.billing.json`,json((await admin.query('select id,status,reported_micros::text,metrics from paid_call_reservation where user_id=$1 and operation_id=$2',[userId,operation])).rows));
   const parsed=receipt.status==='completed'?programResponseSchema.safeParse(receipt.response):null;
   const route=parsed?.success?programRoute(parsed.data,policy,state):'dynamic_agent';
   rows.push({id:c.id,expected:c.expectedRoute,actual:route,providerCompleted:Boolean(parsed?.success),correct:route===c.expectedRoute,
    contextReady:parsed?.success?parsed.data.answers.context_ready:null,latencyMs:receipt.latencyMs,knownCostUsd:parsed?.success?parsed.data.usage.cost??null:null});
  }
  const report={version:'jev-context-v6-development-result',identity,holdout:false,productionActivated:false,thresholdsChanged:false,rows,
   allDevelopmentChecksPassed:rows.every(r=>r.correct&&r.providerCompleted),knownCostUsd:rows.reduce((s,r)=>s+(r.knownCostUsd??0),0),unknownCharges:rows.filter(r=>r.knownCostUsd===null).length};
  await mkdir(`${root}/results`,{recursive:true});await writeFile(`${root}/results/development.json`,json(report));console.log(json(report));
 }finally{await admin.end();const {getPool}=await import('../../src/lib/rag/db');await getPool().end();}
}
