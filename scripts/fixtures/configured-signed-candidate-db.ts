import assert from 'node:assert/strict';
import {verifyConfiguredRuntimeProcessCrash} from './configured-runtime-process-crash-db';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {spawn} from 'node:child_process';
import {build} from 'esbuild';
import {productNodeBuildOptions} from '../lib/product-node-build.mjs';
import type {Pool} from 'pg';
import {digest} from '../../src/lib/assistant/main/contracts';
import {prepareSkillExecutionIdentity} from '../../src/lib/assistant/main/skill-runtime-identity';
import {prepareSkillAcceptanceBaseline} from '../../src/lib/assistant/main/skill-acceptance-baseline';
import {prepareRecordedSkillCandidateSnapshot} from '../../src/lib/assistant/main/skill-candidate-source';
import {tenantTransaction} from '../../src/lib/rag/db';
import {readSkillAcceptanceEvidence} from '../../src/lib/assistant/main/skill-acceptance-store';
import {lockSkillRuntimeMaterialSources} from '../../src/lib/assistant/main/skill-runtime-material-sources';
import {readCompletedSkillCandidateRuntimeTask} from '../../src/lib/assistant/main/skill-candidate-runtime-task';
import {readSkillAcceptanceReviewCase} from '../../src/lib/assistant/main/skill-acceptance-review';
import {freezeSkillAcceptancePlan} from '../../src/lib/assistant/main/skill-acceptance-freeze';
import type {SkillCollectorTransaction} from '../../src/lib/assistant/main/skill-model-journal';
import type {SkillCandidateCollector} from '../../src/lib/assistant/main/skill-candidate-model';

