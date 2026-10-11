import {runBoundedLocalProcess} from './lib/run-bounded-local-process';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
let stopping=false;
// Graceful shutdown drains the bounded local operation, preserving its receipt.
process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
async function loop(script:string,args:string[]){
  do{
    try{await runBoundedLocalProcess(process.execPath,['--require','./scripts/patch-node-user.cjs','--import','tsx',script,...args],24*60*1000,true);}
    catch{console.error(JSON.stringify({event:'knowledge-worker-operation-failed',script}));}
    if(process.argv.includes('--once'))return;
    if(!stopping)await new Promise(done=>setTimeout(done,5000));
  }while(!stopping);
}
await Promise.all([loop('scripts/process-knowledge-upload-jobs.ts',['--limit=1']),loop('scripts/process-upload-visual-queue.ts',[])]);
