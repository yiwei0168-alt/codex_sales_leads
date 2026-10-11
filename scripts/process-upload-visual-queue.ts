import {runBoundedLocalProcess} from './lib/run-bounded-local-process';
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
    try{await runBoundedLocalProcess(process.execPath,['--require','./scripts/patch-node-user.cjs','--import','tsx','scripts/prepare-upload-visual-review.ts',`--job-id=${job.jobId}`,`--user-id=${job.userId}`,`--visual-lease=${job.leaseToken}`],22*60*1000);success=true;}catch{/* The durable queue retains failure and the bounded retry schedule. */}
    const recorded=await finishVisualReviewJob(job,success);
    console.log(JSON.stringify({claimed:1,success,recorded,externalCalls:0}));
  }
}finally{await getPool().end();}