/** Actual configured runner; network and paid-fetch adapters are synthetic. */
export async function verifyConfiguredSignedCandidateDatabase(pool:Pool,input:{owner:string;runId:string;skillId:string;directory:string;keyPath:string;keyId:string;collectorId:string;deploymentHash:string;
 prospective?:{jobId:string;frozen:NonNullable<SkillCandidateCollector['frozen']>};frozenOverride?:NonNullable<SkillCandidateCollector['frozen']>}){
 const context={userId:input.owner},identity=await prepareSkillExecutionIdentity(context,{runId:input.runId});
 const baseline=await prepareSkillAcceptanceBaseline(context,{runId:input.runId});
 const snapshot=await prepareRecordedSkillCandidateSnapshot(context,{runId:input.runId,skillId:input.skillId,version:1});
 const transaction:SkillCollectorTransaction=async(userId,work)=>{
  const client=await pool.connect();try{await client.query('begin');await client.query('set local role network_copilot_skill_collector');
   await client.query("select set_config('app.current_user_id',$1,true)",[userId]);const value=await work(client);await client.query('commit');return value;
  }catch(error){await client.query('rollback');throw error;}finally{client.release();}
 };
 const hash=digest('synthetic-unexecuted-other-cases'),frozen=input.prospective?.frozen??input.frozenOverride??await freezeSkillAcceptancePlan(context,{protocol:'skill-acceptance-plan-v1',
  pin:{ownerId:input.owner,skillId:input.skillId,version:1,contentHash:snapshot.snapshot.candidate.value.content_hash,sourceHash:snapshot.skillSourceHash},identity,
  expiresAt:new Date(Date.now()+3600000).toISOString(),cases:[{id:'signed-replay',category:'replay',provenance:'historical-task',inputHash:baseline.projection.inputHash,sourceHash:baseline.projectionHash},
   ...(['negative','injection','permissions','shadow'] as const).map(category=>({id:category,category,provenance:category==='shadow'?'prospective-task' as const:'safety-fixture' as const,inputHash:hash,sourceHash:hash}))]},transaction);
 const evaluationId=randomUUID(),jobPath=join(input.directory,'configured-candidate-job.json'),compiledPath=join(process.cwd(),'tmp','configured-candidate-fixture.mjs');
 await writeFile(jobPath,JSON.stringify({ownerId:input.owner,freezeId:frozen.freezeId,evaluationId,maximumModelCalls:8,
  ...(input.prospective?{caseId:'signed-shadow',kind:'prospective',jobId:input.prospective.jobId}:{caseId:'signed-replay',kind:'historical',runId:input.runId})}));
 await build({...productNodeBuildOptions(),entryPoints:['scripts/skill-collector-runner.ts'],outfile:compiledPath,
  banner:{js:`globalThis.fetch=async(url,init)=>{if(process.env.MA24_CANDIDATE_FORBID_REQUEST==='1')throw new Error('Synthetic repeat requested network');if(String(url)!=='https://openrouter.ai/api/v1/chat/completions')throw new Error('Synthetic destination rejected');const body=JSON.parse(init.body);const step=body.messages.filter(m=>m.role==='assistant').length;if(step<Number(process.env.MA24_CANDIDATE_MINIMUM_HTTP_STEP||0))throw new Error('Completed model step requested again');const call=(id,name,args)=>({index:0,id,type:'function',function:{name,arguments:JSON.stringify(args)}});let calls;if(step===0)calls=[call('candidate-describe-skill','describe_tool',{tool:'skill_read'}),{...call('candidate-describe-customers','describe_tool',{tool:'customer_timeline'}),index:1}];else if(step===1)calls=[call('candidate-read-skill','execute_tool',{tool:'skill_read',arguments:{id:process.env.MA24_CANDIDATE_SKILL_ID}})];else if(step===2)calls=[call('candidate-read-customers','execute_tool',{tool:'customer_timeline',arguments:{}})];const chunk={id:'synthetic-candidate-'+process.env.MA24_CANDIDATE_EVALUATION_ID+'-'+step,model:body.model,provider:'synthetic',choices:[{index:0,delta:calls?{tool_calls:calls}:{content:'Synthetic streamed reply'},finish_reason:calls?'tool_calls':'stop'}]};const nl=String.fromCharCode(10);const response=new Response('data: '+JSON.stringify(chunk)+nl+nl+'data: [DONE]'+nl+nl,{status:200,headers:{'Content-Type':'text/event-stream'}});Object.defineProperty(response,'url',{value:String(url)});return response;};`},
  plugins:[{name:'explicit-synthetic-network-and-billing',setup(builder){
   if(process.env.MA24_CONFIGURED_RUNTIME_PROCESS_CRASH==='1')builder.onLoad({filter:/skill-runtime-candidate\.ts$/},async args=>{
    const source=await readFile(args.path,'utf8'),needle='await dispatchTool(call,context,tools)';assert.equal(source.split(needle).length,2);
    const replacement=`await(async()=>{const output=await dispatchTool(call,context,tools);if(process.env.MA24_RUNTIME_KILL_AFTER_SKILL_READ==='1'&&resolved.kind==='execute'&&resolved.tool.id==='skill_read'&&output.status==='success'){process.stdout.write('FIXTURE_RUNTIME_READ_COMMITTED'+String.fromCharCode(10),()=>process.kill(process.pid,'SIGKILL'));await new Promise<never>(()=>{});}return output;})()`;
    return {contents:source.replace(needle,replacement),loader:'ts',resolveDir:dirname(args.path)};
   });
   builder.onLoad({filter:/skill-candidate-runner\.ts$/},async args=>({contents:(await readFile(args.path,'utf8')).replace('}catch(error){stopReason=stopReason??',` }catch(error){const message=error instanceof Error?error.message:'';console.error('FIXTURE_INNER:'+(/^[A-Za-z -]{1,180}$/.test(message)?message:'Candidate nonstatic validation error'));stopReason=stopReason??`),loader:'ts',resolveDir:dirname(args.path)}));
   builder.onLoad({filter:/skill-collector-runner\.ts$/},async args=>({contents:(await readFile(args.path,'utf8')).replace('main().catch(()=>{',`main().catch(error=>{const code=error&&typeof error==='object'?error.code:undefined;if(typeof code==='string'&&/^[A-Z0-9_]{3,40}$/.test(code))console.error('FIXTURE_SQLCODE:'+code);const message=error instanceof Error?error.message:'';if(/^(Configured|Transport|Candidate|Recorded|Collector|Skill|Dedicated|Frozen|Local|Historical|Task) [A-Za-z -]{1,160}$/.test(message))console.error('FIXTURE_CODE:'+message);`),loader:'ts',resolveDir:dirname(args.path)}));
   builder.onResolve({filter:/(?:billing\/paid-fetch|network\/model-transport)$/},()=>({path:'synthetic-adapters',namespace:'ma24-fixture'}));
   builder.onLoad({filter:/.*/,namespace:'ma24-fixture'},()=>({contents:'export const budgetedFetch=(transport)=>transport; export const modelRoutedTransport=(transport)=>transport;',loader:'js'}));
  }}]});
 const launch=(reuse=false,crash=false,minimumStep=0)=>new Promise<{code:number|null;signal:string|null;output:string;diagnostic:string}>((resolve,reject)=>{
  const child=spawn(process.execPath,[compiledPath,'--execute',jobPath],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,
   NODE_ENV:'production',NODE_OPTIONS:'',NODE_EXTRA_CA_CERTS:'',SSL_CERT_FILE:'',SSL_CERT_DIR:'',NODE_USE_SYSTEM_CA:'0',NODE_TLS_REJECT_UNAUTHORIZED:'1',
   OPENROUTER_API_KEY:'SYNTHETIC_NOT_A_CREDENTIAL',OPENROUTER_BASE_URL:'https://openrouter.ai/api/v1',OPENROUTER_HTTP_REFERER:'',
   MA24_RUNTIME_KILL_AFTER_SKILL_READ:crash?'1':'0',MA24_CANDIDATE_MINIMUM_HTTP_STEP:String(minimumStep),MA24_CANDIDATE_FORBID_REQUEST:reuse?'1':'0',MA24_CANDIDATE_SKILL_ID:input.skillId,MA24_CANDIDATE_EVALUATION_ID:evaluationId,
   TASK_MODEL_TRANSPORT_COLLECTOR_ID:process.env.MA24_MEASURED_RUNTIME_PACKAGES_FILE?process.env.TASK_MODEL_TRANSPORT_COLLECTOR_ID:input.collectorId,
   TASK_MODEL_TRANSPORT_DEPLOYMENT_SHA256:process.env.MA24_MEASURED_RUNTIME_PACKAGES_FILE?process.env.TASK_MODEL_TRANSPORT_DEPLOYMENT_SHA256:input.deploymentHash,
   SKILL_RUNNER_COLLECTOR_ID:input.collectorId,SKILL_RUNNER_DEPLOYMENT_SHA256:input.deploymentHash,
   SKILL_MODEL_TRANSPORT_KEY_ID:input.keyId,SKILL_MODEL_TRANSPORT_PRIVATE_KEY_FILE:input.keyPath}});let output='',diagnostic='unclassified',diagnosticTail='';
  child.stdout.on('data',data=>{output+=String(data);});child.stderr.on('data',data=>{diagnosticTail=(diagnosticTail+String(data)).slice(-16_384);});child.once('error',reject);
  child.once('close',(code,signal)=>{
   for(const match of diagnosticTail.matchAll(/FIXTURE_(?:CODE|INNER):([A-Za-z -]{1,180})/g))diagnostic+='; '+match[1];
   for(const match of diagnosticTail.matchAll(/FIXTURE_SQLCODE:([A-Z0-9_]{3,40})/g))diagnostic+='; SQLCODE '+match[1];
   resolve({code,signal,output,diagnostic});
  });
 });
 const recovery=process.env.MA24_CONFIGURED_RUNTIME_PROCESS_CRASH==='1'&&!input.prospective?await verifyConfiguredRuntimeProcessCrash(pool,{owner:input.owner,evaluationId},launch):null;
 const exit=recovery?.exit??await launch();
 assert.equal(exit.code,0,`Configured signed candidate fixture failed: ${exit.diagnostic}`);assert(exit.output.includes('"collectorExecution":"completed"'));
 const bundles=(await pool.query<{id:string;raw_receipts:{collector:{protocol:string};candidateSources?:Record<string,{taskId:string}>;prospectiveSources?:Record<string,{taskId:string}>}}>('select id,raw_receipts from agent_skill_acceptance_bundle where owner_id=$1 and raw_receipts::text like $2',[input.owner,`%${evaluationId}%`])).rows;
 assert.equal(bundles.length,1);
 let runtimeTaskBindingVerified=false,completedRuntimeNoRequestReuseVerified=false,runtimeMaterialLockVerified=false,prospectiveCaptureMismatchRejected=false;
 {
  const prospective=Boolean(input.prospective),caseId=prospective?'signed-shadow':'signed-replay';
  assert.equal(bundles[0].raw_receipts.collector.protocol,prospective?'prospective-collector-v2':'historical-collector-v2');
  const taskId=(prospective?bundles[0].raw_receipts.prospectiveSources:bundles[0].raw_receipts.candidateSources)![caseId].taskId;
  const task=(await pool.query('select status,execution_kind,execution_spec from agent_run where id=$1 and user_id=$2',[taskId,input.owner])).rows[0];
  assert.equal(task.status,'completed');assert.equal(task.execution_kind,'main-agent-evaluation');
  assert.equal(task.execution_spec.schema,'skill-candidate-task-v1');assert.equal(task.execution_spec.originalRunId,input.runId);
  assert.equal(task.execution_spec.evaluationId,evaluationId);assert.equal(task.execution_spec.freezeId,frozen.freezeId);
  assert.equal(task.execution_spec.prospectiveJobId,input.prospective?.jobId);if(prospective)assert.match(task.execution_spec.prospectiveProjectionHash,/^[a-f0-9]{64}$/);
  const tools=(await pool.query('select id,tool_id,status,output from agent_tool_call where run_id=$1 order by tool_id',[taskId])).rows;
  assert.deepEqual(tools.map(row=>row.tool_id),['customer_timeline','skill_read']);assert(tools.every(row=>row.status==='completed'));
  const attempts=(await pool.query('select id,step,snapshot_hash,input_hash from agent_skill_model_attempt where evaluation_id=$1 order by step',[evaluationId])).rows;
  assert(attempts.length>0);
  const runtimeHash=digest({protocol:'skill-runtime-candidate-v2-postgres',sourceHash:snapshot.sourceHash,taskId,specHash:digest(task.execution_spec)});
  assert(attempts.every(row=>row.snapshot_hash===runtimeHash));runtimeTaskBindingVerified=true;
  const repeat=await launch(true);assert.equal(repeat.code,0,`Configured completed runtime reuse failed: ${repeat.diagnostic}`);
  assert(repeat.output.includes('"collectorExecution":"completed"'));
  assert.deepEqual((await pool.query('select id,step,snapshot_hash,input_hash from agent_skill_model_attempt where evaluation_id=$1 order by step',[evaluationId])).rows,attempts);
  assert.deepEqual((await pool.query('select id,tool_id,status,output from agent_tool_call where run_id=$1 order by tool_id',[taskId])).rows,tools);
  assert.deepEqual((await pool.query('select id from agent_skill_acceptance_bundle where owner_id=$1 and raw_receipts::text like $2',[input.owner,`%${evaluationId}%`])).rows,[{id:bundles[0].id}]);
  const review=await readSkillAcceptanceReviewCase(context,{bundleId:bundles[0].id,caseId});
  assert.equal(review.judgment,null);assert.equal(review.automaticActivation,false);
  assert(review.receipts.some(row=>'arm' in row&&row.arm==='baseline'));assert(review.receipts.some(row=>'arm' in row&&row.arm==='candidate'));
  const material=await readSkillAcceptanceEvidence(context,bundles[0].id);
  const locked=await tenantTransaction(input.owner,client=>lockSkillRuntimeMaterialSources(client,input.owner,material.artifact));
  assert.equal(locked.runtimeTaskCount,1);assert.match(locked.runtimeTaskLedgerHash!,/^[a-f0-9]{64}$/);runtimeMaterialLockVerified=true;
  if(input.prospective){
   const changed=structuredClone(material.artifact),sources=changed.rawReceipts.prospectiveSources as Record<string,{sourceProjectionHash:string}>;
   sources[caseId].sourceProjectionHash=digest('changed-capture-projection');
   await assert.rejects(tenantTransaction(input.owner,client=>lockSkillRuntimeMaterialSources(client,input.owner,changed)),/Runtime material task binding changed/);
   const pin={taskId,runId:input.runId,skillId:input.skillId,version:1,freezeId:frozen.freezeId,caseId,evaluationId,arm:'candidate' as const};
   await assert.rejects(readCompletedSkillCandidateRuntimeTask(context,pin,frozen.plan),/Skill runtime task sources or frozen identity changed/);
   await assert.rejects(readCompletedSkillCandidateRuntimeTask(context,{...pin,prospectiveJobId:randomUUID()},frozen.plan),/Prospective capture unavailable/);
   await readCompletedSkillCandidateRuntimeTask(context,{...pin,prospectiveJobId:input.prospective.jobId},frozen.plan);
   prospectiveCaptureMismatchRejected=true;
  }
  completedRuntimeNoRequestReuseVerified=true;
 }

 assert.equal((await pool.query('select enabled from agent_skill where id=$1',[input.skillId])).rows[0].enabled,false);
 return {collectorBundleId:bundles[0].id,configuredSignedCandidateDatabaseVerified:true,...(recovery?Object.fromEntries(Object.entries(recovery).filter(([key])=>key!=='exit')):{}),runtimeTaskBindingVerified,completedRuntimeNoRequestReuseVerified,runtimeTwoArmReviewVerified:true,runtimeMaterialLockVerified,prospectiveCaptureMismatchRejected,configuredCandidateKind:input.prospective?'prospective':'historical',candidateSkillRemainsDisabled:true,actualModelCalls:0,automaticActivation:false};
}
