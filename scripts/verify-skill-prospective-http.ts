import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
import {resolve} from 'node:path';
import type {Pool} from 'pg';
import {hashPassword} from '../src/lib/auth/password';

/** Disposable Linux builder only; no application route or production fixture switch. */
export async function verifySkillProspectiveHttp(pool:Pool,input:{owner:string;other:string;bundleId:string;skillId:string;baseline:string;candidate:string},fetchLocal:typeof fetch){
 assert.equal(process.env.MA24_DISPOSABLE_PROSPECTIVE_SOURCE,'1');
 assert.equal(process.env.MA24_PROSPECTIVE_HTTP,'1');
 assert.equal(process.platform,'linux');
 const listener=createServer();
 await new Promise<void>(done=>listener.listen(0,'127.0.0.1',done));
 const address=listener.address();assert(address&&typeof address!=='string');
 const port=address.port;await new Promise<void>((done,reject)=>listener.close(error=>error?reject(error):done()));
 const base=`http://127.0.0.1:${port}`,root=resolve('.next/standalone');
 const child=spawn(process.execPath,[resolve(root,'server.js')],{cwd:root,env:{
  NODE_ENV:'production',HOSTNAME:'127.0.0.1',PORT:String(port),
  DATABASE_URL:process.env.DATABASE_URL,MAILBOX_CREDENTIAL_KEY:process.env.MAILBOX_CREDENTIAL_KEY,
  LANGSMITH_TRACING:'false',LANGSMITH_TRACING_V2:'false',LANGCHAIN_TRACING:'false',LANGCHAIN_TRACING_V2:'false',
 },stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',value=>{logs=(logs+value).slice(-4000);});
 child.stderr.on('data',value=>{logs=(logs+value).slice(-4000);});
 let startupError:Error|undefined;child.on('error',error=>{startupError=error;});
 const exited=new Promise<void>(done=>child.once('close',()=>done()));
 const request=(path:string,init?:RequestInit)=>fetchLocal(`${base}${path}`,{...init,signal:AbortSignal.timeout(120000)});
 try{
  let ready=false;
  for(let attempt=0;attempt<100;attempt++){
   if(startupError)throw startupError;
   if(child.exitCode!==null)throw new Error(`Standalone stopped: ${logs}`);
   try{ready=(await request('/api/auth/session')).ok;}catch{/* starting */}
   if(ready)break;await new Promise(done=>setTimeout(done,200));
  }
  assert(ready,`Standalone did not start: ${logs}`);
  const login=async(userId:string)=>{
   const password=randomBytes(24).toString('base64url');
   await pool.query('update app_user set password_hash=$2 where id=$1',[userId,hashPassword(password)]);
   const response=await request('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:`${userId}@example.invalid`,password})});
   assert.equal(response.status,200,`Synthetic login: ${await response.text()}`);
   const cookie=response.headers.get('set-cookie')?.split(';')[0];assert(cookie);return cookie;
  };
  const cookie=await login(input.owner),otherCookie=await login(input.other);
  const path=`/api/assistant/skills/acceptance-reviews?id=${input.bundleId}&caseId=shadow`;
  assert.equal((await request(path)).status,401);
  const listed=await request(`/api/assistant/skills/acceptance-reviews?skillId=${input.skillId}`,{headers:{cookie}});
  assert.equal(listed.status,200);
  assert((await listed.json() as {items:Array<{id:string}>}).items.some(item=>item.id===input.bundleId));
  const response=await request(path,{headers:{cookie}});assert.equal(response.status,200,await response.clone().text());
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  const material=await response.json() as {baseline:string;candidate:string;receipts:unknown[];artifactHash:string;observationHash:string;automaticActivation:boolean};
  assert.equal(material.baseline,input.baseline);assert.equal(material.candidate,input.candidate);
  assert.equal(material.receipts.length,1);assert.equal(material.automaticActivation,false);
  assert.equal((await request(path,{headers:{cookie:otherCookie}})).status,409);
  const verdict={answer:false,citation:false,permission:false,injection:false};
  const body={bundleId:input.bundleId,artifactHash:material.artifactHash,expectedRevision:0,judgment:{
   caseId:'shadow',observationHash:material.observationHash,revoked:false,baseline:verdict,candidate:verdict,
   rationale:'Synthetic HTTP persistence test only; no real quality approval.'}};
  const post=(origin:string=base)=>request('/api/assistant/skills/acceptance-reviews',{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await post('https://cross-site.invalid')).status,403);
  const saved=await post();assert.equal(saved.status,200,await saved.clone().text());
  assert.deepEqual(await saved.json(),{revision:1,automaticActivation:false});
  assert.equal((await post()).status,409);
  const summary=await request(`/api/assistant/skills/acceptance-reviews?id=${input.bundleId}`,{headers:{cookie}});
  assert.equal(summary.status,200);
  const reviewed=(await summary.json() as {cases:Array<{id:string;judgment:{revision:number}|null}>}).cases.find(item=>item.id==='shadow');
  assert.equal(reviewed?.judgment?.revision,1);
  const rows=(await pool.query('select reviewer_id,reviewer_kind,revision,judgment from agent_skill_acceptance_judgment where bundle_id=$1',[input.bundleId])).rows;
  assert.equal(rows.length,1);assert.equal(rows[0].reviewer_id,input.owner);assert.equal(rows[0].reviewer_kind,'human');
  assert.equal(rows[0].revision,1);assert.deepEqual(rows[0].judgment.baseline,verdict);assert.deepEqual(rows[0].judgment.candidate,verdict);
  assert.equal((await pool.query('select enabled from agent_skill where id=$1',[input.skillId])).rows[0].enabled,false);
  console.log(JSON.stringify({prospectiveStandaloneHttp:'passed',materialRead:true,authenticatedReviewPersisted:true,
   crossAccountAnonymousCsrfStaleRevisionRejected:true,syntheticOnly:true,realQualityApproval:false,automaticActivation:false}));
 }finally{
  child.kill('SIGTERM');await exited;
 }
}
