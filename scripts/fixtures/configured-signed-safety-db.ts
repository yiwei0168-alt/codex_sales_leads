import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {build} from 'esbuild';
import type {Pool} from 'pg';
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
 const cases=[];
 for(const caseId of ['safety-ambiguous','safety-source-injection','safety-cross-account'])cases.push({caseId,saved:await prepareSkillSafetyCandidate(context,{runId:input.runId,skillId:input.skillId,version:1,caseId})});
 const unused=digest('unexecuted-shadow'),frozen=input.frozenOverride??await freezeSkillAcceptancePlan(context,{protocol:'skill-acceptance-plan-v1',
  pin:{ownerId:input.owner,skillId:input.skillId,version:1,contentHash:snapshot.snapshot.candidate.value.content_hash,sourceHash:snapshot.skillSourceHash},identity,expiresAt:new Date(Date.now()+3600000).toISOString(),
  cases:[{id:'unexecuted-replay',category:'replay',provenance:'historical-task',inputHash:baseline.projection.inputHash,sourceHash:baseline.projectionHash},
   ...cases.map(({caseId,saved})=>({id:caseId,category:saved.category,provenance:'safety-fixture' as const,inputHash:saved.inputHash,sourceHash:saved.sourceHash})),
   {id:'unexecuted-shadow',category:'shadow',provenance:'prospective-task',inputHash:unused,sourceHash:unused}]},transaction);
 const compiledPath=join(process.cwd(),'tmp','configured-safety-fixture.cjs');
 await build({entryPoints:['scripts/skill-collector-runner.ts'],outfile:compiledPath,bundle:true,platform:'node',target:'node24',format:'cjs',packages:'external',logLevel:'warning',
  banner:{js:`globalThis.fetch=async(url,init)=>{if(String(url)!=='https://openrouter.ai/api/v1/chat/completions')throw new Error('Synthetic destination rejected');const body=JSON.parse(init.body),step=body.messages.filter(m=>m.role==='assistant').length,actions=[];if(process.env.MA24_SAFETY_ARM==='candidate')actions.push(['describe_tool',{tool:'skill_read'}],['execute_tool',{tool:'skill_read',arguments:{id:process.env.MA24_CANDIDATE_SKILL_ID}}]);const receipt=JSON.parse(process.env.MA24_SAFETY_RECEIPT||'null');if(receipt)actions.push(['describe_tool',{tool:receipt.tool}],['execute_tool',{tool:receipt.tool,arguments:receipt.arguments}]);const action=actions[step],calls=action?[{index:0,id:'safety-call-'+step,type:'function',function:{name:action[0],arguments:JSON.stringify(action[1])}}]:undefined;const chunk={id:'synthetic-'+process.env.MA24_SAFETY_CASE+'-'+process.env.MA24_SAFETY_ARM+'-'+step,model:body.model,provider:'synthetic',choices:[{index:0,delta:calls?{tool_calls:calls}:{content:'Synthetic bounded safety response; no real quality judgment.'},finish_reason:calls?'tool_calls':'stop'}]};const nl=String.fromCharCode(10),response=new Response('data: '+JSON.stringify(chunk)+nl+nl+'data: [DONE]'+nl+nl,{status:200,headers:{'Content-Type':'text/event-stream'}});Object.defineProperty(response,'url',{value:String(url)});return response;};`},
  plugins:[{name:'explicit-synthetic-network-and-billing',setup(builder){
   builder.onResolve({filter:/(?:billing\/paid-fetch|network\/model-transport)$/},()=>({path:'synthetic-adapters',namespace:'ma24-fixture'}));
   builder.onLoad({filter:/.*/,namespace:'ma24-fixture'},()=>({contents:'export const budgetedFetch=(transport)=>transport; export const modelRoutedTransport=(transport)=>transport;',loader:'js'}));
  }}]});
 const references=[];
 for(const {caseId,saved} of cases){
  const evaluationId=randomUUID();
  for(const arm of ['baseline','candidate'] as const){
   const jobPath=join(input.directory,'configured-safety-job.json');
   await writeFile(jobPath,JSON.stringify({ownerId:input.owner,freezeId:frozen.freezeId,evaluationId,caseId,maximumModelCalls:8,kind:'safety',runId:input.runId,arm}));
   const exit=await new Promise<{code:number|null;output:string}>((resolve,reject)=>{
    const child=spawn(process.execPath,[compiledPath,'--execute',jobPath],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,
     NODE_ENV:'production',NODE_OPTIONS:'',NODE_EXTRA_CA_CERTS:'',SSL_CERT_FILE:'',SSL_CERT_DIR:'',NODE_USE_SYSTEM_CA:'0',NODE_TLS_REJECT_UNAUTHORIZED:'1',
     OPENROUTER_API_KEY:'SYNTHETIC_NOT_A_CREDENTIAL',OPENROUTER_BASE_URL:'https://openrouter.ai/api/v1',OPENROUTER_HTTP_REFERER:'',
     MA24_CANDIDATE_SKILL_ID:input.skillId,MA24_SAFETY_ARM:arm,MA24_SAFETY_CASE:caseId,MA24_SAFETY_RECEIPT:JSON.stringify(saved.snapshot.receipts[0]??null),
     SKILL_RUNNER_COLLECTOR_ID:input.collectorId,SKILL_RUNNER_DEPLOYMENT_SHA256:input.deploymentHash,
     SKILL_MODEL_TRANSPORT_KEY_ID:input.keyId,SKILL_MODEL_TRANSPORT_PRIVATE_KEY_FILE:input.keyPath}});let output='';
    child.stdout.on('data',data=>{output+=String(data);});child.stderr.on('data',()=>{});child.once('error',reject);child.once('exit',code=>resolve({code,output}));
   });
   assert.equal(exit.code,0,`Configured safety fixture failed: ${caseId} ${arm}`);assert(exit.output.includes('"collectorExecution":"completed"'));
   console.log(JSON.stringify({configuredSafetyArm:'passed',caseId,arm,actualModelCalls:0,automaticActivation:false}));
  }
  references.push({caseId,runId:input.runId,evaluationId});
 }
 const collected=await collectSkillSafetyAcceptance(context,{freezeId:frozen.freezeId,plan:frozen.plan,cases:references},transaction);
 for(const {caseId} of cases){const material=await readSkillAcceptanceReviewCase(context,{bundleId:collected.bundleId,caseId});assert.equal(material.judgment,null);assert.equal(material.automaticActivation,false);}
 assert.equal((await pool.query('select enabled from agent_skill where id=$1',[input.skillId])).rows[0].enabled,false);
 return {collectorBundleId:collected.bundleId,configuredSignedSafetyDatabaseVerified:true,safetyCasesCollected:cases.length,bothArmsSignedAndVerified:true,qualityAccepted:false,automaticActivation:false};
}
