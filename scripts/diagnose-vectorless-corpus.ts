import nextEnv from "@next/env";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {getPool,tenantQuery} from "../src/lib/rag/db";
import {buildKnowledgeEvaluationCorpus} from "../src/lib/knowledge/evaluation/corpus";
import {searchDocuments} from "../src/lib/knowledge/vectorless";
import {evaluationCaseSha256,retrievalProfileSha256,RAG_V3_RETRIEVAL_PROFILE,type GoldSourceCoordinate} from "../src/lib/knowledge/review-types";

nextEnv.loadEnvConfig(process.cwd());
const url=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
if(!url||!["localhost","127.0.0.1","::1"].includes(new URL(url).hostname))throw new Error("Local PostgreSQL required");
const corpus=buildKnowledgeEvaluationCorpus();
const includeHoldout=process.argv.includes("--include-holdout");
if(includeHoldout){
  const [gate]=await tenantQuery<{retrieval_profile_key:string;retrieval_profile_sha256:string}>(OWNER_USER_ID,
    "select retrieval_profile_key,retrieval_profile_sha256 from knowledge_evaluation_holdout_gate_v3 where corpus_version=$1",[corpus.version],"admin");
  if(gate?.retrieval_profile_key!==RAG_V3_RETRIEVAL_PROFILE.key||gate.retrieval_profile_sha256!==retrievalProfileSha256())
    throw new Error("Holdout profile gate missing or changed");
}
type Review={case_id:string;case_sha256:string;expected_sources:GoldSourceCoordinate[]};
const reviews=await tenantQuery<Review>(OWNER_USER_ID,`select case_id,case_sha256,expected_sources
  from knowledge_evaluation_review_v3 where corpus_version=$1 and ($2::boolean or split<>'holdout')`,[corpus.version,includeHoldout],"admin");
const byId=new Map(reviews.map(review=>[review.case_id,review]));
const groups:Record<string,{cases:number;candidateHits:number;reviewed:number;sourceHits:number;allSourceHits:number}>={};
const outcomes:Record<string,{cases:number;candidateHits:number}>={};
const splits:Record<string,{routeCases:number;candidateHits:number;sourceHits:number;allSourceHits:number}>={};
const misses:Array<{caseId:string;reason:"no-candidates"|"reviewed-source-missed"}> = [];
const reviewedMisses:Array<{caseId:string;entities:string[];candidateIds:string[];expectedHashes:string[]}>=[];
const partialSourceMisses:Array<{caseId:string;missingHashes:string[]}>=[];
try{
  for(const item of corpus.cases.filter(item=>(includeHoldout||item.split!=="holdout")&&(!process.argv.includes("--reviewed")||byId.has(item.id)))){
    const group=groups[item.expectedAction]??={cases:0,candidateHits:0,reviewed:0,sourceHits:0,allSourceHits:0};
    group.cases++;
    const outcome=outcomes[item.expectedOutcome]??={cases:0,candidateHits:0};
    outcome.cases++;
    const split=splits[item.split]??={routeCases:0,candidateHits:0,sourceHits:0,allSourceHits:0};
    if(item.expectedOutcome==="route")split.routeCases++;
    const documents=await searchDocuments(OWNER_USER_ID,item.query);
    if(documents.length){group.candidateHits++;outcome.candidateHits++;if(item.expectedOutcome==="route")split.candidateHits++;}
    else misses.push({caseId:item.id,reason:"no-candidates"});
    const review=byId.get(item.id);
    if(review?.case_sha256===evaluationCaseSha256(item)){
      group.reviewed++;
      if(review.expected_sources.length){
        const sources=await tenantQuery<{source_sha256:string}>(OWNER_USER_ID,`select distinct a.source_sha256 from knowledge_asset a
          where a.document_id=any($1::uuid[])`,[documents.map(document=>document.documentId)],"admin");
        if(review.expected_sources.some(expected=>sources.some(source=>source.source_sha256===expected.assetSha256))){
          group.sourceHits++;if(item.expectedOutcome==="route")split.sourceHits++;
          if(review.expected_sources.every(expected=>sources.some(source=>source.source_sha256===expected.assetSha256))){
            group.allSourceHits++;if(item.expectedOutcome==="route")split.allSourceHits++;
          }else partialSourceMisses.push({caseId:item.id,missingHashes:[...new Set(review.expected_sources
            .filter(expected=>!sources.some(source=>source.source_sha256===expected.assetSha256))
            .map(expected=>expected.assetSha256))]});
        }
        else {misses.push({caseId:item.id,reason:"reviewed-source-missed"});reviewedMisses.push({caseId:item.id,
          entities:item.expectedEntities,candidateIds:documents.map(document=>document.documentId),expectedHashes:review.expected_sources.map(source=>source.assetSha256)});}
      }
    }
  }
  console.log(JSON.stringify({local:true,corpusVersion:corpus.version,holdoutSkipped:includeHoldout?0:50,groups,outcomes,splits,misses:misses.slice(0,30),
    missedCount:misses.length,reviewedMisses,partialSourceMisses,externalCalls:0}));
}finally{await getPool().end();}
