import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {runGuardedBatch,PaymentRequiredStop} from './guarded-batch.mjs';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const progress=await read('experiments/hybrid-evaluation-v11/results/progress.json');
const keys=progress.rows.map(r=>`${r.taskId}-${r.arm}-${r.repetition}`);
let submissions=0,stoppedAt=null;
try{
 await runGuardedBatch(['unsubmitted-future-task',...keys],{
  readSaved:async key=>key==='unsubmitted-future-task'?null:{trace:await read(`.local-runtime/hybrid-evaluation-v11/performance/${key}.trace.json`)},
  submit:async()=>{submissions++;throw Error('Verification must never submit');},
 });
 throw Error('Expected credit stop');
}catch(error){if(!(error instanceof PaymentRequiredStop))throw error;stoppedAt=error.key;}
if(submissions!==0)throw Error('Guard dispatched a task');
const report={version:'recorded-credit-stop-v1',source:'V11 original saved traces',stoppedAt,newTaskSubmissions:submissions,newModelRequests:0,
 reusedAnswers:false,productionChanged:false,claim:'Replay-only verification of batch orchestration; not provider recovery or answer-quality acceptance.'};
await mkdir('experiments/hybrid-evaluation-controls/results',{recursive:true});
await writeFile('experiments/hybrid-evaluation-controls/results/recorded-stop.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
