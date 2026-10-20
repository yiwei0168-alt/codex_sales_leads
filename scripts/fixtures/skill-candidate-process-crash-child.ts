import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createConfiguredSkillCollectorConnection} from '../../src/lib/assistant/main/skill-collector-connection';
import {withSkillCandidateLease} from '../../src/lib/assistant/main/skill-candidate-lease';
import {prepareSkillCandidateCheckpoint} from '../../src/lib/assistant/main/skill-candidate-checkpoint';
import {createDurableSkillCandidateModel} from '../../src/lib/assistant/main/skill-candidate-model';
import {runSkillCandidateArm} from '../../src/lib/assistant/main/skill-candidate-runner';
import {modelFunctions,transportMessages} from '../../src/lib/assistant/main/model';
import {modelRequestManifest} from '../../src/lib/assistant/main/model-request-manifest';
import {disableLocalAnalysisTracing} from '../../src/lib/assistant/main/local-analysis-boundary';
import {digest} from '../../src/lib/assistant/main/contracts';

type Snapshot=Parameters<typeof runSkillCandidateArm>[0];
async function main(){
 assert.equal(process.env.MA24_DISPOSABLE_TRANSPORT_JOURNAL,'1');
 assert(['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname));
 const [path,mode]=process.argv.slice(2);assert(path&&['crash','resume'].includes(mode));
 disableLocalAnalysisTracing();globalThis.fetch=async()=>{throw new Error('External HTTP forbidden in crash fixture');};
 const job=JSON.parse(await readFile(path,'utf8')) as {snapshot:Snapshot;evaluationId:string;snapshotHash:string};
 assert.equal(digest(job.snapshot),job.snapshotHash);
 const connection=createConfiguredSkillCollectorConnection(),ownerId=job.snapshot.context.userId!;
 const pin={ownerId,evaluationId:job.evaluationId,arm:'candidate' as const,sourceKind:'synthetic-fixture' as const};
 const requestSteps:number[]=[];
 try{
  const output=await withSkillCandidateLease(connection.transaction,pin,async(check,token,signal)=>{
   const store=await prepareSkillCandidateCheckpoint(connection.transaction,{...pin,snapshotHash:job.snapshotHash},token,check);assert(store);
   const durable=createDurableSkillCandidateModel({ownerId,snapshotHash:job.snapshotHash,arm:pin.arm},
    {...pin,transaction:connection.transaction,request:async request=>{
     requestSteps.push(request.step);assert(request.step<=2);
     const message=request.step<2?{role:'assistant',content:null,tool_calls:[{id:`crash-provider-${request.step}`,type:'function',function:{
      name:request.step===0?'describe_tool':'execute_tool',arguments:JSON.stringify(request.step===0?{tool:'skill_read'}:{tool:'skill_read',arguments:{id:job.snapshot.candidate.listing.id}})}}]}:
      {role:'assistant',content:'Synthetic process crash recovered answer'};
     const route=request.profile.routes[request.index],body={model:route.model,messages:transportMessages(request.messages),tools:modelFunctions,stream:true,reasoning:{effort:route.effort}};
     return {message,requestManifest:modelRequestManifest(body,{model:route.model,provider:'synthetic',id:`crash-${request.step}`})};
    }},check);
   return runSkillCandidateArm(job.snapshot,pin.arm,durable.model,check,8,{load:store.load,save:async payload=>{
    await store.save(payload);
    if(mode==='crash'&&payload.state.pending[0]?.function.name==='execute_tool'){
     process.stdout.write(`${JSON.stringify({phase:'checkpoint-committed',pid:process.pid,token,requestSteps})}\n`);
     // Keep the real heartbeat alive until the supervisor forcibly terminates us.
     await new Promise<never>(()=>{});
    }
   }},signal);
  });
  process.stdout.write(`${JSON.stringify({phase:'completed',pid:process.pid,output,requestSteps})}\n`);
 }finally{await connection.close();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Crash fixture failed');process.exitCode=1;});
