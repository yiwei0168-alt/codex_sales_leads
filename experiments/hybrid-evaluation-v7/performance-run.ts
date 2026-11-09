import {failureDiagnostic} from '../../src/lib/network/failure-diagnostic';
import './trace-off';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {bindRuntime,ensureDirectory,id,json,local,sha,userId,verifyDesign} from './runtime';
import {automaticModelConfig} from '../../src/lib/assistant/main/automatic-execution';
import {modeModelConfig} from '../../src/lib/assistant/main/mode-config';
import {enqueueRun,claimRun,heartbeat,getRun} from '../../src/lib/assistant/main/repository';
import {executeMainAgentRun} from '../../src/lib/assistant/main/graph';
import {taskTransportSigningConfigured} from '../../src/lib/assistant/main/task-model-transport-request';
import {modelRoutedTransport} from '../../src/lib/network/model-transport';
import {getOpenRouterConfig} from '../../src/providers/openrouter';
import Ajv from 'ajv';

const root='experiments/hybrid-evaluation-v1',directory=`${local}/performance`,freezePath=`${directory}/freeze.json`;
export async function execute(command:string,taskId='',arm='',repetition=1){
if(!['freeze','run'].includes(command))throw Error('Use freeze or run Pxx A|B|C 1');
const designHash=await verifyDesign(),admin=await bindRuntime();await ensureDirectory(directory);
try{
 if(taskTransportSigningConfigured())throw Error('Signed production transport is configured; refuse to repoint it at evaluation data');
 const provider=getOpenRouterConfig(),deep=modeModelConfig('deep').profile!;
 const common=automaticModelConfig();
 const controlled={...common,automatic:{...common.automatic!,profiles:{fixed_workflow:deep,interpreter:deep,dynamic_agent:deep}}};
 const configs={A:controlled,B:controlled,C:common};
 const mail=JSON.parse(await readFile('.local-runtime/hybrid-evaluation-v1/mail-binding.json','utf8')),knowledge=JSON.parse(await readFile('.local-runtime/hybrid-evaluation-v1/knowledge-binding.json','utf8'));
 const environment={tracingDisabled:process.env.LANGSMITH_TRACING==='false'&&process.env.LANGCHAIN_TRACING_V2==='false',financialPolicy:process.env.PRODUCT_FINANCIAL_POLICY??'strict',decisionMode:process.env.HYBRID_DECISION_MODE??null,
  decisionModel:process.env.HYBRID_DECISION_MODEL??null,localBge:process.env.ENABLE_MAIN_AGENT_LOCAL_BGE_SEARCH??null,
  baseUrl:provider.baseUrl,providerPreferences:provider.providerPreferences,programContextVersion:process.env.HYBRID_PROGRAM_CONTEXT_VERSION};
 if(environment.decisionMode!=='advisory'||environment.decisionModel!=='typesafe/jev-1.14')throw Error('Automatic route deployment configuration is not the intended one');
 const sourcePaths=execFileSync('git',['ls-files','src','config','db/migrations','package.json','package-lock.json'],{encoding:'utf8'}).trim().split(/\r?\n/);
 sourcePaths.push(...['performance-run.ts','runtime.ts','trace-off.ts','batch.ts','README.md','collect-results.mjs'].map(f=>`experiments/hybrid-evaluation-v7/${f}`),'experiments/hybrid-evaluation-v1/runtime.ts');
 const sources:Record<string,string>={};
 for(const path of sourcePaths)sources[path]=sha(await readFile(path,'utf8'));
 if(command==='freeze'){
  const prior=JSON.parse(await readFile('.local-runtime/hybrid-evaluation-v4/performance/freeze.json','utf8'));
  const {programContextVersion,...previousEnvironment}=environment;
  if(programContextVersion!=='v7')throw Error('Candidate opt-in missing');
  if(json(prior.configs)!==json(configs)||json(prior.environment)!==json(previousEnvironment))throw Error('Continuation product configuration drift');
  const freeze={version:'hybrid-performance-runtime-p10-v7-context',designHash,environment,configs,sources,
   bindings:{mailHash:sha(json(mail)),knowledgeHash:sha(json(knowledge))},smokeTasks:['P10'],
   scope:'Real product enqueue, lease, checkpoint, graph, executor, database reads, WASM, model requests and settlement; no browser instrumentation or production load.',
   processPolicy:'Serial persistent process; first cold task counted; no unmeasured warmup; each task unique, no retry',maximumHttpRequestsPerTask:24,maximumTaskMs:600000,repetitions:1,
   readiness:{mailAndKnowledge:true,salesAndExternal:false,paginationCoverage:true},
   caveats:['No browser userWall/TTFT claim','Synthetic private text knowledge; no shared production index','Mail listing exercises 40 rows / two pages; customer listing pagination not covered',
    'Product model fallbacks retained; unknown provider charges remain unknown. No automatic task retry.']};
  await writeFile(freezePath,json(freeze),{flag:'wx'});console.log(json({frozen:true,smokeTasks:1,plannedSmokeRuns:3,paidCalls:0}));
 }else{
  const freezeText=await readFile(freezePath,'utf8'),freeze=JSON.parse(freezeText),runtimeHash=sha(freezeText);
  if(freeze.designHash!==designHash||json(freeze.environment)!==json(environment)||json(freeze.configs)!==json(configs)
   ||freeze.bindings.mailHash!==sha(json(mail))||freeze.bindings.knowledgeHash!==sha(json(knowledge)))throw Error('Performance binding drift');
  for(const [path,hash] of Object.entries(freeze.sources))if(sha(await readFile(path,'utf8'))!==hash)throw Error(`Performance source drift: ${path}`);
  if(!freeze.smokeTasks.includes(taskId)||!['A','B','C'].includes(arm)||repetition!==1)throw Error('Only preregistered smoke is admitted in this stage');
  const key=`${taskId}-${arm}-${repetition}`,path=`${directory}/${key}`;
  const task=(JSON.parse(await readFile('experiments/hybrid-evaluation-v5/performance-inputs.json','utf8')) as Array<{id:string;prompt:string}>).find(t=>t.id===taskId)!;
  const identity=sha(json({runtimeHash,key,task}));
  try{const prior=JSON.parse(await readFile(`${path}.claim.json`,'utf8'));if(prior.identity!==identity)throw Error('Task identity drift');
   throw Error(`Task ${key} already claimed; inspect saved result and receipts, never restart it for timing`);
  }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  const pending=await admin.query("select count(*)::int n from agent_run where status in('running','queued','waiting_user')");
  if(pending.rows[0].n)throw Error('Another isolated task is pending; reconcile before submitting another');
  process.env.ENABLE_HYBRID_EXECUTION=arm==='A'?'0':'1';
  const startedAt=new Date().toISOString(),clock=performance.now();
  await writeFile(`${path}.claim.json`,json({identity,startedAt,status:'started',taskId,arm,repetition}),{flag:'wx'});
  const run=await enqueueRun(userId,{content:task.prompt,attachments:[],requestKey:id(identity)},configs[arm as keyof typeof configs]);
  const enqueuedAt=new Date().toISOString();
  await writeFile(`${path}.claim.json`,json({identity,startedAt,status:'enqueued',runId:run.id,taskId,arm,repetition}));
  const claimed=await claimRun(`hybrid-evaluation-${key}`);
  if(!claimed||claimed.id!==run.id||claimed.user_id!==userId)throw Error('Isolated queue claim mismatch');
  const context={userId,runId:run.id,leaseToken:claimed.lease_token,role:'member' as const};
  const claimedAt=new Date().toISOString(),controller=new AbortController(),originalFetch=globalThis.fetch;
  let policyViolation=false;
  const wire:Array<{startedAt:string;endedAt?:string;model:string|null;path:string;status?:number;error?:string;diagnostic?:ReturnType<typeof failureDiagnostic>}>=[];
  const heartbeatTimer=setInterval(()=>{void heartbeat(context).then(ok=>{if(!ok)controller.abort(new Error('Evaluation lease lost'));}).catch(()=>controller.abort(new Error('Evaluation heartbeat failed')));},15000);
  const deadline=setTimeout(()=>controller.abort(new Error('Evaluation deadline')),freeze.maximumTaskMs);
  globalThis.fetch=async(input,init)=>{
   controller.signal.throwIfAborted();
   const url=new URL(input instanceof Request?input.url:String(input));
   // The smoke tasks require no outside search or writes. Preserve the configured model proxy.
   if(url.origin!=='https://openrouter.ai'||!['/api/v1/chat/completions','/api/alpha/decisions'].includes(url.pathname)){
    policyViolation=true;controller.abort(new Error('Smoke network endpoint not admitted'));
    throw Error('Smoke network endpoint not admitted');
   }
   if(wire.length>=freeze.maximumHttpRequestsPerTask)throw Error('Smoke HTTP attempt cap');
   const body=typeof init?.body==='string'?JSON.parse(init.body):{};
   const row={startedAt:new Date().toISOString(),model:typeof body.model==='string'?body.model:null,path:url.pathname} as typeof wire[number];wire.push(row);
   try{const response=await modelRoutedTransport(originalFetch,input,init)(input,{...init,signal:AbortSignal.any([controller.signal,...(init?.signal?[init.signal]:[])])});
    row.status=response.status;return response;
   }catch(error){row.error='transport-failure';row.diagnostic=failureDiagnostic(error);throw error;}finally{row.endedAt=new Date().toISOString();}
  };
  let failure:string|null=null;
  try{await executeMainAgentRun(userId,run.id,claimed.lease_token);}catch(error){failure=(error as Error).name;}
  finally{clearInterval(heartbeatTimer);clearTimeout(deadline);globalThis.fetch=originalFetch;}
  const final=await getRun(userId,run.id),endedAt=new Date().toISOString(),backendMs=performance.now()-clock;
  const persistedAt=(await admin.query('select updated_at from agent_run where id=$1',[run.id])).rows[0].updated_at.toISOString();
  const calls=(await admin.query('select id,tool_id,effect,input,output,status,metrics,created_at,updated_at from agent_tool_call where user_id=$1 and run_id=$2 order by created_at,id',[userId,run.id])).rows;
  if(calls.some(c=>!['model','read'].includes(c.effect)&&c.tool_id!=='programmatic_tools'))policyViolation=true;
  const billing=(await admin.query('select id,status,reported_micros::text,metrics,created_at,updated_at from paid_call_reservation where user_id=$1 and operation_id=$2 order by created_at,id',[userId,run.id])).rows;
  await writeFile(`${path}.trace.json`,json({runId:run.id,final,calls,billing,wire,failure,policyViolation,startedAt,enqueuedAt,claimedAt,endedAt,backendMs}));
  const events=billing.map(b=>{
   const match=calls.find(c=>typeof c.metrics?.generationId==='string'&&sha(c.metrics.generationId)===b.metrics?.providerUsage?.providerRequestHash);
   const fields=b.metrics?.providerUsage?.fields??{};
   return {eventId:b.id,provider:'openrouter',requestId:match?.metrics?.generationId??null,
    stage:b.metrics?.modelAttempt?.requestedModel==='typesafe/jev-1.14'?'router':'main',
    status:b.metrics?.validOutputItems===1?'succeeded':'unknown',
    amount:match?.metrics?.usage?.cost??null,currency:'USD',
    usage:{inputTokens:b.metrics?.inputTokens??null,outputTokens:b.metrics?.outputTokens??null,
     cachedTokens:fields['prompt_tokens_details.cached_tokens']??fields['input_tokens_details.cached_tokens']??fields.cache_read_input_tokens??null,
     reasoningTokens:fields['completion_tokens_details.reasoning_tokens']??fields['output_tokens_details.reasoning_tokens']??null,credits:b.metrics?.apiCredits??null},
    receiptRef:`${path}.trace.json`,startedAt:new Date(b.created_at).toISOString(),endedAt:new Date(b.updated_at).toISOString()};
  });
  const actualRoutes=[...(calls.some(c=>c.tool_id==='workflow_read'&&c.output?.status==='success')?['fixed_workflow']:[]),
   ...(calls.some(c=>c.tool_id==='programmatic_tools'&&c.output?.status==='success')?['interpreter']:[])];
  if(!actualRoutes.length)actualRoutes.push('dynamic_agent');
  const elapsed=(c:typeof calls[number])=>new Date(c.updated_at).getTime()-new Date(c.created_at).getTime();
  const observation={kind:'performance',runId:run.id,taskId,arm,repetition,blockId:`${taskId}/${repetition}`,manifestHash:designHash,runtimeFreezeHash:runtimeHash,
   fixtureHash:mail.fixtureHash,lane:'controlled',status:final?.status==='completed'?'answered':final?.status==='partial'?'partial':'failed',
   timestamps:{userSubmitted:null,enqueued:enqueuedAt,started:claimedAt,firstUsefulOutput:null,persisted:persistedAt,answerVisible:null},
   timingMs:{userWall:null,enqueueToTerminal:['completed','partial'].includes(final?.status??'')?Date.parse(persistedAt)-Date.parse(enqueuedAt):null,queue:Date.parse(claimedAt)-Date.parse(enqueuedAt),
    router:calls.filter(c=>c.tool_id==='decision_router').reduce((s,c)=>s+elapsed(c),0),modelWork:calls.filter(c=>c.tool_id==='main_model').reduce((s,c)=>s+elapsed(c),0),
    toolWork:calls.filter(c=>!['main_model','decision_router','workflow_read','programmatic_tools','programmatic_read'].includes(c.tool_id)).reduce((s,c)=>s+elapsed(c),0),
    persistence:null,uiWait:null,firstUsefulOutput:null},actualRoutes,traceRef:`${path}.trace.json`,answerRef:`${path}.trace.json`,
   modelAttempts:calls.filter(c=>c.tool_id==='main_model').length,toolCalls:calls.filter(c=>!['main_model','decision_router'].includes(c.tool_id)).length,
   programCalls:calls.filter(c=>c.tool_id==='programmatic_tools').length,billableEvents:events,
   billingComplete:events.length===wire.length&&events.every(e=>e.amount!==null),localResourcesRef:null,quality:null,error:failure};
  const validate=new Ajv({allErrors:true}).compile(JSON.parse(await readFile(`${root}/observations.schema.json`,'utf8')));
  if(!validate(observation))throw Error(JSON.stringify(validate.errors));
  await writeFile(`${path}.observation.json`,json(observation));
  if(policyViolation)throw Error('Unexpected endpoint or effect; saved diagnostic, stop continuation');
  console.log(json({taskId,arm,status:observation.status,runId:run.id,backendMs,modelAttempts:observation.modelAttempts,programCalls:observation.programCalls,
   knownCostUsd:events.reduce((s,e)=>s+(e.amount??0),0),billingComplete:observation.billingComplete,qualityReviewed:false}));
 }
}finally{await admin.end();}
}
