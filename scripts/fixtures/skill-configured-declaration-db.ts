import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {readFile,writeFile,rm} from 'node:fs/promises';
import {basename,join,resolve,sep} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import type {Pool} from 'pg';
import {loadConfiguredSkillRunnerTrustRegistry} from '../../src/lib/assistant/main/skill-runner-attestation';
import {readSkillRunnerAttestation,appendSkillRunnerAttestation} from '../../src/lib/assistant/main/skill-runner-attestation-store';
import {digest} from '../../src/lib/assistant/main/contracts';

/** Actual native compiled CLI or measured Linux image + restricted login and test keys.
 * No provider/model call and no production identity or source promotion. */
export async function verifyConfiguredDeclarationDatabase(pool:Pool,input:{owner:string;other:string;bundleId:string;syntheticBundle:string;directory:string}){
 const registryPath=process.env.SKILL_RUNNER_TRUST_REGISTRY_FILE!,originalText=await readFile(registryPath,'utf8');
 const registry=await loadConfiguredSkillRunnerTrustRegistry(),pair=generateKeyPairSync('ed25519'),keyId=randomUUID();
 const databaseTrust=process.env.MA24_DECLARATION_DATABASE_TRUST==='1',priorMode=process.env.SKILL_RUNNER_TRUST_REGISTRY_MODE;
 const originalDeployment=process.env.SKILL_RUNNER_DEPLOYMENT_SHA256;
 const image=process.env.MA24_DECLARATION_TEST_IMAGE,container=process.env.MA24_DECLARATION_TEST_CONTAINER;
 let measuredDeployment:string|undefined,imageId:string|undefined;
 if(image){
  assert(/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/.test(image));assert(container&&/^[a-f0-9]{64}$/.test(container));
  const config=JSON.parse(execFileSync('docker',['image','inspect',image],{encoding:'utf8'}))[0];
  assert.equal(config.Config.User,'node');assert.deepEqual(config.Config.Entrypoint,['node','/app/start.mjs']);
  imageId=config.Id;assert.match(imageId!,/^sha256:[a-f0-9]{64}$/);
  const measured=JSON.parse(execFileSync('docker',['run','--rm','--read-only','--network','none','--cap-drop=ALL','--security-opt=no-new-privileges',imageId!,'--verify'],{encoding:'utf8'}).trim());
  assert.equal(measured.collectorPackageIntegrity,'passed');assert.match(measured.deploymentHash,/^[a-f0-9]{64}$/);measuredDeployment=measured.deploymentHash;
  assert(resolve(registryPath).startsWith(resolve(input.directory)+sep));
  const certificate=execFileSync('docker',['exec',container,'cat','/tmp/ma24-server.crt'],{encoding:'utf8'});
  await writeFile(join(input.directory,'declaration-db-ca.pem'),certificate);
 }
 const enrolled:typeof registry.keys[number]={...registry.keys[0],keyId,enabled:true,purposes:['runner-declaration'],
  ...(measuredDeployment?{deploymentHash:measuredDeployment}:{}),
  publicKeyPem:pair.publicKey.export({type:'spki',format:'pem'}).toString()};
 const configuredRegistry={...registry,keys:[...registry.keys,enrolled]};
 const persist=async()=>{
  await writeFile(registryPath,JSON.stringify(configuredRegistry));
  if(databaseTrust)await pool.query('select publish_skill_runner_trust_registry($1,$2)',[configuredRegistry,digest(configuredRegistry)]);
 };
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
  let command=process.execPath,args=[compiled,'--attest',jobPath];
  const env:NodeJS.ProcessEnv={...process.env,NODE_ENV:'production',NODE_OPTIONS:'',NODE_PATH:'',SKILL_COLLECTOR_DATABASE_URL:collectorUrl.toString(),
   SKILL_RUNNER_DECLARATION_KEY_ID:keyId,SKILL_RUNNER_DECLARATION_PRIVATE_KEY_FILE:keyPath,...extra};
  if(imageId){
   const imageApp=new URL(appUrl),imageCollector=new URL(collectorUrl);
   for(const url of [imageApp,imageCollector]){url.hostname='localhost';url.port='5432';url.searchParams.set('sslmode','verify-full');}
   const imageEnv:Partial<NodeJS.ProcessEnv>={NODE_ENV:'production',NODE_OPTIONS:'',NODE_PATH:'',DATABASE_URL:imageApp.toString(),
    SKILL_COLLECTOR_DATABASE_URL:imageCollector.toString(),DATABASE_SSL_CA_FILE:'/probe/declaration-db-ca.pem',
    SKILL_RUNNER_TRUST_REGISTRY_FILE:`/probe/${basename(registryPath)}`,SKILL_RUNNER_TRUST_REGISTRY_MODE:databaseTrust?'database':'file',SKILL_RUNNER_COLLECTOR_ID:enrolled.collectorId,
    SKILL_RUNNER_DEPLOYMENT_SHA256:measuredDeployment,SKILL_RUNNER_DECLARATION_KEY_ID:keyId,
    SKILL_RUNNER_DECLARATION_PRIVATE_KEY_FILE:'/probe/configured-declaration.pem',...extra};
   if(extra.SKILL_RUNNER_DECLARATION_PRIVATE_KEY_FILE===wrongPath)imageEnv.SKILL_RUNNER_DECLARATION_PRIVATE_KEY_FILE='/probe/wrong-declaration.pem';
   if(extra.SKILL_COLLECTOR_DATABASE_URL===appUrl.toString())imageEnv.SKILL_COLLECTOR_DATABASE_URL=imageApp.toString();
   const entries=Object.entries(imageEnv).filter((entry):entry is [string,string]=>typeof entry[1]==='string');
   assert(entries.every(([key,value])=>/^[A-Z][A-Z0-9_]*$/.test(key)&&!/[\r\n\0]/.test(value)));
   const envFile=join(input.directory,'declaration-image.env');
   await writeFile(envFile,entries.map(([key,value])=>`${key}=${value}`).join('\n')+'\n',{mode:0o600});
   command='docker';args=['run','--rm','--read-only','--network',`container:${container}`,'--cap-drop=ALL','--security-opt=no-new-privileges',
    '--mount',`type=bind,source=${input.directory},target=/probe,readonly`,'--env-file',envFile,imageId,'--attest','/probe/declaration-job.json'];
  }
  return new Promise<{code:number|null;output:string}>((accept,reject)=>{
   const child=spawn(command,args,{windowsHide:true,stdio:['ignore','pipe','pipe'],env});
   let output='';child.stdout.on('data',data=>{output+=String(data);});child.stderr.on('data',()=>{});
   child.once('error',()=>reject(new Error('Declaration fixture process failed to start')));child.once('exit',code=>accept({code,output}));
  });
 };
 try{
  if(databaseTrust){
   await pool.query(await readFile('db/migrations/157_skill_runner_trust_registry.sql','utf8'));
   process.env.SKILL_RUNNER_TRUST_REGISTRY_MODE='database';
  }
  if(measuredDeployment)process.env.SKILL_RUNNER_DEPLOYMENT_SHA256=measuredDeployment;
  await persist();
  await writeFile(keyPath,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
  await writeFile(wrongPath,generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
  if(!imageId)await build({entryPoints:['scripts/skill-collector-runner.ts'],outfile:compiled,bundle:true,platform:'node',target:'node24',format:'cjs',packages:'external',logLevel:'warning'});
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
  if(imageId){await denied(job,{DATABASE_SSL_CA_FILE:''});await denied(job,{SKILL_RUNNER_DEPLOYMENT_SHA256:'0'.repeat(64)});}
  await denied({...job,ownerId:input.other});await denied({...job,bundleId:input.syntheticBundle});
  await denied({...job,deploymentHash:'caller-selected'});
  await denied(job,{SKILL_COLLECTOR_DATABASE_URL:appUrl.toString()});
  await denied(job,{SKILL_RUNNER_DECLARATION_PRIVATE_KEY_FILE:wrongPath});
  await denied(job,{SKILL_RUNNER_DECLARATION_KEY_ID:'missing-key'});
  await denied(job,{NODE_OPTIONS:'--no-warnings'});
  if(databaseTrust){
   const row=(await pool.query<{envelope:unknown}>('select envelope from agent_skill_runner_attestation where id=$1',[saved.declarationId])).rows[0];
   const writer=await pool.connect();let publication:Promise<{error?:unknown}>|undefined;
   try{
    await appendSkillRunnerAttestation({userId:input.owner},{bundleId:input.bundleId,envelope:row.envelope},async(owner,work)=>{
     const reader=await pool.connect();try{
      await reader.query('begin');await reader.query('set local role network_copilot_skill_collector');
      await reader.query("select set_config('app.current_user_id',$1,true)",[owner]);
      const result=await work(reader);
      const readerPid=(await reader.query('select pg_backend_pid() pid')).rows[0].pid,writerPid=(await writer.query('select pg_backend_pid() pid')).rows[0].pid;
      const disabled={...configuredRegistry,keys:configuredRegistry.keys.map(key=>({...key,enabled:false}))};
      publication=writer.query('select publish_skill_runner_trust_registry($1,$2)',[disabled,digest(disabled)]).then(()=>({}),error=>({error}));
      let blocked=false;for(let n=0;n<80;n++){
       blocked=(await pool.query('select $1::int=any(pg_blocking_pids($2)) blocked',[readerPid,writerPid])).rows[0].blocked;
       if(blocked)break;await new Promise(done=>setTimeout(done,25));
      }
      assert(blocked,'Registry disablement must wait for exact collector transaction after append returns');
      await reader.query('commit');return result;
     }catch(error){await reader.query('rollback');throw error;}finally{reader.release();}
    });
    assert(publication);assert.equal((await publication).error,undefined);
    // File enrollment deliberately remains enabled: database mode must not fall back.
    await denied();await assert.rejects(readSkillRunnerAttestation({userId:input.owner},saved.declarationId),/unavailable/);
    await persist();
   }finally{if(publication)await publication;writer.release();}
  }
  enrolled.enabled=false;await persist();await denied();
  enrolled.enabled=true;enrolled.purposes=['model-transport'];await persist();await denied();
  return {configuredDeclarationCliDatabaseVerified:true,configuredDeclarationLinuxImageVerified:!!imageId,
   ...(imageId?{declarationImageId:imageId,declarationMeasuredDeploymentHash:measuredDeployment,declarationMissingTlsRootAndMismatchedDeploymentRejected:true}:{}),
   configuredDeclarationRetryReusesStatement:true,configuredDeclarationDatabaseTrustVerified:databaseTrust,
   configuredDeclarationRegistryDisablementWaitsForCollectorCommit:databaseTrust,
   configuredDeclarationCrossAccountAndSyntheticRejected:true,configuredDeclarationCallerBindingRejected:true,
   configuredDeclarationAppLoginRejected:true,configuredDeclarationWrongKeyPurposeRevocationAndNodeOptionsRejected:true};
 }finally{
  if(priorMode===undefined)delete process.env.SKILL_RUNNER_TRUST_REGISTRY_MODE;else process.env.SKILL_RUNNER_TRUST_REGISTRY_MODE=priorMode;
  if(originalDeployment===undefined)delete process.env.SKILL_RUNNER_DEPLOYMENT_SHA256;else process.env.SKILL_RUNNER_DEPLOYMENT_SHA256=originalDeployment;
  await writeFile(registryPath,originalText);await rm(compiled,{force:true});
 }
}
