import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Pool,type PoolClient} from 'pg';
import {digest} from '../src/lib/assistant/main/contracts';
import {readLockedSkillRunnerTrustRegistry,readLockedCollectorSkillRunnerTrustRegistry} from '../src/lib/assistant/main/skill-runner-trust-registry-store';
import {withBoundTenantTransaction} from '../src/lib/rag/db';
import {loadConfiguredSkillRunnerTrustRegistry} from '../src/lib/assistant/main/skill-runner-attestation';

nextEnv.loadEnvConfig(process.cwd());
const configured=process.env.DATABASE_MIGRATION_URL;assert(configured,'Migration principal required for disposable database');
const url=new URL(configured);assert(['localhost','127.0.0.1','::1'].includes(url.hostname));
const admin=new Pool({connectionString:url.toString()}),database=`ma24_registry_${randomUUID().replaceAll('-','')}`;
assert(/^ma24_registry_[a-f0-9]{32}$/.test(database));
let pool:Pool|undefined,created=false;
const pair=generateKeyPairSync('ed25519');
const actor=randomUUID(),registry={protocol:'skill-runner-trust-registry-v1',keys:[{
 keyId:'synthetic-enrollment',collectorId:'synthetic-collector',deploymentHash:'1'.repeat(64),
 publicKeyPem:pair.publicKey.export({type:'spki',format:'pem'}).toString(),enabled:true,
 notBefore:'2026-01-01T00:00:00.000Z',expiresAt:'2027-01-01T00:00:00.000Z',purposes:['runner-declaration'],
}]};
const revoked={...registry,keys:registry.keys.map(key=>({...key,enabled:false}))};
const bind=async(client:PoolClient,isolation='read committed')=>{
 assert(['read committed','repeatable read'].includes(isolation));
 await client.query(`begin isolation level ${isolation}`);await client.query('set local role network_copilot_app');
 await client.query("select set_config('app.current_user_id',$1,true),set_config('app.current_user_role','member',true)",[actor]);
};
const results:string[]=[];
const priorMode=process.env.SKILL_RUNNER_TRUST_REGISTRY_MODE;
process.env.SKILL_RUNNER_TRUST_REGISTRY_MODE='database';
const configuredRead=(client:PoolClient)=>withBoundTenantTransaction(client,actor,()=>loadConfiguredSkillRunnerTrustRegistry(actor));
try{
 await admin.query(`create database "${database}"`);created=true;url.pathname=`/${database}`;pool=new Pool({connectionString:url.toString()});
 await pool.query(await readFile('db/migrations/157_skill_runner_trust_registry.sql','utf8'));
 const reader=await pool.connect(),writer=await pool.connect();
 let pending:Promise<unknown>|undefined;
 try{
  await assert.rejects(readLockedSkillRunnerTrustRegistry(reader,actor),/account or role invalid/);
  await bind(reader);await assert.rejects(readLockedSkillRunnerTrustRegistry(reader,randomUUID()),/account or role invalid/);await reader.query('rollback');
  await bind(reader);await assert.rejects(readLockedSkillRunnerTrustRegistry(reader,actor),/not enrolled/);await reader.query('rollback');
  results.push('unbound, cross-account and unenrolled reads reject');
  await pool.query('select publish_skill_runner_trust_registry($1,$2)',[registry,digest(registry)]);
  await pool.query(await readFile('db/migrations/157_skill_runner_trust_registry.sql','utf8'));
  await bind(reader);const first=await readLockedSkillRunnerTrustRegistry(reader,actor);assert.equal(first.revision,'1');assert.equal(first.registryHash,digest(registry));
  assert.deepEqual(await configuredRead(reader),first.registry);
  const rpid=(await reader.query('select pg_backend_pid() pid')).rows[0].pid,wPid=(await writer.query('select pg_backend_pid() pid')).rows[0].pid;
  pending=writer.query('select publish_skill_runner_trust_registry($1,$2)',[revoked,digest(revoked)]);
  let blocked=false;
  for(let n=0;n<80;n++){
   blocked=(await pool.query('select $1::int=any(pg_blocking_pids($2)) blocked',[rpid,wPid])).rows[0].blocked;
   if(blocked)break;await new Promise(done=>setTimeout(done,25));
  }
  assert(blocked,'Publication must wait for exact reader transaction');
  const retained=await readLockedSkillRunnerTrustRegistry(reader,actor);
  assert.equal(retained.revision,first.revision);assert.equal(retained.registry.keys[0].enabled,true);
  await reader.query('commit');await pending;pending=undefined;
  await bind(reader);const latest=await readLockedSkillRunnerTrustRegistry(reader,actor);
  assert.equal(latest.revision,'2');assert.equal(latest.registry.keys[0].enabled,false);await reader.query('rollback');
  results.push('key disablement blocked by exact reader PID, stable enabled revision until commit, next transaction sees disabled key');
  // Reverse ordering: reject instead of queuing behind publication while a
  // standalone caller may already hold product source locks.
  await writer.query('begin');await writer.query('select publish_skill_runner_trust_registry($1,$2)',[registry,digest(registry)]);
  await bind(reader);await assert.rejects(readLockedSkillRunnerTrustRegistry(reader,actor),/publication in progress/);
  await reader.query('rollback');await writer.query('commit');await bind(reader);
  const afterWait=await readLockedSkillRunnerTrustRegistry(reader,actor);
  assert.equal(afterWait.revision,'3');assert.equal(afterWait.registry.keys[0].enabled,true);await reader.query('rollback');
  results.push('reader rejects active publication without queuing and sees new committed version on whole-transaction retry');
  await bind(reader);assert.equal((await configuredRead(reader)).keys[0].enabled,true);await reader.query('rollback');
  for(const role of ['network_copilot_app','network_copilot_skill_collector']){
   await writer.query('begin');await writer.query(`set local role ${role}`);
   await assert.rejects(writer.query('select publish_skill_runner_trust_registry($1,$2)',[registry,digest(registry)]),/permission denied/);await writer.query('rollback');
   await writer.query('begin');await writer.query(`set local role ${role}`);
   await assert.rejects(writer.query('delete from skill_runner_trust_registry_current'),/permission denied/);await writer.query('rollback');
  }
  results.push('application and collector cannot publish or mutate pointer');
  await assert.rejects(writer.query('update skill_runner_trust_registry_version set registry_hash=repeat(\'0\',64)'),/immutable/);
  await assert.rejects(writer.query('truncate skill_runner_trust_registry_version cascade'),/immutable/);
  await bind(reader,'repeatable read');await assert.rejects(readLockedSkillRunnerTrustRegistry(reader,actor),/read committed/);await reader.query('rollback');
  await pool.query('select publish_skill_runner_trust_registry($1,$2)',[registry,'0'.repeat(64)]);
  await bind(reader);await assert.rejects(readLockedSkillRunnerTrustRegistry(reader,actor),/digest changed/);await reader.query('rollback');
  await bind(reader);await assert.rejects(configuredRead(reader),/digest changed/);await reader.query('rollback');
  await pool.query('select publish_skill_runner_trust_registry($1,$2)',[registry,digest(registry)]);
  await bind(reader);await assert.rejects(readLockedCollectorSkillRunnerTrustRegistry(reader,actor),/account or role invalid/);await reader.query('rollback');
  await reader.query('begin');await reader.query('set local role network_copilot_skill_collector');
  await reader.query("select set_config('app.current_user_id',$1,true)",[actor]);
  await assert.rejects(readLockedCollectorSkillRunnerTrustRegistry(reader,randomUUID()),/account or role invalid/);
  assert.deepEqual(await loadConfiguredSkillRunnerTrustRegistry(actor,reader),registry);
  await reader.query('rollback');
  await reader.query('set role network_copilot_skill_collector');
  try{
   await reader.query("select set_config('app.current_user_id',$1,false)",[actor]);
   await assert.rejects(readLockedCollectorSkillRunnerTrustRegistry(reader,actor),/transaction changed/);
  }finally{await reader.query('reset role');await reader.query("select set_config('app.current_user_id','',false)");}
  results.push('collector client configuration reuses exact owned transaction and rejects app role, cross-account and autocommit');
  await pool.query('select publish_skill_runner_trust_registry($1,$2)',[{...registry,extra:true},digest({...registry,extra:true})]);
  await bind(reader);await assert.rejects(readLockedSkillRunnerTrustRegistry(reader,actor));await reader.query('rollback');
  results.push('immutable versions, stale snapshot isolation, corrupt digest and non-strict schema reject');
  results.push('configured database reader reuses bound client and rejects corrupt digest without file fallback');
 }finally{await writer.query('rollback');await reader.query('rollback');if(pending)await pending;reader.release();writer.release();}
}finally{
 if(pool)await pool.end();
 if(created)await admin.query(`drop database "${database}"`);
 await admin.end();
 if(priorMode===undefined)delete process.env.SKILL_RUNNER_TRUST_REGISTRY_MODE;else process.env.SKILL_RUNNER_TRUST_REGISTRY_MODE=priorMode;
}
const receipt={passed:true,results,disposableDatabaseRemoved:true,migrationAppliedToBusinessDatabase:false,configuredDatabaseReaderVerified:true,fullReadinessVerified:false,modelCalls:0,productionQualified:false,automaticActivation:false};
await writeFile('tmp/ma24-trust-registry-database-result.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
