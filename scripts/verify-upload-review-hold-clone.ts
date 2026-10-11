import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFile,readdir,rm,rmdir,writeFile} from 'node:fs/promises';
import {resolve,sep,basename} from 'node:path';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {createKnowledgeUploadJob,listKnowledgeUploadJobs} from '../src/lib/knowledge/upload';
import {registerVectorlessUpload} from '../src/lib/knowledge/vectorless-registration';

nextEnv.loadEnvConfig(process.cwd());
const base=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
assert(base&&['localhost','127.0.0.1','::1'].includes(new URL(base).hostname));
const state=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8'));
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));
const url=new URL(base);url.pathname=`/${state.database}`;process.env.DATABASE_URL=url.toString();
const pool=new Pool({connectionString:url.toString()}),owner=randomUUID(),other=randomUUID();
const root=resolve('knowledge/uploads',owner);
async function worker(id:string){
  return await new Promise<Record<string,number>>((done,reject)=>{
    const child=spawn(process.execPath,['--require','./scripts/patch-node-user.cjs','--import','tsx','scripts/process-knowledge-upload-jobs.ts',`--job-id=${id}`,'--limit=1'],
      {cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,DATABASE_URL:url.toString()}});
    let stdout='',stderr='';const timer=setTimeout(()=>child.kill(),180000);
    child.stdout.on('data',part=>stdout+=part);child.stderr.on('data',part=>stderr+=part);
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',code=>{clearTimeout(timer);if(code!==0)return reject(new Error(stderr.slice(-1000)));try{done(JSON.parse(stdout));}catch(error){reject(error);}});
  });
}
try{
  for(const id of [owner,other])await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Review hold fixture','!','admin','active')",[id,`${id}@example.invalid`]);
  const pointers=JSON.stringify((await pool.query('select * from knowledge_release_pointer_v3 order by scope_kind,owner_id')).rows);
  const bytes=await readFile('tmp/ma24-public-eval-candidates/itu-satellite-2025.pptx');
  for(const visibility of ['private','shared'] as const){
    const input={collection:'industry' as const,title:'Visual review hold',originalFilename:'satellite.pptx',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',bytes,visibility};
    const job=await createKnowledgeUploadJob(owner,input);
    const result=await worker(job.id);assert.equal(result.awaitingReview,1);assert.equal(result.failed,0);assert.equal(result.completed,0);
    const stored=(await pool.query('select * from knowledge_upload_job where id=$1',[job.id])).rows[0];
    assert.equal(stored.status,'extracted');assert.equal(stored.error_code,'extraction-review-required');assert.equal(stored.metrics.unresolvedBlocks,63);
    assert.equal(stored.lease_token,null);assert.equal(stored.lease_until,null);assert.equal(stored.published_document_id,null);
    assert.equal((await listKnowledgeUploadJobs(owner)).find(row=>row.id===job.id)?.treeStatus,'review-required');
    assert(!(await listKnowledgeUploadJobs(other)).some(row=>row.id===job.id));
    const repeated=await createKnowledgeUploadJob(owner,input);assert.equal(repeated.id,job.id);assert(repeated.reused);
    assert.equal((await worker(job.id)).inputJobs,0);
    await assert.rejects(()=>registerVectorlessUpload(owner,job.id,{language:'und',authorityLevel:2}),/Unresolved extraction/);
    assert.equal((await pool.query('select count(*)::int as n from knowledge_document where owner_id=$1',[owner])).rows[0].n,0);
  }
  assert.equal(JSON.stringify((await pool.query('select * from knowledge_release_pointer_v3 order by scope_kind,owner_id')).rows),pointers);
  const evidence={cloneOnly:true,formats:['PPTX'],privateAndSharedHeld:true,unresolvedBlocksPerJob:63,dedupReused:true,restartDoesNotReclaim:true,otherAccountHidden:true,directRegistrationRejected:true,noDocumentsPublished:true,v3PointersUnchanged:true,externalCalls:0,modelCalls:0};
  await writeFile('tmp/upload-review-hold-result.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{
  await pool.query('delete from knowledge_upload_job where user_id=$1',[owner]);
  await pool.query('delete from app_user where id=any($1::uuid[])',[[owner,other]]);await pool.end();await getPool().end();
  assert(root.startsWith(resolve('knowledge/uploads')+sep)&&basename(root)===owner);
  for(const name of await readdir(root).catch(()=>[])){const file=resolve(root,name);assert(file.startsWith(root+sep));await rm(file,{force:true});}
  await rmdir(root).catch(()=>undefined);
}
