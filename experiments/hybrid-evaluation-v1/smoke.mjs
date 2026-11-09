import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const root='experiments/hybrid-evaluation-v1',local='.local-runtime/hybrid-evaluation-v1/performance';
const freeze=JSON.parse(await readFile(`${local}/freeze.json`,'utf8'));
const schedule=JSON.parse(await readFile(`${root}/paired-schedule.json`,'utf8'))
 .filter(b=>freeze.smokeTasks.includes(b.taskId)&&b.repetition===1);
if(schedule.length!==6)throw Error('Smoke schedule mismatch');
for(const block of schedule)for(const arm of block.armOrder){
 const key=`${block.taskId}-${arm}-1`,path=`${local}/${key}.observation.json`;
 let observation;
 try{observation=JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 if(!observation){
  console.log(JSON.stringify({starting:key}));
  await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,['scripts/run-tsx.cjs',`${root}/performance-run.ts`,'run',block.taskId,arm,'1'],{stdio:'inherit',windowsHide:true});
   child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(`Task ${key} stopped (${code}); inspect receipts, no automatic retry`)));
  });
  observation=JSON.parse(await readFile(path,'utf8'));
 }
 if(observation.status!=='answered')throw Error(`Task ${key} did not finish; retain outcome and inspect before continuing`);
 console.log(JSON.stringify({completed:key,billingComplete:observation.billingComplete,qualityReviewed:observation.quality!==null}));
}
