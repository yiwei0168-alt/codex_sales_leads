import './trace-off';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {bindRuntime,ensureDirectory,id,json,local,once,sha,userId,verifyDesign} from './runtime';
import {programStateSchema,programRoute,programResponseSchema,buildProgramDecisionRequest,type ProgramRoute} from '../../src/providers/program-decision-contract-v4';
import {decisionState} from '../../src/lib/assistant/main/decision-routing';
import {hybridFirstAction} from '../../src/lib/assistant/main/hybrid-routing';
import {automaticModelConfig} from '../../src/lib/assistant/main/automatic-execution';
import {initialTaskMessages} from '../../src/lib/assistant/main/initial-task-messages';
import {requestProgramDecision} from '../../src/providers/program-decisions-v4';
import {withProductSpend} from '../../src/lib/billing/context';
import {getOpenRouterConfig} from '../../src/providers/openrouter';
import policy from '../../config/agent/jev-program-policy-v4.json';
import Ajv from 'ajv';

const directory=`${local}/routing`,freezePath=`${directory}/freeze.json`;
const command=process.argv[2],split=process.argv[3]??'development';
if(!['freeze','run','report'].includes(command)||!['development','holdout'].includes(split))throw Error('Use freeze, run development, or report development');
const designHash=await verifyDesign(),admin=await bindRuntime();await ensureDirectory(directory);
const raw=await readFile('experiments/hybrid-evaluation-v1/routing-cases.json','utf8');
type Case={id:string;split:string;riskClass:string;state:ReturnType<typeof programStateSchema.parse>;expected:{initialRoute:ProgramRoute}};
const cases=(JSON.parse(raw) as Case[]).filter(c=>c.split===split);
const observedSchema=new Ajv({allErrors:true}).compile(JSON.parse(await readFile('experiments/hybrid-evaluation-v1/observations.schema.json','utf8')));
const provider=getOpenRouterConfig();
const config={baseUrl:provider.baseUrl,providerPreferences:provider.providerPreferences,financialPolicy:process.env.PRODUCT_FINANCIAL_POLICY??'strict',
 decisionMode:process.env.HYBRID_DECISION_MODE??null,decisionModel:process.env.HYBRID_DECISION_MODEL??null,automatic:automaticModelConfig(),policy};
