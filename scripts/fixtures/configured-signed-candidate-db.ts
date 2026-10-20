import assert from 'node:assert/strict';
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
  banner:{js:`globalThis.fetch=async(url,init)=>{if(String(url)!=='https://openrouter.ai/api/v1/chat/completions')throw new Error('Synthetic destination rejected');const body=JSON.parse(init.body);const step=body.messages.filter(m=>m.role==='assistant').length;const call=(id,name,args)=>({index:0,id,type:'function',function:{name,arguments:JSON.stringify(args)}});let calls;if(step===0)calls=[call('candidate-describe-skill','describe_tool',{tool:'skill_read'}),{...call('candidate-describe-customers','describe_tool',{tool:'customer_timeline'}),index:1}];else if(step===1)calls=[call('candidate-read-skill','execute_tool',{tool:'skill_read',arguments:{id:process.env.MA24_CANDIDATE_SKILL_ID}})];else if(step===2)calls=[call('candidate-read-customers','execute_tool',{tool:'customer_timeline',arguments:{}})];const chunk={id:'synthetic-candidate-'+process.env.MA24_CANDIDATE_EVALUATION_ID+'-'+step,model:body.model,provider:'synthetic',choices:[{index:0,delta:calls?{tool_calls:calls}:{content:'Synthetic streamed reply'},finish_reason:calls?'tool_calls':'stop'}]};const nl=String.fromCharCode(10);const response=new Response('data: '+JSON.stringify(chunk)+nl+nl+'data: [DONE]'+nl+nl,{status:200,headers:{'Content-Type':'text/event-stream'}});Object.defineProperty(response,'url',{value:String(url)});return response;};`},
  plugins:[{name:'explicit-synthetic-network-and-billing',setup(builder){
   builder.onLoad({filter:/skill-candidate-runner\.ts$/},async args=>({contents:(await readFile(args.path,'utf8')).replace('}catch{stopReason=stopReason??',` }catch(error){const message=error instanceof Error?error.message:'';console.error('FIXTURE_INNER:'+(/^[A-Za-z -]{1,180}$/.test(message)?message:'Candidate nonstatic validation error'));stopReason=stopReason??`),loader:'ts',resolveDir:dirname(args.path)}));
   builder.onLoad({filter:/skill-configured-recorded-runner\.ts$/},async args=>({contents:(await readFile(args.path,'utf8')).replace("throw new Error('Configured recorded candidate incomplete or changed')","throw new Error('Configured candidate '+output.status+' '+output.stopReason+' skill-used '+String(output.candidateSkillUsed))"),loader:'ts',resolveDir:dirname(args.path)}));
   builder.onLoad({filter:/skill-collector-runner\.ts$/},async args=>({contents:(await readFile(args.path,'utf8')).replace('main().catch(()=>{',`main().catch(error=>{const message=error instanceof Error?error.message:'';if(/^(Configured|Transport|Candidate|Recorded|Collector|Skill|Dedicated|Frozen|Local|Historical|Task) [A-Za-z -]{1,160}$/.test(message))console.error('FIXTURE_CODE:'+message);`),loader:'ts',resolveDir:dirname(args.path)}));
   builder.onResolve({filter:/(?:billing\/paid-fetch|network\/model-transport)$/},()=>({path:'synthetic-adapters',namespace:'ma24-fixture'}));
   builder.onLoad({filter:/.*/,namespace:'ma24-fixture'},()=>({contents:'export const budgetedFetch=(transport)=>transport; export const modelRoutedTransport=(transport)=>transport;',loader:'js'}));
  }}]});
 const exit=await new Promise<{code:number|null;output:string;diagnostic:string}>((resolve,reject)=>{
  const child=spawn(process.execPath,[compiledPath,'--execute',jobPath],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,
   NODE_ENV:'production',NODE_OPTIONS:'',NODE_EXTRA_CA_CERTS:'',SSL_CERT_FILE:'',SSL_CERT_DIR:'',NODE_USE_SYSTEM_CA:'0',NODE_TLS_REJECT_UNAUTHORIZED:'1',
   OPENROUTER_API_KEY:'SYNTHETIC_NOT_A_CREDENTIAL',OPENROUTER_BASE_URL:'https://openrouter.ai/api/v1',OPENROUTER_HTTP_REFERER:'',
   MA24_CANDIDATE_SKILL_ID:input.skillId,MA24_CANDIDATE_EVALUATION_ID:evaluationId,
   TASK_MODEL_TRANSPORT_COLLECTOR_ID:process.env.MA24_MEASURED_RUNTIME_PACKAGES_FILE?process.env.TASK_MODEL_TRANSPORT_COLLECTOR_ID:input.collectorId,
   TASK_MODEL_TRANSPORT_DEPLOYMENT_SHA256:process.env.MA24_MEASURED_RUNTIME_PACKAGES_FILE?process.env.TASK_MODEL_TRANSPORT_DEPLOYMENT_SHA256:input.deploymentHash,
   SKILL_RUNNER_COLLECTOR_ID:input.collectorId,SKILL_RUNNER_DEPLOYMENT_SHA256:input.deploymentHash,
   SKILL_MODEL_TRANSPORT_KEY_ID:input.keyId,SKILL_MODEL_TRANSPORT_PRIVATE_KEY_FILE:input.keyPath}});let output='',diagnostic='unclassified';
  child.stdout.on('data',data=>{output+=String(data);});child.stderr.on('data',data=>{for(const match of String(data).matchAll(/FIXTURE_(?:CODE|INNER):([A-Za-z -]{1,180})/g))diagnostic+='; '+match[1];});child.once('error',reject);child.once('exit',code=>resolve({code,output,diagnostic}));
 });
 assert.equal(exit.code,0,`Configured signed candidate fixture failed: ${exit.diagnostic}`);assert(exit.output.includes('"collectorExecution":"completed"'));
 const bundles=(await pool.query<{id:string}>('select id from agent_skill_acceptance_bundle where owner_id=$1 and raw_receipts::text like $2',[input.owner,`%${evaluationId}%`])).rows;
 assert.equal(bundles.length,1);
 assert.equal((await pool.query('select enabled from agent_skill where id=$1',[input.skillId])).rows[0].enabled,false);
 return {collectorBundleId:bundles[0].id,configuredSignedCandidateDatabaseVerified:true,configuredCandidateKind:input.prospective?'prospective':'historical',candidateSkillRemainsDisabled:true,actualModelCalls:0,automaticActivation:false};
}
