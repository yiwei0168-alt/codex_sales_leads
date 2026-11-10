import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const local='.local-runtime/hybrid-evaluation-v14',read=async p=>JSON.parse(await readFile(p,'utf8'));
const progress=await read('experiments/hybrid-evaluation-v14/results/progress.json');
const interruptedText=await readFile(`${local}/performance/P24-B-1.interrupted.json`,'utf8'),interrupted=JSON.parse(interruptedText);
const claims=(await readdir(`${local}/performance`)).filter(n=>n.endsWith('.claim.json'));
if(claims.length!==5||progress.rows.length!==4||interrupted.claim.taskId!=='P24'||interrupted.claim.arm!=='B'||interrupted.final.status!=='cancelled')throw Error('Unexpected closure inventory');
const unknown=interrupted.billing.filter(b=>b.reported_micros===null).length;
if(interrupted.billing.some(b=>b.reported_micros!==null))throw Error('Unexpected known interrupted charge; inspect before closure');
const reconciliation=await read(`${local}/generation-reconciliation.json`);
const report={version:'v14-operator-closure-v1',status:'closed-not-qualified',submitted:5,planned:54,notSubmitted:49,
 firstRepeatSubmitted:5,firstRepeatNotSubmitted:13,completeObservations:4,answered:1,partial:3,operatorInterrupted:1,
 knownTaskCostUsd:progress.knownCostUsd,unknownCharges:progress.unknownCharges+unknown,historicalUnknownCharges:49,
 qualityReviewed:0,qualityAccepted:false,performanceAccepted:false,productionChanged:false,
 reason:'Successive model transport failures; stop raced with next submission. Preserve interrupted fifth task and its reserved charge as unknown.',
 observations:progress.rows,interrupted:{taskId:'P24',arm:'B',repetition:1,runId:interrupted.claim.runId,status:interrupted.final.status,
  unknownReservations:unknown,wireEvidenceAvailable:false,timingAvailable:false,retried:false,
  traceHash:createHash('sha256').update(interruptedText.replaceAll('\r\n','\n')).digest('hex')},
 reconciliation:{modelRequests:0,metadataRequests:reconciliation.metadataRequests,result:reconciliation.result,answerReplayed:false},
 next:'Read-only connection diagnosis, deterministic fixes and new graceful scheduler; do not continue this failed freeze or buy reviews for unavailable answers.'};
await writeFile('experiments/hybrid-evaluation-v14/results/closure.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({submitted:report.submitted,answered:report.answered,partial:report.partial,operatorInterrupted:1,unknownCharges:report.unknownCharges,knownTaskCostUsd:report.knownTaskCostUsd,accepted:false}));
