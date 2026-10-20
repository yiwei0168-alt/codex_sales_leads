import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {collectorPackageInventory,assertCollectorRuntimeBoundary} from './package-integrity.mjs';

try{
 if(process.execArgv.length||process.env.NODE_OPTIONS?.trim()||process.env.NODE_PATH?.trim())throw new Error('Plain Node process required');
 const boundary=await assertCollectorRuntimeBoundary('/app');
 const root='/app',expected=await readFile(`${root}/runtime-manifest.json`,'utf8'),actual=await collectorPackageInventory(root);
 if(JSON.stringify(actual)!==expected)throw new Error('Package differs from manifest');
 const build=JSON.parse(await readFile(`${root}/build-manifest.json`,'utf8'));
 if(build.protocol!=='skill-collector-build-v2'||build.moduleFormat!=='esm'||build.entry!=='runner.mjs'
  ||actual.files['runner.mjs']?.sha256!==build.sha256)throw new Error('Collector ESM build binding unavailable');
 const deploymentHash=createHash('sha256').update(JSON.stringify(actual)).digest('hex');
 const configured=process.env.SKILL_RUNNER_DEPLOYMENT_SHA256;
 const inspection=process.argv.length===3&&['--verify','--help'].includes(process.argv[2]);
 if((configured!==undefined||!inspection)&&(!/^[a-f0-9]{64}$/.test(configured??'')||configured!==deploymentHash))
  throw new Error('Package differs from enrolled deployment');
 if(process.argv.length===3&&process.argv[2]==='--verify'){
  console.log(JSON.stringify({collectorPackageIntegrity:'passed',files:Object.keys(actual.files).length,deploymentHash,
   deploymentEnrollmentVerified:configured===deploymentHash,runtimeModuleFormat:'esm',...boundary,productionQualified:false}));
 }else{
  await assertCollectorRuntimeBoundary('/app');
  const child=spawn(process.execPath,[`${root}/runner.mjs`,...process.argv.slice(2)],{stdio:'inherit',env:process.env});
  child.once('error',()=>{console.error('Collector process failed to start');process.exitCode=1;});
  child.once('exit',(code,signal)=>{if(signal)process.kill(process.pid,signal);else process.exitCode=code??1;});
 }
}catch{console.error('Collector package integrity verification failed');process.exitCode=1;}
