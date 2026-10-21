import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {resolve,join,relative,isAbsolute} from 'node:path';

const [image,container]=process.argv.slice(2);
assert(process.argv.length===4&&/^sha256:[a-f0-9]{64}$/.test(image??'')&&/^[a-f0-9]{64}$/.test(container??''),'Expected immutable image and disposable database container IDs');
assert.equal(process.env.MA24_DISPOSABLE_TRANSPORT_JOURNAL,'1');
assert.equal(process.env.MA24_CONFIGURED_COMBINED,'1','Complete five-category fixture required');
assert.equal(process.env.MA24_DATABASE_TRUST,'1','Database trust fixture required');
const metadata=JSON.parse(execFileSync('docker',['image','inspect','--format','{{json .}}',image],{encoding:'utf8'}));
assert.equal(metadata.Id,image);assert.equal(metadata.Config.User,'node');
const commit=metadata.Config.Labels?.['org.opencontainers.image.revision'];assert.match(commit??'',/^[a-f0-9]{40}$/);
const measuredMain=process.env.MA24_MEASURED_MAIN_IMAGE;
if(measuredMain)assert.match(measuredMain,/^sha256:[a-f0-9]{64}$/);
const formalRecovery=process.env.MA24_LINUX_FORMAL_RECOVERY==='1';
const fixedCollectorReuse=process.env.MA24_FIXED_COLLECTOR_REUSE==='1';
if(fixedCollectorReuse)assert(measuredMain,'Fixed collector reuse requires measured packages');
if(formalRecovery)assert(measuredMain,'Fixed-image formal recovery requires measured runtime packages');
// New fixture-only changes may exercise the fixed runtime without rebuilding it.
// Every runtime source/config byte is checked against /app before execution.
const fixtureCommit=measuredMain?(process.env.MA24_MEASURED_FIXTURE_COMMIT??execFileSync('git',['rev-parse','--verify','HEAD^{commit}'],{encoding:'utf8'}).trim()):commit;
assert.match(fixtureCommit,/^[a-f0-9]{40}$/);
const db=JSON.parse(execFileSync('docker',['inspect','--format','{{json .}}',container],{encoding:'utf8'}));
assert.equal(db.Id,container);assert(db.Name.startsWith('/ma24-pilot-fresh-')&&db.State.Running,'Fresh disposable database required');
const root=resolve('tmp');mkdirSync(root,{recursive:true});const directory=mkdtempSync(join(root,'ma24-linux-five-'));
const within=relative(root,directory);assert(within&&!within.startsWith('..')&&!isAbsolute(within));
try{
 const source=join(directory,'source');mkdirSync(source);
 const archive=join(directory,'source.tar');execFileSync('git',['archive','--format=tar',fixtureCommit,'-o',archive]);
 execFileSync('tar',['-xf',archive,'-C',source]);
 const values={NODE_ENV:'test',NEXT_TELEMETRY_DISABLED:'1',MA24_DISPOSABLE_TRANSPORT_JOURNAL:'1',MA24_CONFIGURED_COMBINED:'1',MA24_DATABASE_TRUST:'1'};
 if(fixedCollectorReuse)values.MA24_FIXED_COLLECTOR_REUSE='1';
 if(formalRecovery)Object.assign(values,{MA24_SHARED_TASK_LEASE:'1',MA24_SKILL_RUNTIME_TASK:'1',MA24_SKILL_RUNTIME_GRAPH:'1',MA24_CONFIGURED_RUNTIME_PROCESS_CRASH:'1'});
 const measurementDirectory=join(directory,'measurements');
 if(measuredMain){
  const output=execFileSync(process.execPath,['scripts/run-tsx.cjs','scripts/verify-skill-runtime-dependency-pair.ts',measuredMain,image,'--esm'],{encoding:'utf8',maxBuffer:2*1024*1024});
  const measured=output.split(/\r?\n/).filter(line=>line.startsWith('{')).map(line=>JSON.parse(line)).find(row=>row.localRuntimeDependencyPair==='passed');
  assert(measured?.esmModuleFormatPairVerified&&measured.comparison.runtimePackageBytesPairRevalidated);
  assert.equal(measured.mainInspection.sourceCommit,commit);assert.equal(measured.collectorInspection.sourceCommit,commit);
  mkdirSync(measurementDirectory);writeFileSync(join(measurementDirectory,'pair.json'),JSON.stringify(measured));
  values.MA24_MEASURED_RUNTIME_PACKAGES_FILE='/measurements/pair.json';
 }
 for(const key of ['DATABASE_URL','DATABASE_MIGRATION_URL']){
  const url=new URL(process.env[key]);assert(['127.0.0.1','localhost'].includes(url.hostname));assert.equal(url.pathname,'/network_copilot_local');
  url.hostname='127.0.0.1';url.port='5432';values[key]=url.toString();
 }
 const environment=join(directory,'fixture.env');
 writeFileSync(environment,Object.entries(values).map(([key,value])=>{assert(!/[\r\n]/.test(value));return `${key}=${value}`;}).join('\n')+'\n',{mode:0o600});
 // The verification source is archived at the image's revision. Scratch copies
 // and generated fixture artifacts live outside /app; installed bytes remain
 // read-only. No host environment, credentials or Docker socket are inherited.
 const entry=String.raw`
 const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
 fs.cpSync('/source','/verification',{recursive:true});
 const paths=root=>{const out=[];const walk=p=>{for(const e of fs.readdirSync(root+'/'+p,{withFileTypes:true})){if(e.isSymbolicLink())throw Error('Runtime source link');const f=p+'/'+e.name;if(e.isDirectory())walk(f);else if(/\.(?:ts|tsx|js|mjs|cjs|json)$/.test(e.name))out.push(f);}};walk('src');return [...out,'package.json','package-lock.json','tsconfig.json','scripts/patch-node-user.cjs'].sort();};
 const archiveFiles=paths('/verification'),imageFiles=paths('/app/.skill-runtime-source');
 if(JSON.stringify(archiveFiles)!==JSON.stringify(imageFiles))throw Error('Fixture runtime source list differs from image');
 for(const file of imageFiles)if(!fs.readFileSync('/verification/'+file).equals(fs.readFileSync('/app/.skill-runtime-source/'+file)))throw Error('Fixture runtime bytes differ from image');
 fs.symlinkSync('/app/node_modules','/verification/node_modules','dir');
 fs.mkdirSync('/verification/tmp/skill-collector',{recursive:true});
 fs.copyFileSync('/app/runner.mjs','/verification/tmp/skill-collector/runner.mjs');
 const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
 if(sha('/app/runner.mjs')!==sha('/verification/tmp/skill-collector/runner.mjs'))throw Error('Fixed runner bytes differ');
 const result=cp.spawnSync(process.execPath,['--import','tsx','scripts/verify-skill-transport-journal-db.ts'],{cwd:'/verification',env:process.env,stdio:'inherit'});
 if(result.error)throw result.error;process.exitCode=result.status??1;`;
 const checked=spawnSync('docker',['run','--rm','--read-only','--user','node','--cap-drop=ALL','--security-opt=no-new-privileges',
  '--network',`container:${container}`,'--mount',`type=bind,source=${source},target=/source,readonly`,
  ...(measuredMain?['--mount',`type=bind,source=${measurementDirectory},target=/measurements,readonly`]:[]),
  '--tmpfs','/verification:rw,nosuid,nodev,size=536870912,mode=1777','--tmpfs','/tmp:rw,nosuid,nodev,size=268435456,mode=1777',
  '--env-file',environment,'--entrypoint','node',image,'-e',entry],{encoding:'utf8',maxBuffer:4*1024*1024});
 // Failure diagnostics may include a connection URL. Redact both inherited
 // disposable DB credentials, even though neither is a production credential.
 const secrets=Object.values(values).filter(value=>value.startsWith('postgres')).map(value=>new URL(value).password);
 const safe=text=>secrets.reduce((value,secret)=>secret?value.replaceAll(secret,'[redacted]'):value,text??'');
 if(checked.stdout)process.stdout.write(safe(checked.stdout));if(checked.stderr)process.stderr.write(safe(checked.stderr));
 if(checked.error)throw checked.error;
 assert.equal(checked.status,0,'Linux five-category fixture failed');
 const summary=(checked.stdout??'').split(/\r?\n/).filter(line=>line.startsWith('{')).map(line=>JSON.parse(line)).find(row=>row.transportJournalDatabase==='passed');
 assert(summary?.configuredSameFreezeFiveCategoriesVerified&&summary.sourceRevocationGuardsReady&&summary.sourcePreparedWithoutSealing);
 assert.equal(summary.actualModelCalls,0);assert.equal(summary.productionQualificationGranted,false);
 if(measuredMain){assert.equal(summary.measuredRuntimeRegistrationCompositionVerified,true);assert.equal(summary.runtimePackagesRegistered,true);assert.equal(summary.collectorProvenanceVerified,true);}
 if(fixedCollectorReuse)assert.equal(summary.fixedPackageHistoricalAndProspectiveCompletedReuseVerified,true);
 if(formalRecovery){
  for(const field of ['sharedAgentRunLeaseDatabaseVerified','sharedOrdinaryLeaseActualRenewalVerified','compiledOrdinaryWorkerSharedLeaseVerified',
   'ordinaryWorkerInitialPauseAndPauseCancelSettled','ordinaryWorkerTransportFailureNoAutomaticReplay','skillRuntimeSharedLeaseCancelSettled'])
   assert.equal(summary[field],true,`Fixed-image formal recovery assertion missing: ${field}`);
  for(const field of ['formalTaskProcessTerminatedAfterCommittedRead','formalTaskEarlyTakeoverRejected','formalTaskDefaultLeaseNaturallyExpired',
   'formalTaskNewProcessRecoveredPendingRead','formalTaskRecoveryPreservedCommittedModelAndToolRows','formalTaskRecoveryRejectsRepeatedCompletedHttpSteps'])
   assert.equal(summary.historicalFormalRecovery?.[field],true,`Fixed-image historical recovery assertion missing: ${field}`);
 }
 console.log(JSON.stringify({linuxFiveCategoryTransport:'passed',imageId:image,sourceCommit:commit,nodeAndDependenciesFromFixedImage:true,
  fixtureCommit,runtimeSourceBytesMatchedImage:true,archivedFixtureSourceMatchesImageRevision:fixtureCommit===commit,measuredRuntimeRegistrationCompositionVerified:!!measuredMain,
  fixedCompiledDeclarationRunnerCopiedByteForByte:true,verificationScratchSeparateFromRuntime:true,
  fixedImageFormalRecoveryVerified:formalRecovery,
  fixedPackageHistoricalAndProspectiveCompletedReuseVerified:fixedCollectorReuse,
  productionEntrypointWrapperUsedForWholeFixture:false,databaseConnection:'disposable namespace loopback',databaseTlsVerified:false,
  actualModelCalls:0,productionQualified:false,automaticActivation:false}));
}finally{
 const final=relative(root,resolve(directory));assert(final&&!final.startsWith('..')&&!isAbsolute(final));rmSync(directory,{recursive:true,force:true});
}
