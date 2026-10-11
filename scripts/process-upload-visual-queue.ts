import {spawn} from 'node:child_process';
import nextEnv from '@next/env';
import {z} from 'zod';
import {getPool} from '../src/lib/rag/db';
import {claimVisualReviewJob,finishVisualReviewJob} from '../src/lib/knowledge/visual-queue';
nextEnv.loadEnvConfig(process.cwd());
const only=process.argv.find(value=>value.startsWith('--job-id='))?.slice(9);if(only)z.uuid().parse(only);
try{
  const job=await claimVisualReviewJob(only);
  if(!job)console.log(JSON.stringify({claimed:0}));
  else{
    let success=false;
    try{await new Promise<void>((done,reject)=>{
      const child=spawn(process.execPath,['--require','./scripts/patch-node-user.cjs','--import','tsx','scripts/prepare-upload-visual-review.ts',`--job-id=${job.jobId}`,`--user-id=${job.userId}`,`--visual-lease=${job.leaseToken}`],{cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe']});
      child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});
      const timer=setTimeout(()=>child.kill(),22*60*1000);
      child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);if(code===0)done();else reject(new Error('Candidate preparation failed'));});
    });success=true;}catch{/* The durable queue retains failure and the bounded retry schedule. */}
    const recorded=await finishVisualReviewJob(job,success);
    console.log(JSON.stringify({claimed:1,success,recorded,externalCalls:0}));
  }
}finally{await getPool().end();}
