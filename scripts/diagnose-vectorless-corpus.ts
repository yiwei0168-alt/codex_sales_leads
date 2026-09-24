import nextEnv from "@next/env";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {getPool,tenantQuery} from "../src/lib/rag/db";
import {buildKnowledgeEvaluationCorpus} from "../src/lib/knowledge/evaluation/corpus";
import {searchDocuments} from "../src/lib/knowledge/vectorless";
import {evaluationCaseSha256,type GoldSourceCoordinate} from "../src/lib/knowledge/review-types";

nextEnv.loadEnvConfig(process.cwd());
const url=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
if(!url||!["localhost","127.0.0.1","::1"].includes(new URL(url).hostname))throw new Error("Local PostgreSQL required");
const corpus=buildKnowledgeEvaluationCorpus();
type Review={case_id:string;case_sha256:string;expected_sources:GoldSourceCoordinate[]};
const reviews=await tenantQuery<Review>(OWNER_USER_ID,`select case_id,case_sha256,expected_sources
  from knowledge_evaluation_review_v3 where corpus_version=$1 and split<>'holdout'`,[corpus.version],"admin");
const byId=new Map(reviews.map(review=>[review.case_id,review]));
const groups:Record<string,{cases:number;candidateHits:number;reviewed:number;sourceHits:number}>={};
const outcomes:Record<string,{cases:number;candidateHits:number}>={};
const misses:Array<{caseId:string;reason:"no-candidates"|"reviewed-source-missed"}> = [];
const reviewedMisses:Array<{caseId:string;entities:string[];candidateIds:string[];expectedHashes:string[]}>=[];
try{
  for(const item of corpus.cases.filter(item=>item.split!=="holdout"&&(!process.argv.includes("--reviewed")||byId.has(item.id)))){
    const group=groups[item.expectedAction]??={cases:0,candidateHits:0,reviewed:0,sourceHits:0};
    group.cases++;
    const outcome=outcomes[item.expectedOutcome]??={cases:0,candidateHits:0};
    outcome.cases++;
    const documents=await searchDocuments(OWNER_USER_ID,item.query);
    if(documents.length){group.candidateHits++;outcome.candidateHits++;}
    else misses.push({caseId:item.id,reason:"no-candidates"});
    const review=byId.get(item.id);
    if(review?.case_sha256===evaluationCaseSha256(item)){
      group.reviewed++;
      if(review.expected_sources.length){
        const sources=await tenantQuery<{source_sha256:string}>(OWNER_USER_ID,`select distinct a.source_sha256 from knowledge_asset a
          where a.document_id=any($1::uuid[])`,[documents.map(document=>document.documentId)],"admin");
        if(review.expected_sources.some(expected=>sources.some(source=>source.source_sha256===expected.assetSha256)))group.sourceHits++;
        else {misses.push({caseId:item.id,reason:"reviewed-source-missed"});reviewedMisses.push({caseId:item.id,
          entities:item.expectedEntities,candidateIds:documents.map(document=>document.documentId),expectedHashes:review.expected_sources.map(source=>source.assetSha256)});}
      }
    }
  }
  console.log(JSON.stringify({local:true,corpusVersion:corpus.version,holdoutSkipped:50,groups,outcomes,misses:misses.slice(0,30),
    missedCount:misses.length,reviewedMisses,externalCalls:0}));
}finally{await getPool().end();}
