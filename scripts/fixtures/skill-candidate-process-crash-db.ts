import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import type {Pool} from 'pg';
import type {runSkillCandidateArm} from '../../src/lib/assistant/main/skill-candidate-runner';
import {digest} from '../../src/lib/assistant/main/contracts';

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
type Result={phase:string;pid:number;token?:string;requestSteps:number[];output?:Awaited<ReturnType<typeof runSkillCandidateArm>>};
export async function verifySkillCandidateProcessCrashDatabase(pool:Pool,snapshot:Parameters<typeof runSkillCandidateArm>[0]){
 assert.equal(process.env.MA24_DISPOSABLE_TRANSPORT_JOURNAL,'1');
 const directory=await mkdtemp(join(tmpdir(),'ma24-candidate-process-crash-')),path=join(directory,'synthetic-job.json');
 const owner=snapshot.context.userId!,evaluation=randomUUID(),args=[owner,evaluation];
 const serializedSnapshot=JSON.parse(JSON.stringify(snapshot)) as typeof snapshot;
 await writeFile(path,JSON.stringify({snapshot:serializedSnapshot,evaluationId:evaluation,snapshotHash:digest(serializedSnapshot)}),{mode:0o600});
 const start=(mode:'crash'|'resume')=>{
  const env:NodeJS.ProcessEnv={NODE_ENV:'test'};
  for(const key of ['PATH','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','DATABASE_URL','SKILL_COLLECTOR_DATABASE_URL','MA24_DISPOSABLE_TRANSPORT_JOURNAL'])
   if(process.env[key])env[key]=process.env[key];
  // Direct --import uses one process; killing a launcher would leave its worker alive.
  const child=spawn(process.execPath,['--require',resolve('scripts/patch-node-user.cjs'),'--import','tsx',resolve('scripts/fixtures/skill-candidate-process-crash-child.ts'),path,mode],
   {env,stdio:['ignore','pipe','pipe'],windowsHide:true});
  let stdout='',stderr='';const messages:Result[]=[];
  child.stdout.on('data',chunk=>{stdout+=String(chunk);let newline:number;
   while((newline=stdout.indexOf('\n'))>=0){const line=stdout.slice(0,newline);stdout=stdout.slice(newline+1);if(line.startsWith('{'))messages.push(JSON.parse(line));}
  });
  child.stderr.on('data',chunk=>{stderr+=String(chunk);});
  const closed=new Promise<{code:number|null;signal:NodeJS.Signals|null}>(resolve=>{
   child.once('error',error=>{stderr+=error.message;});child.once('close',(code,signal)=>resolve({code,signal}));
  });
  const timeout=setTimeout(()=>child.kill('SIGKILL'),150000);void closed.finally(()=>clearTimeout(timeout));
  return {child,messages,closed,error:()=>stderr};
 };
 const processes:Array<ReturnType<typeof start>>=[];
 const launch=(mode:'crash'|'resume')=>{const current=start(mode);processes.push(current);return current;};
 try{
  const old=launch('crash'),readyUntil=Date.now()+45000;
  while(!old.messages.length&&old.child.exitCode===null&&old.child.signalCode===null&&Date.now()<readyUntil)await sleep(50);
  const ready=old.messages[0];assert(ready,`Candidate did not save checkpoint: ${old.error()}`);
  assert.equal(ready.phase,'checkpoint-committed');assert.equal(ready.pid,old.child.pid);assert.deepEqual(ready.requestSteps,[0,1]);
  const prior=(await pool.query('select revision,payload,payload_hash,execution_token from agent_skill_candidate_checkpoint where owner_id=$1 and evaluation_id=$2',args)).rows[0];
  assert.equal(prior.execution_token,ready.token);assert.equal(prior.payload.calls,2);assert.equal(prior.payload.state.pending[0].function.name,'execute_tool');
  assert.equal(digest(prior.payload),prior.payload_hash);
  const receipts=async()=>(await pool.query(`select a.id,a.step,a.route_index,o.output_hash from agent_skill_model_attempt a
   left join agent_skill_model_outcome o on o.attempt_id=a.id and o.owner_id=a.owner_id
   where a.owner_id=$1 and a.evaluation_id=$2 order by a.step,a.route_index`,args)).rows;
  const before=await receipts();assert.equal(before.length,2);assert(before.every(row=>row.output_hash));
  assert(old.child.kill('SIGKILL'));const killed=await old.closed;
  assert(killed.signal==='SIGKILL'||killed.code!==0,'Worker must terminate without a normal completion');
  const dead=(await pool.query(`select status,execution_token,lease_until>clock_timestamp() active,
   extract(epoch from (lease_until-updated_at)) seconds from agent_skill_candidate_execution_lease where owner_id=$1 and evaluation_id=$2`,args)).rows[0];
  assert.equal(dead.status,'running');assert.equal(dead.execution_token,ready.token);assert.equal(dead.active,true);
  assert(Number(dead.seconds)>89&&Number(dead.seconds)<=90.1,'Default 90-second lease, without a shortened cap');
  const early=launch('resume'),earlyExit=await early.closed;assert.notEqual(earlyExit.code,0);assert.match(early.error(),/already owned or controlled/);
  assert.deepEqual(await receipts(),before);
  const until=Date.now()+100000;let expired=false;
  while(Date.now()<until){
   expired=(await pool.query('select lease_until<=clock_timestamp() expired from agent_skill_candidate_execution_lease where owner_id=$1 and evaluation_id=$2',args)).rows[0]?.expired===true;
   if(expired)break;await sleep(250);
  }
  assert(expired,'Killed worker lease must expire naturally, without database mutation');
  const resumed=launch('resume'),resumedExit=await resumed.closed;assert.equal(resumedExit.code,0,resumed.error());
  const result=resumed.messages[0];assert.equal(result?.phase,'completed');assert.deepEqual(result.requestSteps,[2]);
  assert.equal(result.output?.status,'completed');assert.equal(result.output?.candidateSkillUsed,true);
  assert.equal(result.output?.modelCalls,3);assert.equal(result.output?.trace.length,2);
  const after=await receipts();assert.equal(after.length,3);assert.deepEqual(after.slice(0,2),before);
  const current=(await pool.query('select execution_token,revision from agent_skill_candidate_checkpoint where owner_id=$1 and evaluation_id=$2',args)).rows[0];
  assert.notEqual(current.execution_token,ready.token);assert(BigInt(current.revision)>BigInt(prior.revision));
  const terminal=launch('resume'),terminalExit=await terminal.closed;assert.equal(terminalExit.code,0,terminal.error());
  assert.deepEqual(terminal.messages[0]?.requestSteps,[]);assert.deepEqual(terminal.messages[0]?.output,result.output);assert.deepEqual(await receipts(),after);
  return {candidateProcessCrashRecoveryVerified:true,candidateActualProcessKillObserved:true,candidateDefaultNinetySecondLeaseExpiredNaturally:true,
   candidateEarlyProcessTakeoverRejected:true,candidateKilledProcessCompletedReceiptsUnchanged:true,candidateNewProcessCheckpointResumeVerified:true,
   candidateTerminalProcessNoRequests:true,actualModelCalls:0,productionAgentEquivalent:false,automaticActivation:false};
 }finally{
  for(const current of processes){if(current.child.exitCode===null&&current.child.signalCode===null)current.child.kill('SIGKILL');await current.closed;}
  await rm(directory,{recursive:true,force:true});
 }
}
