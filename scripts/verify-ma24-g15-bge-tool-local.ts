/** Read-only product-DB probe for the opt-in main Agent BGE knowledge_search tool. */
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
const [{productTools},{getPool}]=await Promise.all([
 import('../src/lib/assistant/main/tools'),import('../src/lib/rag/db'),
]);
try{
 const tool=productTools.find(row=>row.id==='knowledge_search');
 assert(tool,'knowledge_search unavailable');
 const input=tool.input.parse({query:'WR3000 Ethernet ports',limit:8,collections:['company']});
 const output=await tool.execute(input,{userId:OWNER_USER_ID,runId:'g15-local-read-only-probe',
  leaseToken:'g15-local-read-only-probe',role:'admin',knowledgeScope:['product']});
 const chunks=Array.isArray(output.data)?output.data as Array<{metadata?:{laneRanks?:{bge?:number|null;qwen?:number|null}}}>:[];
 const bgeHits=chunks.filter(row=>Number.isFinite(row.metadata?.laneRanks?.bge)).length;
 const qwenHits=chunks.filter(row=>Number.isFinite(row.metadata?.laneRanks?.qwen)).length;
 assert.equal(output.status,'success','Full BGE baseline required; degraded result is not acceptance');
 assert(chunks.length>0&&bgeHits>0,'No authorized BGE-ranked evidence returned');
 assert.equal(qwenHits,0,'Remote Qwen query lane unexpectedly used');
 console.log(JSON.stringify({scope:'main-agent-knowledge-search-local-product-read',readOnly:true,
  questionKind:'exposed development product query',knowledgeScope:'product',
  ignoredModelRequestedScope:'company',authorizedChunks:chunks.length,bgeRankedChunks:bgeHits,
  qwenRankedChunks:qwenHits,toolStatus:output.status,
  localBgeFlag:true,modelCalls:0,providerCalls:0,answerQualityAccepted:false,
  wholeAgentTaskExecuted:false,independentSetUsed:false}));
}finally{await getPool().end();}
