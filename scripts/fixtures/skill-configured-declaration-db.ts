import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {readFile,writeFile,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {spawn} from 'node:child_process';
import {build} from 'esbuild';
import type {Pool} from 'pg';
import {loadConfiguredSkillRunnerTrustRegistry} from '../../src/lib/assistant/main/skill-runner-attestation';
import {readSkillRunnerAttestation} from '../../src/lib/assistant/main/skill-runner-attestation-store';

/** Actual plain compiled CLI + separate restricted login, ephemeral test keys.
 * No provider/model call and no production identity or source promotion. */
export async function verifyConfiguredDeclarationDatabase(pool:Pool,input:{owner:string;other:string;bundleId:string;syntheticBundle:string;directory:string}){
 const registryPath=process.env.SKILL_RUNNER_TRUST_REGISTRY_FILE!,originalText=await readFile(registryPath,'utf8');
 const registry=await loadConfiguredSkillRunnerTrustRegistry(),pair=generateKeyPairSync('ed25519'),keyId=randomUUID();
 const enrolled:typeof registry.keys[number]={...registry.keys[0],keyId,enabled:true,purposes:['runner-declaration'],
  publicKeyPem:pair.publicKey.export({type:'spki',format:'pem'}).toString()};
 const configuredRegistry={...registry,keys:[...registry.keys,enrolled]};
 const keyPath=join(input.directory,'configured-declaration.pem'),wrongPath=join(input.directory,'wrong-declaration.pem'),jobPath=join(input.directory,'declaration-job.json');
 const compiled=resolve('tmp',`skill-declaration-${randomUUID()}.cjs`);
 assert(compiled.startsWith(resolve('tmp')+sep));
 const appUrl=new URL(process.env.DATABASE_URL!),collectorUrl=new URL(appUrl),password=randomUUID()+randomUUID();
 const login=await pool.connect();try{
  await login.query("select set_config('ma24_declaration.password',$1,false)",[password]);
  await login.query(`do $$ begin execute format('create role ma24_declaration_fixture_login login noinherit nosuperuser nocreatedb nocreaterole nobypassrls noreplication password %L',current_setting('ma24_declaration.password')); end $$`);
  await login.query('grant network_copilot_skill_collector to ma24_declaration_fixture_login');
 }finally{login.release();}
 collectorUrl.username='ma24_declaration_fixture_login';collectorUrl.password=password;
 const count=async()=>Number((await pool.query('select count(*) n from agent_skill_runner_attestation where owner_id=$1 and bundle_id=$2',[input.owner,input.bundleId])).rows[0].n);
 const run=async(job:unknown,extra:Partial<NodeJS.ProcessEnv>={})=>{
  await writeFile(jobPath,JSON.stringify(job));
  return new Promise<{code:number|null;output:string}>((accept,reject)=>{
   const child=spawn(process.execPath,[compiled,'--attest',jobPath],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,
    NODE_ENV:'production',NODE_OPTIONS:'',NODE_PATH:'',SKILL_COLLECTOR_DATABASE_URL:collectorUrl.toString(),
    SKILL_RUNNER_DECLARATION_KEY_ID:keyId,SKILL_RUNNER_DECLARATION_PRIVATE_KEY_FILE:keyPath,...extra}});
   let output='';child.stdout.on('data',data=>{output+=String(data);});child.stderr.on('data',()=>{});
   child.once('error',reject);child.once('exit',code=>accept({code,output}));
  });
 };
 try{
  await writeFile(registryPath,JSON.stringify(configuredRegistry));
  await writeFile(keyPath,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
  await writeFile(wrongPath,generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
  await build({entryPoints:['scripts/skill-collector-runner.ts'],outfile:compiled,bundle:true,platform:'node',target:'node24',format:'cjs',packages:'external',logLevel:'warning'});
  const job={ownerId:input.owner,bundleId:input.bundleId},before=await count(),first=await run(job);
  assert.equal(first.code,0,'Configured declaration CLI failed');
  const saved=JSON.parse(first.output.trim());assert.equal(saved.collectorDeclaration,'completed');assert.equal(saved.reused,false);
  assert.equal(saved.productionQualified,false);assert.equal(saved.automaticActivation,false);assert.equal(await count(),before+1);
  assert.equal((await readSkillRunnerAttestation({userId:input.owner},saved.declarationId)).signedDeclarationVerified,true);
  const retry=await run(job);assert.equal(retry.code,0);const reused=JSON.parse(retry.output.trim());
  assert.equal(reused.reused,true);assert.equal(reused.declarationId,saved.declarationId);assert.equal(await count(),before+1);
  const denied=async(value:unknown=job,extra:Partial<NodeJS.ProcessEnv>={})=>{
   const result=await run(value,extra);assert.equal(result.code,1);assert.equal(result.output.trim(),'');assert.equal(await count(),before+1);
  };
  await denied({...job,ownerId:input.other});await denied({...job,bundleId:input.syntheticBundle});
  await denied({...job,deploymentHash:'caller-selected'});
  await denied(job,{SKILL_COLLECTOR_DATABASE_URL:appUrl.toString()});
  await denied(job,{SKILL_RUNNER_DECLARATION_PRIVATE_KEY_FILE:wrongPath});
  await denied(job,{SKILL_RUNNER_DECLARATION_KEY_ID:'missing-key'});
  await denied(job,{NODE_OPTIONS:'--no-warnings'});
  enrolled.enabled=false;await writeFile(registryPath,JSON.stringify(configuredRegistry));await denied();
  enrolled.enabled=true;enrolled.purposes=['model-transport'];await writeFile(registryPath,JSON.stringify(configuredRegistry));await denied();
  return {configuredDeclarationCliDatabaseVerified:true,configuredDeclarationRetryReusesStatement:true,
   configuredDeclarationCrossAccountAndSyntheticRejected:true,configuredDeclarationCallerBindingRejected:true,
   configuredDeclarationAppLoginRejected:true,configuredDeclarationWrongKeyPurposeRevocationAndNodeOptionsRejected:true};
 }finally{await writeFile(registryPath,originalText);await rm(compiled,{force:true});}
}
