/** Read-only retrieval preflight. Null embeddings mean this cannot satisfy the full frozen v3 quality gate. */
import nextEnv from "@next/env";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {getPool,tenantQuery} from "../src/lib/rag/db";
import {buildKnowledgeEvaluationCorpus} from "../src/lib/knowledge/evaluation/corpus";
import {evaluationCaseSha256,retrievalProfileSha256,RAG_V3_RETRIEVAL_PROFILE,type GoldSourceCoordinate} from "../src/lib/knowledge/review-types";
import {modelTokensInQuery,searchDocuments} from "../src/lib/knowledge/vectorless";
import {hybridSearch} from "../src/lib/rag/repository";
import {buildControlledLexicalQuery} from "../src/lib/knowledge/query-normalizer";

nextEnv.loadEnvConfig(process.cwd());
const url=process.env.DATABASE_URL;
if(!url||!["localhost","127.0.0.1","::1"].includes(new URL(url).hostname))throw new Error("Local PostgreSQL required");
const corpus=buildKnowledgeEvaluationCorpus();
type Review={case_id:string;case_sha256:string;expected_sources:GoldSourceCoordinate[]};
try{
  const [gate]=await tenantQuery<{retrieval_profile_key:string;retrieval_profile_sha256:string}>(OWNER_USER_ID,
    "select retrieval_profile_key,retrieval_profile_sha256 from knowledge_evaluation_holdout_gate_v3 where corpus_version=$1",[corpus.version],"admin");
  if(gate?.retrieval_profile_key!==RAG_V3_RETRIEVAL_PROFILE.key||gate.retrieval_profile_sha256!==retrievalProfileSha256())
    throw new Error("Frozen holdout gate is missing or changed");
  const reviews=await tenantQuery<Review>(OWNER_USER_ID,`select case_id,case_sha256,expected_sources
    from knowledge_evaluation_review_v3 where corpus_version=$1 and split='holdout'`,[corpus.version],"admin");
  const byId=new Map(reviews.map(row=>[row.case_id,row]));
  if(reviews.length!==50)throw new Error("All 50 Gold must be frozen before retrieval preflight");
  const cases=corpus.cases.filter(item=>item.split==="holdout"&&item.expectedOutcome==="route");
  const outcomes=[];
  for(const item of cases){
    const review=byId.get(item.id);
    if(!review||review.case_sha256!==evaluationCaseSha256(item)||!review.expected_sources.length)
      throw new Error(`Gold changed: ${item.id}`);
    const expected=[...new Set(review.expected_sources.map(source=>source.assetSha256))];
    const primary=await searchDocuments(OWNER_USER_ID,item.query);
    const documentSources=await tenantQuery<{source_sha256:string}>(OWNER_USER_ID,`select distinct a.source_sha256
      from knowledge_asset a where a.document_id=any($1::uuid[]) and a.registration_status='registered'`,
      [primary.map(row=>row.documentId)],"admin");
    const vectorless=new Set(documentSources.map(row=>row.source_sha256));
    const chunks=await hybridSearch(OWNER_USER_ID,item.query,null,
      {structuredProductTerms:modelTokensInQuery(item.query),lexicalQuery:buildControlledLexicalQuery(item.query)},8,null);
    const chunkSources=await tenantQuery<{source_sha256:string}>(OWNER_USER_ID,`select distinct a.source_sha256
      from knowledge_chunk_v3 c join knowledge_source_revision_v3 r on r.id=c.source_revision_id
      join knowledge_asset a on a.id=r.asset_id where c.id=any($1::uuid[])`,[chunks.map(chunk=>chunk.id)],"admin");
    const v3=new Set(chunkSources.map(row=>row.source_sha256));
    outcomes.push({caseId:item.id,expectedDocuments:expected.length,
      vectorlessCandidateDocuments:primary.length,vectorlessAllExpected:expected.every(hash=>vectorless.has(hash)),
      v3DegradedChunks:chunks.length,v3DegradedAllExpected:expected.every(hash=>v3.has(hash)),
      v3VectorSignalCount:chunks.filter(chunk=>chunk.retrievalSignals.includes("vector")).length});
  }
  console.log(JSON.stringify({local:true,readOnly:true,corpusVersion:corpus.version,profileKey:gate.retrieval_profile_key,
    profileSha256:gate.retrieval_profile_sha256,holdoutRouteCases:cases.length,
    vectorlessAllExpected:outcomes.filter(item=>item.vectorlessAllExpected).length,
    v3DegradedAllExpected:outcomes.filter(item=>item.v3DegradedAllExpected).length,
    qwenQueryEmbeddings:false,bgeQueryEmbeddings:false,answerQualityValidated:false,
    preciseCitationValidated:false,externalCalls:0,outcomes}));
}finally{await getPool().end();}
