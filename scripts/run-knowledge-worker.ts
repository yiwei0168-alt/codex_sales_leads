import {spawn} from 'node:child_process';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
let stopping=false;
// Graceful shutdown drains the bounded local operation, preserving its receipt.
process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
async function loop(script:string,args:string[]){
  do{
    await new Promise<void>(done=>{
      const child=spawn(process.execPath,['--require','./scripts/patch-node-user.cjs','--import','tsx',script,...args],{cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe']});
      child.stdout.on('data',chunk=>process.stdout.write(chunk));child.stderr.on('data',()=>{});
      child.once('error',()=>done());child.once('exit',()=>done());
    });
    if(process.argv.includes('--once'))return;
    if(!stopping)await new Promise(done=>setTimeout(done,5000));
  }while(!stopping);
}
await Promise.all([loop('scripts/process-knowledge-upload-jobs.ts',['--limit=1']),loop('scripts/process-upload-visual-queue.ts',[])]);