try{
 if(command==='freeze'){
  const files=execFileSync('git',['ls-files','src','config','db/migrations','package.json','package-lock.json'],{encoding:'utf8'}).trim().split(/\r?\n/);
  files.push('experiments/hybrid-evaluation-v4/runtime.ts','experiments/hybrid-evaluation-v4/route-run.ts');
  const sources:Record<string,string>={};for(const path of files)sources[path]=sha(await readFile(path,'utf8'));
  await writeFile(freezePath,json({version:'hybrid-route-runtime-v4',designHash,config,sources,maximumRequests:64,
   developmentProviderRequests:20,holdoutProviderRequests:44,providerRetries:0,userId,labelReview:'author-proposed-diagnostic-only',
   independentQualification:false}),{flag:'wx'});
  console.log(json({frozen:true,sourceFiles:files.length,financialPolicy:config.financialPolicy,modelCalls:0}));
 }else{
  const freezeText=await readFile(freezePath,'utf8'),freeze=JSON.parse(freezeText),runtimeHash=sha(freezeText);
  if(freeze.designHash!==designHash||JSON.stringify(freeze.config)!==JSON.stringify(config))throw Error('Frozen routing configuration drift');
  for(const [path,hash] of Object.entries(freeze.sources))if(sha(await readFile(path,'utf8'))!==hash)throw Error(`Frozen runtime source drift: ${path}`);
  if(split==='holdout'){
   const reviewed=JSON.parse(await readFile(`${local}/label-review/report.json`,'utf8'));
   if(!reviewed.holdoutExecutionAdmitted||reviewed.designHash!==designHash||reviewed.differences.length)throw Error('Independent label disagreements or missing review; holdout not admitted');
   if(sha(await readFile('experiments/hybrid-evaluation-v1/routing-cases.json','utf8'))!==reviewed.caseHash)throw Error('Reviewed case drift');
  }
  await ensureDirectory(`${directory}/${split}`);
  const observations=[];
  for(const c of cases){
   const path=`${directory}/${split}/${c.id}`,state=programStateSchema.parse(c.state);
   if(command==='report'){observations.push(JSON.parse(await readFile(`${path}.observation.json`,'utf8')));continue;}
   try{const saved=JSON.parse(await readFile(`${path}.observation.json`,'utf8'));if(saved.runtimeFreezeHash!==runtimeHash)throw Error('Observation drift');
    if(saved.providerRequested&&saved.providerStatus!=='completed')throw Error(`Unresolved prior attempt ${c.id}; reconcile before continuing`);
    observations.push(saved);continue;}
   catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
   const scope=state.hasKnowledgeScope?['product' as const]:undefined;
   const messages=initialTaskMessages({userId,role:'member',mode:state.mode,knowledgeScope:scope},
    {content:state.request,knowledgeScope:scope,attachments:state.hasAttachments?[{assetId:id('attachment')}]:[]},automaticModelConfig(scope?'knowledge':'business'),
    state.hasHistory?[{role:'user',content:'Synthetic prior context'},{role:'assistant',content:'Synthetic previous answer'}]:[]);
   const prepared=!state.hasPolicy&&hybridFirstAction(messages),eligible=!prepared&&decisionState(messages,state.hasPolicy);
   const entryPath=prepared?'deterministic_workflow':eligible?'jev':'context_guard';
   const operationId=id(`hybrid-route/${runtimeHash}/${c.id}`);
   const receipt=eligible?await once(`${path}.receipt.json`,sha(json({runtimeHash,request:buildProgramDecisionRequest(state)})),
    ()=>withProductSpend(userId,'hybrid-evaluation-route',()=>requestProgramDecision(state),operationId)):null;
   const parsed=receipt?.status==='completed'?programResponseSchema.safeParse(receipt.response):null;
   const appliedRoute:ProgramRoute=prepared?'fixed_workflow':parsed?.success?programRoute(parsed.data,policy,state):'dynamic_agent';
   const reservations=await admin.query('select id,status,reported_micros::text,metrics from paid_call_reservation where user_id=$1 and operation_id=$2 order by created_at',[userId,operationId]);
   await writeFile(`${path}.billing.json`,json(reservations.rows));
   const event=receipt?{eventId:`route-${c.id}`,provider:'openrouter',requestId:parsed?.success?parsed.data.id:null,stage:'router',
    status:parsed?.success?'succeeded':'unknown',amount:parsed?.success?parsed.data.usage.cost??null:null,currency:'USD',
    usage:{inputTokens:parsed?.success?parsed.data.usage.input_tokens:null,outputTokens:parsed?.success?parsed.data.usage.output_tokens:null,cachedTokens:null,reasoningTokens:null,credits:null},
    receiptRef:`${path}.receipt.json`,startedAt:receipt.startedAt,endedAt:receipt.endedAt??null}:null;
   const observation={kind:'routing',runId:operationId,caseId:c.id,split,manifestHash:designHash,runtimeFreezeHash:runtimeHash,entryPath,
    providerRequested:Boolean(receipt),providerStatus:!receipt?'skipped':parsed?.success?'completed':receipt.status==='completed'?'invalid':'unknown',
    rawResponseRef:receipt?`${path}.receipt.json`:null,rawResponseHash:receipt?sha(json(receipt)):null,appliedRoute,latencyMs:receipt?.latencyMs??null,
    error:receipt?.error?JSON.stringify(receipt.error):null,billableEvents:event?[event]:[]};
   if(!observedSchema(observation))throw Error(JSON.stringify(observedSchema.errors));
   await writeFile(`${path}.observation.json`,json(observation),{flag:'wx'});observations.push(observation);
   console.log(JSON.stringify({caseId:c.id,entryPath,status:observation.providerStatus,route:appliedRoute,latencyMs:observation.latencyMs}));
   // An unknown paid request stops the batch until provider/local receipts are reconciled.
   if(receipt&&(!parsed?.success))throw Error(`Routing attempt ${c.id} unresolved; no automatic retry or further paid batch`);
  }
  const routed=observations.filter(o=>o.providerRequested),completed=routed.filter(o=>o.providerStatus==='completed');
  const truth=new Map(cases.map(c=>[c.id,c.expected.initialRoute]));
  const classes=['fixed_workflow','interpreter','dynamic_agent'];
  const confusion=Object.fromEntries(classes.map(t=>[t,Object.fromEntries(classes.map(p=>[p,routed.filter(o=>truth.get(o.caseId)===t&&o.appliedRoute===p).length]))]));
  const perClass=Object.fromEntries(classes.map(r=>{const tp=routed.filter(o=>truth.get(o.caseId)===r&&o.appliedRoute===r).length,
   predicted=routed.filter(o=>o.appliedRoute===r).length,expected=routed.filter(o=>truth.get(o.caseId)===r).length;
   const precision=predicted?tp/predicted:0,recall=expected?tp/expected:0;
   return [r,{tp,predicted,expected,precision,recall,f1:precision+recall?2*precision*recall/(precision+recall):0}];}));
  const latency=completed.map(o=>o.latencyMs).sort((a,b)=>a-b),charges=routed.flatMap(o=>o.billableEvents);
  const report={version:'hybrid-route-observation-v4',split,designHash,runtimeHash,independentQualification:false,
   cases:cases.length,providerAttempts:routed.length,providerCompleted:completed.length,availability:routed.length?completed.length/routed.length:null,
   accuracyIncludingFallback:routed.length?routed.filter(o=>truth.get(o.caseId)===o.appliedRoute).length/routed.length:null,
   initialPipelineCorrect:observations.filter(o=>truth.get(o.caseId)===o.appliedRoute).length,confusion,perClass,
   macroF1:Object.values(perClass).reduce((sum,r)=>sum+r.f1,0)/3,successfulP95Ms:latency[Math.ceil(latency.length*.95)-1]??null,
   knownCostUsd:charges.reduce((sum,e)=>sum+(e.amount??0),0),unknownChargeCount:charges.filter(e=>e.amount===null).length,
   wrongFast:routed.filter(o=>o.appliedRoute!=='dynamic_agent'&&truth.get(o.caseId)!==o.appliedRoute).map(o=>o.caseId),
   policyChanged:false,holdoutOpened:split==='holdout',performanceClaims:false};
  await writeFile(`${directory}/${split}-summary.json`,json(report));console.log(json(report));
 }
}finally{await admin.end();const {getPool}=await import('../../src/lib/rag/db');await getPool().end();}
