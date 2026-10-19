import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {publishSkillRunnerTrustRegistry} from './lib/skill-trust-registry-publication';
import {digest} from '../src/lib/assistant/main/contracts';
import {skillRunnerTrustRegistrySchema} from '../src/lib/assistant/main/skill-runner-trust-registry-schema';

nextEnv.loadEnvConfig(process.cwd());
const configured=process.env.DATABASE_MIGRATION_URL;assert(configured);
const url=new URL(configured);assert(['127.0.0.1','localhost','::1'].includes(url.hostname));
const database=`ma24_registry_publish_${randomUUID().replaceAll('-','')}`;assert(/^ma24_registry_publish_[a-f0-9]{32}$/.test(database));
const admin=new Pool({connectionString:url.toString()});let pool:Pool|undefined,created=false;
const path=resolve('tmp',`${database}.json`),pair=generateKeyPairSync('ed25519');
const registry={protocol:'skill-runner-trust-registry-v1',keys:[{keyId:'synthetic',collectorId:'synthetic',deploymentHash:'1'.repeat(64),
 publicKeyPem:pair.publicKey.export({type:'spki',format:'pem'}).toString(),enabled:true,notBefore:'2026-01-01T00:00:00.000Z',expiresAt:'2027-01-01T00:00:00.000Z'}]};
const results:string[]=[];
try{
 await admin.query(`create database "${database}"`);created=true;url.pathname=`/${database}`;pool=new Pool({connectionString:url.toString()});
 await pool.query(await readFile('db/migrations/157_skill_runner_trust_registry.sql','utf8'));
 const first=await pool.connect(),second=await pool.connect();let pending:Promise<{error?:unknown}>|undefined;
 try{
  await assert.rejects(publishSkillRunnerTrustRegistry(first,registry,'none'),/stable caller transaction/);
  await first.query('begin');const initial=await publishSkillRunnerTrustRegistry(first,registry,'none');
  assert.equal(initial.revision,'1');assert.equal(initial.registryHash,digest(skillRunnerTrustRegistrySchema.parse(registry)));
  await second.query('begin');
  const firstPid=(await first.query('select pg_backend_pid() pid')).rows[0].pid,secondPid=(await second.query('select pg_backend_pid() pid')).rows[0].pid;
  pending=publishSkillRunnerTrustRegistry(second,registry,'none').then(()=>({}),error=>({error}));
  let blocked=false;
  for(let n=0;n<80;n++){
   blocked=(await pool.query('select $1::int=any(pg_blocking_pids($2)) blocked',[firstPid,secondPid])).rows[0].blocked;
   if(blocked)break;await new Promise(done=>setTimeout(done,25));
  }
  assert(blocked);await first.query('commit');
  assert.match(String((await pending).error),/revision changed/);pending=undefined;await second.query('rollback');
  results.push('concurrent stale publisher waits then rejects; initial publication normalizes default purposes');
  for(const invalid of [
   {...registry,keys:[{...registry.keys[0],expiresAt:registry.keys[0].notBefore}]},
   {...registry,keys:[{...registry.keys[0],publicKeyPem:generateKeyPairSync('rsa',{modulusLength:2048}).publicKey.export({type:'spki',format:'pem'}).toString()}]},
  ]){await first.query('begin');await assert.rejects(publishSkillRunnerTrustRegistry(first,invalid,'1'));await first.query('rollback');}
  await first.query('begin');await first.query('set local role network_copilot_app');
  await assert.rejects(publishSkillRunnerTrustRegistry(first,registry,'1'),/permission denied/);await first.query('rollback');
  assert.equal((await pool.query('select count(*)::int n from skill_runner_trust_registry_version')).rows[0].n,1);
  results.push('autocommit, invalid key windows, non-Ed25519 public keys and application publication reject without new versions');
 }finally{await first.query('rollback');await second.query('rollback');if(pending)await pending;first.release();second.release();}
 const revoked={...registry,keys:registry.keys.map(key=>({...key,enabled:false}))};await writeFile(path,JSON.stringify(revoked));
 const invoke=async(expected:string)=>new Promise<{code:number|null;output:string}>((accept,reject)=>{
  const child=spawn(process.execPath,['scripts/run-tsx.cjs','scripts/publish-skill-trust-registry.ts',`--registry=${path}`,`--expected-revision=${expected}`],
   {windowsHide:true,env:{...process.env,DATABASE_MIGRATION_URL:url.toString()},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',data=>{output+=String(data);});child.stderr.on('data',()=>{});
  child.once('error',reject);child.once('exit',code=>accept({code,output}));
 });
 const result=await invoke('1');assert.equal(result.code,0);const receipt=JSON.parse(result.output.trim());assert.equal(receipt.revision,'2');assert.equal(receipt.previousRevision,'1');
 assert.equal(receipt.registryHash,digest(skillRunnerTrustRegistrySchema.parse(revoked)));
 assert.equal((await invoke('1')).code,1);assert.equal((await pool.query('select count(*)::int n from skill_runner_trust_registry_version')).rows[0].n,2);
 results.push('actual CLI publishes disabled-key version and rejects a repeated stale expected revision');
}finally{
 await unlink(path).catch(error=>{if(error.code!=='ENOENT')throw error;});
 if(pool)await pool.end();if(created)await admin.query(`drop database "${database}"`);await admin.end();
}
const receipt={passed:true,results,disposableDatabaseRemoved:true,publicFixtureRemoved:true,businessDatabaseModified:false,realModelCalls:0,productionQualified:false,automaticActivation:false};
await writeFile('tmp/ma24-trust-registry-publication-result.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
