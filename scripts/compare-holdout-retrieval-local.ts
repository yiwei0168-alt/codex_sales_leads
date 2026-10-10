/** Read-only retrieval preflight. Optional local BGE still cannot satisfy the full frozen v3 quality gate. */
import nextEnv from "@next/env";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {getPool,tenantQuery} from "../src/lib/rag/db";
import {buildKnowledgeEvaluationCorpus} from "../src/lib/knowledge/evaluation/corpus";
import {evaluationCaseSha256,retrievalProfileSha256,RAG_V3_RETRIEVAL_PROFILE,type GoldSourceCoordinate} from "../src/lib/knowledge/review-types";
import {modelTokensInQuery,searchDocuments} from "../src/lib/knowledge/vectorless";
import {hybridSearch} from "../src/lib/rag/repository";
import {buildControlledLexicalQuery} from "../src/lib/knowledge/query-normalizer";
import {embedTextsWithBge} from "../src/lib/rag/bge-client";
import {diagnosticSnapshotHash,assertDiagnosticSnapshotUnchanged,localRetrievalDiagnosticIdentity} from "../src/lib/knowledge/evaluation/local-retrieval-receipt";
import {execFileSync} from "node:child_process";

nextEnv.loadEnvConfig(process.cwd());
const url=process.env.DATABASE_URL;
if(!url||!["localhost","127.0.0.1","::1"].includes(new URL(url).hostname))throw new Error("Local PostgreSQL required");
const corpus=buildKnowledgeEvaluationCorpus();
const includeLocalBge=process.argv.includes("--bge-only");
type Review={case_id:string;case_sha256:string;expected_sources:GoldSourceCoordinate[]};
async function inputSnapshot(){
  // Hash metadata only. Do not publish document titles, private text or account identifiers.
  const sources=await tenantQuery(OWNER_USER_ID,`select d.id,d.status,d.visibility,d.owner_id,d.content_sha256,
    d.current_tree_version_id,d.updated_at::text,a.id asset_id,a.source_sha256,a.registration_status,
    a.externally_disclosable,t.status tree_status
    from knowledge_document d left join knowledge_asset a on a.document_id=d.id
    left join knowledge_tree_version t on t.id=d.current_tree_version_id
    where d.visibility='shared' or d.owner_id=$1 order by d.id,a.id`,[OWNER_USER_ID],"admin");
  const pointers=await tenantQuery(OWNER_USER_ID,"select * from knowledge_release_pointer_v3 where scope_kind='shared' order by release_id",[],"admin");
  const reviews=await tenantQuery(OWNER_USER_ID,"select * from knowledge_evaluation_review_v3 where corpus_version=$1 and split='holdout' order by case_id",[corpus.version],"admin");
  const gates=await tenantQuery(OWNER_USER_ID,"select * from knowledge_evaluation_holdout_gate_v3 where corpus_version=$1",[corpus.version],"admin");
  const facts=await tenantQuery(OWNER_USER_ID,`select f.id,f.verification_status,f.evidence_hash,f.raw_field_name,
    f.raw_value,f.typed_value from knowledge_fact_v3 f join knowledge_chunk_v3 c on c.id=f.chunk_id
    join knowledge_document d on d.id=c.document_id where d.visibility='shared' or d.owner_id=$1 order by f.id`,[OWNER_USER_ID],"admin");
  const factReviews=await tenantQuery(OWNER_USER_ID,`select q.id,q.fact_id,q.status from knowledge_review_queue_v3 q
    join knowledge_asset a on a.id=q.asset_id join knowledge_document d on d.id=a.document_id
    where d.visibility='shared' or d.owner_id=$1 order by q.id`,[OWNER_USER_ID],"admin");
  return diagnosticSnapshotHash({sources,pointers,reviews,gates,facts,factReviews});
}
try{
  const startedAt=new Date().toISOString();
  const sourceCommit=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
  const sourceDirty=Boolean(execFileSync("git",["status","--porcelain","--","src/lib/knowledge","src/lib/rag","scripts/compare-holdout-retrieval-local.ts"],{encoding:"utf8"}).trim());
  const snapshotBefore=await inputSnapshot();
  const [gate]=await tenantQuery<{retrieval_profile_key:string;retrieval_profile_sha256:string}>(OWNER_USER_ID,
    "select retrieval_profile_key,retrieval_profile_sha256 from knowledge_evaluation_holdout_gate_v3 where corpus_version=$1",[corpus.version],"admin");
  if(gate?.retrieval_profile_key!==RAG_V3_RETRIEVAL_PROFILE.key||gate.retrieval_profile_sha256!==retrievalProfileSha256())
    throw new Error("Frozen holdout gate is missing or changed");
  const reviews=await tenantQuery<Review>(OWNER_USER_ID,`select case_id,case_sha256,expected_sources
    from knowledge_evaluation_review_v3 where corpus_version=$1 and split='holdout'`,[corpus.version],"admin");
  const byId=new Map(reviews.map(row=>[row.case_id,row]));
  if(reviews.length!==50)throw new Error("All 50 Gold must be frozen before retrieval preflight");
  const cases=corpus.cases.filter(item=>item.split==="holdout"&&item.expectedOutcome==="route");
  const bgeVectors=includeLocalBge?await embedTextsWithBge(cases.map(item=>item.query)):[];
  const outcomes=[];
  for(const [index,item] of cases.entries()){
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
    let v3BgeOnlyAllExpected:boolean|null=null;
    let v3BgeOnlyChunks:number|null=null;
    if(includeLocalBge){
      const bgeChunks=await hybridSearch(OWNER_USER_ID,item.query,null,
        {structuredProductTerms:modelTokensInQuery(item.query),lexicalQuery:buildControlledLexicalQuery(item.query)},8,bgeVectors[index]);
      const bgeSources=await tenantQuery<{source_sha256:string}>(OWNER_USER_ID,`select distinct a.source_sha256
        from knowledge_chunk_v3 c join knowledge_source_revision_v3 r on r.id=c.source_revision_id
        join knowledge_asset a on a.id=r.asset_id where c.id=any($1::uuid[])`,[bgeChunks.map(chunk=>chunk.id)],"admin");
      const hashes=new Set(bgeSources.map(row=>row.source_sha256));
      v3BgeOnlyAllExpected=expected.every(hash=>hashes.has(hash));
      v3BgeOnlyChunks=bgeChunks.length;
    }
    outcomes.push({caseId:item.id,expectedDocuments:expected.length,
      vectorlessCandidateDocuments:primary.length,vectorlessAllExpected:expected.every(hash=>vectorless.has(hash)),
      v3DegradedChunks:chunks.length,v3DegradedAllExpected:expected.every(hash=>v3.has(hash)),
      v3VectorSignalCount:chunks.filter(chunk=>chunk.retrievalSignals.includes("vector")).length,
      v3BgeOnlyChunks,v3BgeOnlyAllExpected});
  }
  assertDiagnosticSnapshotUnchanged(snapshotBefore,await inputSnapshot());
  console.log(JSON.stringify({local:true,readOnly:true,corpusVersion:corpus.version,
    ...localRetrievalDiagnosticIdentity(includeLocalBge),startedAt,completedAt:new Date().toISOString(),
    sourceCommit,sourceDirty,inputSnapshotSha256:snapshotBefore,inputsUnchanged:true,holdoutRouteCases:cases.length,
    vectorlessAllExpected:outcomes.filter(item=>item.vectorlessAllExpected).length,
    v3DegradedAllExpected:outcomes.filter(item=>item.v3DegradedAllExpected).length,
    v3BgeOnlyAllExpected:includeLocalBge?outcomes.filter(item=>item.v3BgeOnlyAllExpected).length:null,
    qwenQueryEmbeddings:false,bgeQueryEmbeddings:includeLocalBge,answerQualityValidated:false,
    preciseCitationValidated:false,externalCalls:0,outcomes}));
}finally{await getPool().end();}
