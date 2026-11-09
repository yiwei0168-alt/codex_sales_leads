import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {z} from 'zod';
import Ajv from 'ajv';
import {programStateSchema} from '../../src/providers/program-decision-contract-v4';
import {decisionState} from '../../src/lib/assistant/main/decision-routing';
import {hybridFirstAction} from '../../src/lib/assistant/main/hybrid-routing';
import {automaticModelConfig} from '../../src/lib/assistant/main/automatic-execution';
import {initialTaskMessages} from '../../src/lib/assistant/main/initial-task-messages';

// Offline contract/data checks only: never invoke a model, tool execute, or database.
const root='experiments/hybrid-evaluation-v1';
const read=async(name:string)=>JSON.parse(await readFile(`${root}/${name}`,'utf8'));
const validateObservation=new Ajv({allErrors:true}).compile(await read('observations.schema.json'));
assert.equal(validateObservation({}),false,'Empty observation must not pass');
const routeSchema=z.object({id:z.string(),family:z.string(),split:z.enum(['development','holdout']),stratum:z.string(),state:programStateSchema,
 riskClass:z.enum(['ordinary','context-guard','effect-boundary']),expected:z.object({entryPath:z.enum(['context_guard','deterministic_workflow','jev']),
 initialRoute:z.enum(['fixed_workflow','interpreter','dynamic_agent']),providerCall:z.boolean(),modelTier:z.enum(['quick','standard','deep'])})});
const cases=z.array(routeSchema).parse(await read('routing-cases.json'));
assert.equal(cases.length,96);assert.equal(new Set(cases.map(c=>c.id)).size,96);assert.equal(new Set(cases.map(c=>c.state.request)).size,95); // One deliberate policy contrast.
assert.equal(cases.filter(c=>c.split==='development').length,32);assert.equal(cases.filter(c=>c.split==='holdout').length,64);
for(const family of new Set(cases.map(c=>c.family)))assert.equal(new Set(cases.filter(c=>c.family===family).map(c=>c.split)).size,1);
const before=process.env.ENABLE_HYBRID_EXECUTION;process.env.ENABLE_HYBRID_EXECUTION='1';
try{for(const c of cases){
 const scope=c.state.hasKnowledgeScope?['product' as const]:undefined;
 const context={userId:'synthetic-only',role:'member' as const,mode:c.state.mode,knowledgeScope:scope};
 const input={content:c.state.request,attachments:c.state.hasAttachments?[{assetId:'00000000-0000-4000-8000-000000000001'}]:[],knowledgeScope:scope};
 const history=c.state.hasHistory?[{role:'user' as const,content:'Synthetic prior context'},{role:'assistant' as const,content:'Synthetic previous answer'}]:[];
 const messages=initialTaskMessages(context,input,automaticModelConfig(scope?'knowledge':'business'),history);
 const prepared=!c.state.hasPolicy&&hybridFirstAction(messages);
 const eligible=!prepared&&decisionState(messages,c.state.hasPolicy);
 const entryPath=prepared?'deterministic_workflow':eligible?'jev':'context_guard';
 assert.equal(entryPath,c.expected.entryPath,c.id);assert.equal(Boolean(eligible),c.expected.providerCall,c.id);
 if(prepared)assert.equal(c.expected.initialRoute,'fixed_workflow');
 if(!prepared&&!eligible)assert.equal(c.expected.initialRoute,'dynamic_agent');
}}finally{if(before===undefined)delete process.env.ENABLE_HYBRID_EXECUTION;else process.env.ENABLE_HYBRID_EXECUTION=before;}
const exposed=await read('routing-inputs.json');assert.deepEqual(exposed,cases.map(({id,state})=>({id,state})));
const tasks=await read('performance-tasks.json'),fixtures=await read('business-fixtures.json'),schedule=await read('paired-schedule.json'),protocol=await read('protocol.json');
assert.equal(tasks.length,24);assert.equal(new Set(tasks.map((t:{id:string})=>t.id)).size,24);
assert.equal(fixtures.companies.length,12);assert.equal(fixtures.mails.length,48);assert.equal(fixtures.products.length,4);
const byId=new Map(tasks.map((t:{id:string;assertions:unknown})=>[t.id,t]));
const groupCounts:Record<string,number>={};for(const c of fixtures.companies)groupCounts[`${c.country}/${c.role}`]=(groupCounts[`${c.country}/${c.role}`]??0)+1;
assert.deepEqual(tasks.find((t:{id:string})=>t.id==='P08').assertions.groups,groupCounts);
const dates=['2026-11-02','2026-11-03','2026-11-04','2026-11-05'];
const counts=dates.map(date=>fixtures.mails.filter((m:{date:string})=>new Date(Date.parse(m.date)+8*3600000).toISOString().slice(0,10)===date).length);
assert.deepEqual(tasks.find((t:{id:string})=>t.id==='P10').assertions.counts,counts);assert.equal(counts.reduce((a:number,b:number)=>a+b,0),40);
assert.equal(fixtures.products[2].poeBudgetW,null);assert.equal(fixtures.mails.find((m:{id:string})=>m.id==='c2-m3').explicitDeadline,null);
assert.deepEqual(fixtures.companies.filter((c:{aliases:string[]})=>c.aliases.includes('Ridge')).map((c:{id:string})=>c.id),['c6','c9']);
assert.equal(schedule.length,72);assert.equal(new Set(schedule.map((b:{taskId:string;repetition:number})=>`${b.taskId}/${b.repetition}`)).size,72);
const orderCounts:Record<string,number>={};for(const b of schedule){assert.ok(byId.has(b.taskId));assert.deepEqual([...b.armOrder].sort(),['A','B','C']);orderCounts[b.armOrder.join('')]=(orderCounts[b.armOrder.join('')]??0)+1;}
assert.equal(Object.keys(orderCounts).length,6);for(const count of Object.values(orderCounts))assert.equal(count,12);
const smoke=schedule.filter((b:{taskId:string;repetition:number})=>protocol.performance.smoke.taskIds.includes(b.taskId)&&b.repetition===1);
assert.equal(smoke.length,6);assert.equal(new Set(smoke.map((b:{armOrder:string[]})=>b.armOrder.join(''))).size,6);
assert.deepEqual(await read('performance-inputs.json'),tasks.map(({id,prompt,fixtureVersion,entryScope}:{id:string;prompt:string;fixtureVersion:string;entryScope:string})=>({id,prompt,fixtureVersion,entryScope})));
const report={version:'hybrid-evaluation-design-validation-v1',routingCases:96,development:32,holdout:64,
 productionEntryContractChecks:96,entryCounts:Object.fromEntries(['context_guard','deterministic_workflow','jev'].map(k=>[k,cases.filter(c=>c.expected.entryPath===k).length])),
 performanceTasks:24,pairedBlocks:72,plannedRuns:216,smokeRuns:18,liveExtensionRuns:27,
 fixtures:{companies:12,mails:48,products:4},armOrderCounts:orderCounts,
 observationSchemaCompiled:true,semanticLabelsIndependentlyVerified:false,modelCalls:0,businessToolCalls:0,evaluationResultsAvailable:false,passed:true};
await writeFile(`${root}/validation.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
