import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {build} from 'esbuild';
import {productNodeBuildOptions} from '../lib/product-node-build.mjs';
import type {Pool} from 'pg';
import {tenantTransaction} from '../../src/lib/rag/db';
import {readSkillAcceptanceEvidence} from '../../src/lib/assistant/main/skill-acceptance-store';
import {lockSkillRuntimeMaterialSources} from '../../src/lib/assistant/main/skill-runtime-material-sources';
import {digest} from '../../src/lib/assistant/main/contracts';
import {prepareSkillExecutionIdentity} from '../../src/lib/assistant/main/skill-runtime-identity';
import {prepareSkillAcceptanceBaseline} from '../../src/lib/assistant/main/skill-acceptance-baseline';
import {prepareRecordedSkillCandidateSnapshot} from '../../src/lib/assistant/main/skill-candidate-source';
import {prepareSkillSafetyCandidate} from '../../src/lib/assistant/main/skill-safety-candidate';
import {freezeSkillAcceptancePlan} from '../../src/lib/assistant/main/skill-acceptance-freeze';
import {collectSkillSafetyAcceptance} from '../../src/lib/assistant/main/skill-safety-collector';
import {readSkillAcceptanceReviewCase} from '../../src/lib/assistant/main/skill-acceptance-review';
import type {SkillCollectorTransaction} from '../../src/lib/assistant/main/skill-model-journal';
import type {SkillCandidateCollector} from '../../src/lib/assistant/main/skill-candidate-model';

/** Three synthetic safety categories, both arms, actual configured signing/SQL.
 * Scripted responses cannot prove the behavior of a real model. */
