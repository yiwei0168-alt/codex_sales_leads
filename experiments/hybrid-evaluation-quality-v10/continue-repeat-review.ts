import '../hybrid-evaluation-v10/trace-off';
import {readFile,writeFile} from 'node:fs/promises';
import {bindRuntime,id,json,once,sha,userId} from '../hybrid-evaluation-v1/runtime';
import {requestModeModel} from '../../src/lib/assistant/main/model';
import {withProductSpend} from '../../src/lib/billing/context';
import {parseQuality} from '../hybrid-evaluation-quality-v1/contract';
import type {ModeConfig} from '../../src/lib/assistant/main/mode-config';
import type {ModelMessage} from '../../src/lib/assistant/main/contracts';

// Resume independent, previously registered review requests only. An uncertain
// request stays ungraded; it is not resent and receives no fabricated score.
const root='experiments/hybrid-evaluation-quality-v10',directory='.local-runtime/hybrid-evaluation-quality-v10';
const text=await readFile(`${directory}/repeats-input.json`,'utf8'),identity=sha(text);
type Mapping={reviewId:string;taskId:string;arm:string;repetition:number;runId:string};
const input=JSON.parse(text) as {sources:Record<string,string>;bundles:{taskId:string;profile:ModeConfig;messages:ModelMessage[];mapping:Mapping[]}[]};
const runtime=JSON.parse(await readFile('.local-runtime/hybrid-evaluation-v10/performance/freeze.json','utf8'));
for(const [path,hash] of Object.entries({...runtime.sources,...input.sources}))if(sha(await readFile(path,'utf8'))!==hash)throw Error(`Frozen source drift: ${path}`);
const admin=await bindRuntime();
try{
 const rows=[],receipts=[],unreviewed=[];
 for(const bundle of input.bundles){
  const requestIdentity=sha(json({identity,taskId:bundle.taskId}));
  const receipt=await once(`${directory}/repeats-${bundle.taskId}.receipt.json`,requestIdentity,
   ()=>withProductSpend(userId,'hybrid-quality-review',()=>requestModeModel(bundle.messages,bundle.profile,0),id(requestIdentity)));
  if(receipt.status!=='completed'){
   unreviewed.push(...bundle.mapping.map(m=>({...m,reason:'review-outcome-unknown',receiptStatus:receipt.status})));
   receipts.push({taskId:bundle.taskId,generationId:null,costUsd:null,status:receipt.status});
  }else{
   const response=receipt.response as Awaited<ReturnType<typeof requestModeModel>>;
   if(response.message.tool_calls?.length)throw Error('Reviewer attempted tools; none executed');
   const grades=parseQuality(response.message.content??'',bundle.mapping.map(m=>m.reviewId));
   rows.push(...grades.map(g=>({...g,...bundle.mapping.find(m=>m.reviewId===g.reviewId)})));
   receipts.push({taskId:bundle.taskId,generationId:response.generationId,costUsd:response.usage?.cost??null,status:'completed'});
  }
  const report={version:'v10-local-read-review-incomplete-safe-resume',phase:'repeats',identity,independentHumanGold:false,
   expectedAnswers:36,reviewedAnswers:rows.length,passed:rows.filter(r=>r.passed).length,rows,unreviewed,receipts,
   complete:rows.length===36,knownReviewCostUsd:receipts.reduce((n,r)=>n+(r.costUsd??0),0),unknownReviewCharges:receipts.filter(r=>r.costUsd===null).length};
  await writeFile(`${root}/results/repeats-review.json`,json(report));
  console.log(json({taskId:bundle.taskId,reviewed:rows.length,unreviewed:unreviewed.length}));
 }
}finally{await admin.end();const {getPool}=await import('../../src/lib/rag/db');await getPool().end();}
