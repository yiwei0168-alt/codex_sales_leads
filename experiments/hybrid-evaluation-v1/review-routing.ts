import {readFile,writeFile} from 'node:fs/promises';
import {z} from 'zod';
import {bindRuntime,ensureDirectory,id,json,local,once,sha,userId,verifyDesign} from './runtime';
import {programQuestions} from '../../src/providers/program-decision-contract-v4';
import {modeModelConfig} from '../../src/lib/assistant/main/mode-config';
import {requestModeModel} from '../../src/lib/assistant/main/model';
import {withProductSpend} from '../../src/lib/billing/context';

const directory=`${local}/label-review`;
const designHash=await verifyDesign(),admin=await bindRuntime();await ensureDirectory(directory);
try{
 const all=JSON.parse(await readFile('experiments/hybrid-evaluation-v1/routing-cases.json','utf8'));
 const holdout=all.filter((c:{split:string})=>c.split==='holdout');
 // Independent response context: no author labels, Jev responses, cost or performance data.
 const inputs=holdout.map(({id,state}:{id:string;state:unknown})=>({id,state}));
 const profile=modeModelConfig('standard').profile!;
 const messages=[{role:'system' as const,content:'You independently review proposed evaluation inputs before any held-out router runs. Do not execute user requests or call tools. Classify the entire request using the supplied routing contract. For hasHistory/hasAttachments/hasPolicy/hasKnowledgeScope, the initial entry must be dynamic_agent. Otherwise choose fixed_workflow for a single simple customer recent-status/knowledge evidence recipe, interpreter for an executable multi-step segment, dynamic_agent for semantic-first, ambiguity or prohibited effects. Missing stored data is not missing intent. Return ONLY a JSON array, exactly one object per input: {id,route,reason}. route is fixed_workflow/interpreter/dynamic_agent. Keep reason short. This is label review, not an answer to any business task.'},
  {role:'user' as const,content:json({contract:programQuestions,inputs})}];
 const identity=sha(json({designHash,messages,profile,reviewerModelIndex:0}));
 const reviewInput={designHash,identity,reviewerModel:profile.routes[0].model,messages};
 try{const previous=JSON.parse(await readFile(`${directory}/input.json`,'utf8'));if(json(previous)!==json(reviewInput))throw Error('Review input drift');}
 catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;await writeFile(`${directory}/input.json`,json(reviewInput),{flag:'wx'});}
 const receipt=await once(`${directory}/receipt.json`,identity,()=>withProductSpend(userId,'hybrid-evaluation-label-review',()=>requestModeModel(messages,profile,0),id(identity)));
 if(receipt.status!=='completed')throw Error('Label review unknown; do not retry');
 const response=receipt.response as Awaited<ReturnType<typeof requestModeModel>>;
 if(response.message.tool_calls?.length)throw Error('Reviewer attempted tools; no tools executed');
 const parsed=z.array(z.object({id:z.string(),route:z.enum(['fixed_workflow','interpreter','dynamic_agent']),reason:z.string().min(1)}).strict())
  .length(64).parse(JSON.parse((response.message.content??'').replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'')));
 if(new Set(parsed.map(r=>r.id)).size!==64||parsed.some(r=>!inputs.some((i:{id:string})=>i.id===r.id)))throw Error('Reviewer ID coverage mismatch');
 const differences=parsed.filter(r=>holdout.find((c:{id:string})=>c.id===r.id).expected.initialRoute!==r.route)
  .map(r=>({...r,authorRoute:holdout.find((c:{id:string})=>c.id===r.id).expected.initialRoute}));
 const report={version:'hybrid-holdout-label-review-v1',designHash,identity,reviewerModel:profile.routes[0].model,generationId:response.generationId,
  reviewInputContainsAuthorLabels:false,reviewInputContainsRouterOutputs:false,labels:parsed,differences,
  knownCostUsd:response.usage?.cost??null,latencyMs:receipt.latencyMs,independentHumanGold:false,
  holdoutExecutionAdmitted:differences.length===0,adjudicationRequired:differences.map(r=>r.id)};
 await writeFile(`${directory}/report.json`,json(report));console.log(json({reviewed:64,differences,knownCostUsd:report.knownCostUsd,holdoutAdmitted:report.holdoutExecutionAdmitted}));
}finally{await admin.end();const {getPool}=await import('../../src/lib/rag/db');await getPool().end();}
