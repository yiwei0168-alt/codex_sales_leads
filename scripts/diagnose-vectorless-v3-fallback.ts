import nextEnv from "@next/env";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {getPool} from "../src/lib/rag/db";
import {hybridSearch} from "../src/lib/rag/repository";
import {buildKnowledgeEvaluationCorpus} from "../src/lib/knowledge/evaluation/corpus";
import {currentCandidateDocuments,modelTokensInQuery,searchDocuments} from "../src/lib/knowledge/vectorless";

nextEnv.loadEnvConfig(process.cwd());
const url=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
if(!url||!["localhost","127.0.0.1","::1"].includes(new URL(url).hostname))throw new Error("Local PostgreSQL required");
const cases=buildKnowledgeEvaluationCorpus().cases.filter(item=>item.split!=="holdout"&&item.expectedOutcome==="route");
let misses=0,recovered=0;
const examples:Array<{caseId:string;fallbackCandidates:number}>=[];
try{
  for(const item of cases){
    if((await searchDocuments(OWNER_USER_ID,item.query)).length)continue;
    misses++;
    const chunks=await hybridSearch(OWNER_USER_ID,item.query,null,
      {structuredProductTerms:modelTokensInQuery(item.query),lexicalQuery:item.query},40);
    const candidates=await currentCandidateDocuments(OWNER_USER_ID,[...new Set(chunks.map(chunk=>chunk.documentId))]);
    if(candidates.length)recovered++;
    examples.push({caseId:item.id,fallbackCandidates:candidates.length});
  }
  console.log(JSON.stringify({local:true,holdoutSkipped:50,routeCases:cases.length,primaryMisses:misses,
    recoveredByV3Candidates:recovered,examples,externalCalls:0,embeddingCalls:0}));
}finally{await getPool().end();}
