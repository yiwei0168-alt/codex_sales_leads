/** Read-only main Agent graph probe: scripted decisions, real local BGE retrieval and source recheck. */
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import nextEnv from '@next/env';
import {OWNER_USER_ID} from '../src/lib/auth/config';
import {disableLocalAnalysisTracing} from '../src/lib/assistant/main/local-analysis-boundary';

nextEnv.loadEnvConfig(process.cwd());
disableLocalAnalysisTracing();
registerHooks({resolve(specifier,context,next){
 if(specifier==='server-only')return {url:'data:text/javascript,export {}',shortCircuit:true};
 return next(specifier,context);
}});
const url=process.env.DATABASE_URL;
assert(url&&['localhost','127.0.0.1','::1'].includes(new URL(url).hostname),'Local database required');
process.env.ENABLE_MAIN_AGENT_LOCAL_BGE_SEARCH='1';
const [{buildMainAgentGraph},{productTools},{assertCurrentKnowledgeMessages},{getPool}]=await Promise.all([
 import('../src/lib/assistant/main/graph'),import('../src/lib/assistant/main/tools'),
 import('../src/lib/assistant/main/knowledge-message-guard'),import('../src/lib/rag/db'),
]);
try{
 const tool=productTools.find(row=>row.id==='knowledge_search');
 assert(tool,'knowledge_search unavailable');
 const context={userId:OWNER_USER_ID,runId:'g15-local-graph-read-only',leaseToken:'g15-local-graph-read-only',
  role:'admin' as const,knowledgeScope:['product' as const]};
 let decisions=0,reads=0,bgeRankedChunks=0,qwenRankedChunks=0,authorizedChunks=0,sourceChecks=0;
 const call={id:'g15-local-read',type:'function' as const,function:{name:'execute_tool',
  arguments:JSON.stringify({tool:'knowledge_search',arguments:{query:'WR3000 Ethernet ports',limit:8,collections:['company']}})}};
 const graph=buildMainAgentGraph({
  boundary:async()=>({control:null,instructions:[]}),
  validateEvidence:async messages=>{await assertCurrentKnowledgeMessages(OWNER_USER_ID,messages,['product']);sourceChecks++;},
  model:async()=>{decisions++;return decisions===1
   ?{role:'assistant' as const,content:null,tool_calls:[call]}
   :{role:'assistant' as const,content:'LOCAL_GRAPH_PROBE_COMPLETE'};},
  tool:async selected=>{
   assert.equal(selected.id,call.id);
   const parsed=JSON.parse(selected.function.arguments) as {tool:string;arguments:unknown};
   assert.equal(parsed.tool,tool.id);
   const output=await tool.execute(tool.input.parse(parsed.arguments),context);
   assert.equal(output.status,'success','BGE degradation is not a full local retrieval result');
   const chunks=output.data as Array<{metadata?:{laneRanks?:{bge?:number|null;qwen?:number|null}}}>;
   assert(Array.isArray(chunks)&&chunks.length>0);
   authorizedChunks=chunks.length;
   bgeRankedChunks=chunks.filter(row=>Number.isFinite(row.metadata?.laneRanks?.bge)).length;
   qwenRankedChunks=chunks.filter(row=>Number.isFinite(row.metadata?.laneRanks?.qwen)).length;
   assert(bgeRankedChunks>0&&qwenRankedChunks===0);
   reads++;
   return output;
  },
 });
 const final=await graph.invoke({messages:[{role:'user' as const,content:'WR3000 Ethernet ports'}],
  pending:[],steps:0,status:'running' as const,reply:'',seen:{},instructionIds:[]});
 assert.equal(final.status,'completed');
 assert.equal(final.reply,'LOCAL_GRAPH_PROBE_COMPLETE');
 assert.equal(decisions,2);assert.equal(reads,1);assert(sourceChecks>=2);
 assert.equal(final.messages.filter(row=>row.role==='tool').length,1);
 console.log(JSON.stringify({scope:'main-agent-graph-local-read',readOnly:true,questionKind:'exposed development product query',
  graphStatus:final.status,scriptedModelDecisions:decisions,realKnowledgeReads:reads,sourceRechecks:sourceChecks,
  authorizedChunks,bgeRankedChunks,qwenRankedChunks,modelCalls:0,providerCalls:0,
  durableRunOrJournal:false,answerQualityAccepted:false,independentSetUsed:false,productionProcessLoadedCandidate:false}));
}finally{await getPool().end();}