export async function verifyConfiguredSignedSafetyDatabase(pool:Pool,input:{owner:string;runId:string;skillId:string;directory:string;keyPath:string;keyId:string;collectorId:string;deploymentHash:string;frozenOverride?:NonNullable<SkillCandidateCollector['frozen']>}){
 const context={userId:input.owner},identity=await prepareSkillExecutionIdentity(context,{runId:input.runId});
 const baseline=await prepareSkillAcceptanceBaseline(context,{runId:input.runId});
 const snapshot=await prepareRecordedSkillCandidateSnapshot(context,{runId:input.runId,skillId:input.skillId,version:1});
 const transaction:SkillCollectorTransaction=async(owner,work)=>{
  const client=await pool.connect();try{await client.query('begin');await client.query('set local role network_copilot_skill_collector');await client.query("select set_config('app.current_user_id',$1,true)",[owner]);
   const value=await work(client);await client.query('commit');return value;
  }catch(error){await client.query('rollback');throw error;}finally{client.release();}
 };
 const cases:Array<{caseId:string;saved:Awaited<ReturnType<typeof prepareSkillSafetyCandidate>>}>=[];
 for(const caseId of ['safety-ambiguous','safety-source-injection','safety-cross-account'])cases.push({caseId,saved:await prepareSkillSafetyCandidate(context,{runId:input.runId,skillId:input.skillId,version:1,caseId})});
 const unused=digest('unexecuted-shadow'),frozen=input.frozenOverride??await freezeSkillAcceptancePlan(context,{protocol:'skill-acceptance-plan-v1',
  pin:{ownerId:input.owner,skillId:input.skillId,version:1,contentHash:snapshot.snapshot.candidate.value.content_hash,sourceHash:snapshot.skillSourceHash},identity,expiresAt:new Date(Date.now()+3600000).toISOString(),
  cases:[{id:'unexecuted-replay',category:'replay',provenance:'historical-task',inputHash:baseline.projection.inputHash,sourceHash:baseline.projectionHash},
   ...cases.map(({caseId,saved})=>({id:caseId,category:saved.category,provenance:'safety-fixture' as const,inputHash:saved.inputHash,sourceHash:saved.sourceHash})),
   {id:'unexecuted-shadow',category:'shadow',provenance:'prospective-task',inputHash:unused,sourceHash:unused}]},transaction);
 const compiledPath=join(process.cwd(),'tmp','configured-safety-fixture.mjs');
 await build({...productNodeBuildOptions(),entryPoints:['scripts/skill-collector-runner.ts'],outfile:compiledPath,
  banner:{js:`globalThis.fetch=async(url,init)=>{if(process.env.MA24_SAFETY_FORBID_REQUEST==='1')throw new Error('Synthetic safety repeat requested network');if(String(url)!=='https://openrouter.ai/api/v1/chat/completions')throw new Error('Synthetic destination rejected');const body=JSON.parse(init.body),step=body.messages.filter(m=>m.role==='assistant').length,actions=[];if(process.env.MA24_SAFETY_ARM==='candidate')actions.push(['describe_tool',{tool:'skill_read'}],['execute_tool',{tool:'skill_read',arguments:{id:process.env.MA24_CANDIDATE_SKILL_ID}}]);const receipt=JSON.parse(process.env.MA24_SAFETY_RECEIPT||'null');if(receipt)actions.push(['describe_tool',{tool:receipt.tool}],['execute_tool',{tool:receipt.tool,arguments:receipt.arguments}]);const action=actions[step],calls=action?[{index:0,id:'safety-call-'+step,type:'function',function:{name:action[0],arguments:JSON.stringify(action[1])}}]:undefined;const chunk={id:'synthetic-'+process.env.MA24_SAFETY_CASE+'-'+process.env.MA24_SAFETY_ARM+'-'+step,model:body.model,provider:'synthetic',choices:[{index:0,delta:calls?{tool_calls:calls}:{content:'Synthetic bounded safety response; no real quality judgment.'},finish_reason:calls?'tool_calls':'stop'}]};const nl=String.fromCharCode(10),response=new Response('data: '+JSON.stringify(chunk)+nl+nl+'data: [DONE]'+nl+nl,{status:200,headers:{'Content-Type':'text/event-stream'}});Object.defineProperty(response,'url',{value:String(url)});return response;};`},
  plugins:[{name:'explicit-synthetic-network-and-billing',setup(builder){
   builder.onResolve({filter:/(?:billing\/paid-fetch|network\/model-transport)$/},()=>({path:'synthetic-adapters',namespace:'ma24-fixture'}));
   builder.onLoad({filter:/.*/,namespace:'ma24-fixture'},()=>({contents:'export const budgetedFetch=(transport)=>transport; export const modelRoutedTransport=(transport)=>transport;',loader:'js'}));
  }}]});
 const references=[];
 for(const {caseId,saved} of cases){
  const evaluationId=randomUUID();
  const taskIds=await Promise.all((['baseline','candidate'] as const).map(async arm=>{
   const jobPath=join(input.directory,`configured-${caseId}-${arm}-job.json`);
   await writeFile(jobPath,JSON.stringify({ownerId:input.owner,freezeId:frozen.freezeId,evaluationId,caseId,maximumModelCalls:8,kind:'safety',runId:input.runId,arm}));
   const launch=(reuse=false)=>new Promise<{code:number|null;output:string}>((resolve,reject)=>{
    const child=spawn(process.execPath,[compiledPath,'--execute',jobPath],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,
     NODE_ENV:'production',NODE_OPTIONS:'',NODE_EXTRA_CA_CERTS:'',SSL_CERT_FILE:'',SSL_CERT_DIR:'',NODE_USE_SYSTEM_CA:'0',NODE_TLS_REJECT_UNAUTHORIZED:'1',
     OPENROUTER_API_KEY:'SYNTHETIC_NOT_A_CREDENTIAL',OPENROUTER_BASE_URL:'https://openrouter.ai/api/v1',OPENROUTER_HTTP_REFERER:'',
     MA24_SAFETY_FORBID_REQUEST:reuse?'1':'0',MA24_CANDIDATE_SKILL_ID:input.skillId,MA24_SAFETY_ARM:arm,MA24_SAFETY_CASE:caseId,MA24_SAFETY_RECEIPT:JSON.stringify(saved.snapshot.receipts[0]??null),
     SKILL_RUNNER_COLLECTOR_ID:input.collectorId,SKILL_RUNNER_DEPLOYMENT_SHA256:input.deploymentHash,
     SKILL_MODEL_TRANSPORT_KEY_ID:input.keyId,SKILL_MODEL_TRANSPORT_PRIVATE_KEY_FILE:input.keyPath}});let output='';
    child.stdout.on('data',data=>{output+=String(data);});child.stderr.on('data',()=>{});child.once('error',reject);child.once('exit',code=>resolve({code,output}));
   });
   const exit=await launch();
   assert.equal(exit.code,0,`Configured safety fixture failed: ${caseId} ${arm}`);assert(exit.output.includes('"collectorExecution":"completed"'));
   const result=JSON.parse(exit.output.trim()),taskId=result.taskId;assert.equal(typeof taskId,'string');
   const task=(await pool.query('select status,execution_spec,input from agent_run where id=$1 and user_id=$2',[taskId,input.owner])).rows[0];
   assert.equal(task.status,'completed');assert.equal(task.execution_spec.safetyCaseId,caseId);assert.equal(task.execution_spec.arm,arm);
   assert.equal(task.execution_spec.inputHash,saved.inputHash);assert.equal(task.execution_spec.snapshotHash,saved.sourceHash);
   assert.equal(task.input.content,saved.snapshot.initialMessages.findLast(row=>row.role==='user')!.content);
   const tools=(await pool.query('select id,tool_id,status,input_hash,output from agent_tool_call where run_id=$1 order by id',[taskId])).rows;
   assert(tools.every(row=>row.status==='completed'));if(arm==='candidate')assert(tools.some(row=>row.tool_id==='skill_read'));
   const attempts=(await pool.query('select id,snapshot_hash,input_hash from agent_skill_model_attempt where evaluation_id=$1 and arm=$2 order by id',[evaluationId,arm])).rows;
   const expectedHash=digest({protocol:'skill-runtime-candidate-v1',sourceHash:saved.sourceHash,taskId,specHash:digest(task.execution_spec)});
   assert(attempts.length>0);assert(attempts.every(row=>row.snapshot_hash===expectedHash));
   if(caseId===cases[0].caseId){
    const repeat=await launch(true);assert.equal(repeat.code,0,`Safety completed reuse failed: ${arm}`);assert.equal(JSON.parse(repeat.output.trim()).taskId,taskId);
    assert.deepEqual((await pool.query('select id,snapshot_hash,input_hash from agent_skill_model_attempt where evaluation_id=$1 and arm=$2 order by id',[evaluationId,arm])).rows,attempts);
    assert.deepEqual((await pool.query('select id,tool_id,status,input_hash,output from agent_tool_call where run_id=$1 order by id',[taskId])).rows,tools);
   }
   console.log(JSON.stringify({configuredSafetyArm:'passed',caseId,arm,actualModelCalls:0,automaticActivation:false}));
   return taskId as string;
  }));
  assert.notEqual(taskIds[0],taskIds[1]);references.push({caseId,runId:input.runId,evaluationId,baselineTaskId:taskIds[0],candidateTaskId:taskIds[1]});
 }
 const collected=await collectSkillSafetyAcceptance(context,{freezeId:frozen.freezeId,plan:frozen.plan,cases:references},transaction);
 for(const {caseId} of cases){const material=await readSkillAcceptanceReviewCase(context,{bundleId:collected.bundleId,caseId});assert.equal(material.judgment,null);assert.equal(material.automaticActivation,false);}
 const material=await readSkillAcceptanceEvidence(context,collected.bundleId);
 const locked=await tenantTransaction(input.owner,client=>lockSkillRuntimeMaterialSources(client,input.owner,material.artifact));
 assert.equal(locked.runtimeTaskCount,6);assert.match(locked.runtimeTaskLedgerHash!,/^[a-f0-9]{64}$/);
 assert.equal((await pool.query('select enabled from agent_skill where id=$1',[input.skillId])).rows[0].enabled,false);
 return {collectorBundleId:collected.bundleId,configuredSignedSafetyDatabaseVerified:true,safetyCasesCollected:cases.length,safetyRuntimeSixTasksAndSignedSnapshotsVerified:true,safetyFirstCaseBothArmNoRequestReuseVerified:true,safetyRuntimeSixTaskMaterialLocksVerified:true,bothArmsSignedAndVerified:true,qualityAccepted:false,automaticActivation:false};
}
