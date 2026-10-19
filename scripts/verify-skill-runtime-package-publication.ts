import assert from 'node:assert/strict';
import {randomUUID,randomBytes,generateKeyPairSync} from 'node:crypto';
import {createServer} from 'node:net';
import {readFile} from 'node:fs/promises';
import {execFileSync,spawn} from 'node:child_process';
import {Pool,type PoolClient} from 'pg';
import {inspectSkillRuntimePackage} from './lib/skill-runtime-package-inspection';
import {publishSkillRuntimePackage,withdrawSkillRuntimePackage} from './lib/skill-runtime-package-publication';
import {publishSkillRunnerTrustRegistry} from './lib/skill-trust-registry-publication';
import {readLockedSkillRuntimePackages} from '../src/lib/assistant/main/skill-runtime-package-store';
import {digest} from '../src/lib/assistant/main/contracts';
import {skillSigningEnrollmentSchema} from '../src/lib/assistant/main/skill-signing-enrollment';

const options=new Map<string,string>();
for(const arg of process.argv.slice(2)){const match=/^--(image-id|purpose)=(.+)$/.exec(arg);assert(match&&!options.has(match[1]),'Expected unique --image-id and optional --purpose');options.set(match[1],match[2]);}
const imageId=options.get('image-id')??'';assert(/^sha256:[a-f0-9]{64}$/.test(imageId));
const purpose=skillSigningEnrollmentSchema.shape.purpose.parse(options.get('purpose')??'task-model-transport');
const role=purpose==='task-model-transport'?'main-agent':'skill-collector';
const name=`ma24-package-publication-${randomUUID()}`,password=randomBytes(24).toString('hex'),actor=randomUUID();
const docker=(args:string[])=>execFileSync('docker',args,{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
const port=await new Promise<number>((resolve,reject)=>{const server=createServer();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{
 const address=server.address();assert(address&&typeof address!=='string');server.close(error=>error?reject(error):resolve(address.port));});});
const databaseUrl=`postgresql://postgres:${password}@127.0.0.1:${port}/postgres`;
const pool=new Pool({connectionString:databaseUrl,max:8,connectionTimeoutMillis:1000});
const priorMode=process.env.SKILL_RUNNER_TRUST_REGISTRY_MODE;
const priorApplicationRole=process.env.DATABASE_APPLICATION_ROLE;
let started=false;
async function operator<T>(work:(client:PoolClient)=>Promise<T>){const client=await pool.connect();try{
 await client.query('begin isolation level read committed');await client.query("set local lock_timeout='8s'");const value=await work(client);await client.query('commit');return value;
}catch(error){await client.query('rollback').catch(()=>undefined);throw error;}finally{client.release();}}
const cli=(args:string[])=>new Promise<{code:number|null;output:string}>((resolve,reject)=>{
 const child=spawn(process.execPath,['scripts/run-tsx.cjs','scripts/publish-skill-runtime-package.ts',...args],{windowsHide:true,env:{...process.env,DATABASE_MIGRATION_URL:databaseUrl},stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',data=>{output+=data;});child.stderr.on('data',data=>{output+=data;});child.on('error',reject);child.on('close',code=>{
  if(output.includes(password)){reject(new Error('CLI exposed temporary database password'));return;}resolve({code,output});});
});
try{
 docker(['run','--detach','--name',name,'--publish',`127.0.0.1:${port}:5432`,'--env',`POSTGRES_PASSWORD=${password}`,'--tmpfs','/var/lib/postgresql/data:rw,noexec,nosuid,size=256m','pgvector/pgvector:pg16']);started=true;
 for(let tries=0;;tries++)try{await pool.query('select 1');break;}catch{assert(tries<40,'Disposable database unavailable');await new Promise(resolve=>setTimeout(resolve,250));}
 await pool.query('create role network_copilot_app;create role network_copilot_skill_collector;');
 await pool.query(await readFile('db/migrations/157_skill_runner_trust_registry.sql','utf8'));
 process.env.SKILL_RUNNER_TRUST_REGISTRY_MODE='database';process.env.DATABASE_APPLICATION_ROLE='network_copilot_app';
 console.log(JSON.stringify({phase:'actual-image-inspection',imageId,purpose}));
 const inspection=inspectSkillRuntimePackage(imageId,role);
 const publicKeyPem=generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'}).toString();
 const registry={protocol:'skill-runner-trust-registry-v1' as const,keys:[{keyId:'synthetic-package-key',collectorId:'synthetic-package',deploymentHash:inspection.deploymentHash,
  publicKeyPem,enabled:true,notBefore:'2026-01-01T00:00:00.000Z',expiresAt:new Date(Date.now()+3600_000).toISOString(),purposes:[purpose]}]};
 await operator(client=>publishSkillRunnerTrustRegistry(client,registry,'none'));let registryHash=digest(registry);
 const binding={keyId:registry.keys[0].keyId,collectorId:registry.keys[0].collectorId,deploymentHash:inspection.deploymentHash,purpose};
 const before=(await pool.query<{time:Date}>('select clock_timestamp() time')).rows[0].time.toISOString();
 let window={...binding,requiredFrom:before,requiredThrough:before};
 const beginRead=async()=>{const client=await pool.connect();await client.query('begin isolation level read committed');await client.query('set local role network_copilot_app');
  await client.query("select set_config('app.current_user_id',$1,true),set_config('app.current_user_role','member',true)",[actor]);return client;};
 const read=async(runtimeHash=inspection.runtimeHash)=>{const client=await beginRead();try{return await readLockedSkillRuntimePackages(client,actor,{registryHash,runtimeHash,windows:[window]});}
  finally{await client.query('rollback');client.release();}};
 assert.deepEqual((await read()).runtimePackageBlockers,['registration-schema-unavailable']);
 await pool.query(await readFile('db/migrations/159_skill_runtime_package_registration.sql','utf8'));
 assert.deepEqual((await read()).runtimePackageBlockers,['package-registration-missing']);
 const requestId=randomUUID(),validUntil=new Date(Date.now()+1800_000).toISOString();
 const spec={imageId,keyId:binding.keyId,purpose:binding.purpose,validUntil,requestId,expectedRevision:'none'};
 const argumentsFor=(value:typeof spec)=>['register',`--image-id=${value.imageId}`,`--key-id=${value.keyId}`,`--purpose=${value.purpose}`,`--valid-until=${value.validUntil}`,`--request-id=${value.requestId}`,`--expected-revision=${value.expectedRevision}`];
 console.log(JSON.stringify({phase:'actual-operator-cli-publication',purpose}));
 const published=await cli(argumentsFor(spec));assert.equal(published.code,0,published.output);
 const result=JSON.parse(published.output.trim().split(/\r?\n/).find(line=>line.startsWith('{"runtimePackageOperation"'))!);
 assert.equal(result.inspection.deploymentHash,inspection.deploymentHash);assert.equal(result.inspection.runtimeHash,inspection.runtimeHash);
 assert.equal(result.productionQualified,false);assert.equal(result.automaticActivation,false);const revision=result.revision as string;
 assert.deepEqual((await read()).runtimePackageBlockers,['package-registration-time-window'],'Later registration must not qualify earlier attempts');
 await pool.query('select pg_sleep(0.01)');const after=(await pool.query<{time:Date}>('select clock_timestamp() time')).rows[0].time.toISOString();
 window={...window,requiredFrom:after,requiredThrough:after};assert.equal((await read()).runtimePackagesRegistered,true);
 assert.deepEqual((await read(digest('different-source'))).runtimePackageBlockers,['runtime-package-source-mismatch']);
 console.log(JSON.stringify({phase:'idempotent-cli-retry',purpose}));
 const repeated=await cli(argumentsFor(spec));assert.equal(repeated.code,0,repeated.output);assert(repeated.output.includes('"idempotent":true'));
 assert.equal((await pool.query('select count(*)::int count from skill_runtime_package_registration')).rows[0].count,1);
 // Real DB crypto-identity rotation invalidates the old package record.
 const rotated={...registry,keys:[{...registry.keys[0],publicKeyPem:generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'}).toString()}]};
 await operator(client=>publishSkillRunnerTrustRegistry(client,rotated,'1'));registryHash=digest(rotated);
 assert.deepEqual((await read()).runtimePackageBlockers,['latest-package-signing-identity-mismatch']);
 await operator(client=>publishSkillRunnerTrustRegistry(client,registry,'2'));registryHash=digest(registry);assert.equal((await read()).runtimePackagesRegistered,true);
 // A caller-owned tenant transaction really retains admission beyond the read.
 const held=await beginRead();let heldReleased=false;
 try{
  assert.equal((await readLockedSkillRuntimePackages(held,actor,{registryHash,runtimeHash:inspection.runtimeHash,windows:[window]})).runtimePackagesRegistered,true);
  const withdrawal=operator(client=>withdrawSkillRuntimePackage(client,{requestId:randomUUID(),revision,reason:'isolated concurrent withdrawal'}));
  let waiting=false;for(let tries=0;tries<80;tries++){
   const count=(await pool.query("select count(*)::int count from pg_locks where locktype='advisory' and mode='ExclusiveLock' and not granted")).rows[0].count;
   if(count){waiting=true;break;}await new Promise(resolve=>setTimeout(resolve,25));
  }
  assert(waiting,'Operator did not wait for retained readiness admission');
  assert.equal((await pool.query('select count(*)::int count from skill_runtime_package_withdrawal')).rows[0].count,0);
  assert.deepEqual((await read()).runtimePackageBlockers,['package-publication-in-progress']);
  await held.query('commit');held.release();heldReleased=true;await withdrawal;
 }finally{if(!heldReleased){await held.query('rollback');held.release();}}
 assert.deepEqual((await read()).runtimePackageBlockers,['latest-package-registration-withdrawn']);
 // Explicit native fixtures exercise the reader at DB-time expiry. They reuse
 // the measured package, but do not claim to be a second CLI publication.
 const stored=(await pool.query('select registration from skill_runtime_package_registration where revision=$1',[revision])).rows[0].registration;
 const short={...stored,validUntil:new Date(Date.now()+1500).toISOString()};
 const shortRegistration=await operator(client=>client.query<{revision:string}>('select register_skill_runtime_package($1,$2,$3,$4)::text revision',[short,digest(short),randomUUID(),revision]));
 await pool.query('select pg_sleep(0.01)');const shortTime=(await pool.query<{time:Date}>('select clock_timestamp() time')).rows[0].time.toISOString();
 window={...window,requiredFrom:shortTime,requiredThrough:shortTime};assert.equal((await read()).runtimePackagesRegistered,true);
 await pool.query('select pg_sleep(1.6)');assert.deepEqual((await read()).runtimePackageBlockers,['package-registration-time-window']);
 const withdrawalRequest=randomUUID();
 const withdrawArgs=['withdraw',`--request-id=${withdrawalRequest}`,`--revision=${shortRegistration.rows[0].revision}`,'--reason=isolated CLI withdrawal'];
 const withdrawn=await cli(withdrawArgs);assert.equal(withdrawn.code,0,withdrawn.output);
 const withdrawalRetry=await cli(withdrawArgs);assert.equal(withdrawalRetry.code,0,withdrawalRetry.output);
 const withdrawalConflict=await cli([...withdrawArgs.slice(0,-1),'--reason=changed request content']);assert.notEqual(withdrawalConflict.code,0);
 assert.deepEqual((await read()).runtimePackageBlockers,['latest-package-registration-withdrawn']);
 const auto=await pool.connect();try{await assert.rejects(publishSkillRuntimePackage(auto,spec),/transaction changed/);}finally{auto.release();}
 const restricted=await beginRead();try{await assert.rejects(publishSkillRuntimePackage(restricted,spec),/operator read-committed/);}finally{await restricted.query('rollback');restricted.release();}
 console.log(JSON.stringify({runtimePackagePublication:'passed',purpose,inspection,schemas:[157,159],disposable:true,actualOperatorCli:true,idempotentCliRetry:true,
  actualWithdrawalCli:true,idempotentWithdrawalCli:true,changedWithdrawalRequestDenied:true,
  realReadinessPackageReader:true,missingSchemaAndRegistrationDenied:true,retroactiveRegistrationDenied:true,sourceMismatchDenied:true,publicKeyRotationDenied:true,
  withdrawalWaitedForOuterCommit:true,queuedPublicationDeniedNewReader:true,latestWithdrawalAndExpiryDenied:true,autocommitAndApplicationOperatorDenied:true,
  fullSchemaOrFiveCategoryComposition:false,providerIdentityVerified:false,productionQualified:false,automaticActivation:false,actualModelCalls:0}));
}catch(error){console.error(String(error instanceof Error?error.stack:error).replaceAll(password,'<temporary-password>'));process.exitCode=1;}
finally{
 await pool.end();if(started)docker(['rm','--force',name]);
 if(priorMode===undefined)delete process.env.SKILL_RUNNER_TRUST_REGISTRY_MODE;else process.env.SKILL_RUNNER_TRUST_REGISTRY_MODE=priorMode;
 if(priorApplicationRole===undefined)delete process.env.DATABASE_APPLICATION_ROLE;else process.env.DATABASE_APPLICATION_ROLE=priorApplicationRole;
}
