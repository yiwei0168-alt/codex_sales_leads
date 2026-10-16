import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {collectorPackageInventory} from './package-integrity.mjs';

try{
 const root='/app',expected=await readFile(`${root}/runtime-manifest.json`,'utf8'),actual=await collectorPackageInventory(root);
 if(JSON.stringify(actual)!==expected)throw new Error('Package differs from manifest');
 if(process.argv.length===3&&process.argv[2]==='--verify'){
  console.log(JSON.stringify({collectorPackageIntegrity:'passed',files:Object.keys(actual.files).length,productionQualified:false}));
 }else{
  const child=spawn(process.execPath,[`${root}/runner.cjs`,...process.argv.slice(2)],{stdio:'inherit',env:process.env});
  child.once('error',()=>{console.error('Collector process failed to start');process.exitCode=1;});
  child.once('exit',(code,signal)=>{if(signal)process.kill(process.pid,signal);else process.exitCode=code??1;});
 }
}catch{console.error('Collector package integrity verification failed');process.exitCode=1;}
