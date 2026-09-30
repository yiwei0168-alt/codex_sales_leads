/** Read-only human-verdict scorer. It never calls a model or reveals the Gold key. */
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import nextEnv from "@next/env";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {getPool,tenantQuery} from "../src/lib/rag/db";
import {buildKnowledgeEvaluationCorpus} from "../src/lib/knowledge/evaluation/corpus";
import {scoreAnswerComparison,type AnswerCandidate,type AnswerVerdict,type BlindManifest} from "../src/lib/knowledge/evaluation/answer-comparison";
import {evaluationCaseSha256,goldReviewIsPrecise,retrievalProfileSha256,RAG_V3_RETRIEVAL_PROFILE,stableJson,type GoldSourceCoordinate} from "../src/lib/knowledge/review-types";

nextEnv.loadEnvConfig(process.cwd());
const url=process.env.DATABASE_URL;
if(!url||!["localhost","127.0.0.1","::1"].includes(new URL(url).hostname))throw new Error("Local PostgreSQL required");
const root="tmp/ma24-holdout-evaluation";
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
type Review={case_id:string;case_sha256:string;revision:number;expected_answer:string;expected_sources:GoldSourceCoordinate[];review_note:string|null};
try{
  const [blindText,candidatesText,verdictsText]=await Promise.all([
    readFile(`${root}/blind-questions.json`,"utf8"),readFile(`${root}/candidates.json`,"utf8"),readFile(`${root}/verdicts.json`,"utf8")]);
  const parseJson=(value:string)=>JSON.parse(value.replace(/^\uFEFF/,"")) as unknown;
  const manifest=parseJson(blindText) as BlindManifest;
  const candidateFile=parseJson(candidatesText) as {blindManifestSha256:string;candidates:AnswerCandidate[]};
  const verdictFile=parseJson(verdictsText) as {blindManifestSha256:string;verdicts:AnswerVerdict[]};
  const manifestHash=hash(blindText);
  if(candidateFile.blindManifestSha256!==manifestHash||verdictFile.blindManifestSha256!==manifestHash)
    throw new Error("Candidate or verdict manifest hash differs from the blind input");
  const corpus=buildKnowledgeEvaluationCorpus();
  if(manifest.corpusVersion!==corpus.version||manifest.profileKey!==RAG_V3_RETRIEVAL_PROFILE.key
    ||manifest.profileSha256!==retrievalProfileSha256())throw new Error("Frozen evaluation profile changed");
  const [gate]=await tenantQuery<{retrieval_profile_key:string;retrieval_profile_sha256:string}>(OWNER_USER_ID,
    "select retrieval_profile_key,retrieval_profile_sha256 from knowledge_evaluation_holdout_gate_v3 where corpus_version=$1",[corpus.version],"admin");
  if(gate?.retrieval_profile_key!==manifest.profileKey||gate.retrieval_profile_sha256!==manifest.profileSha256)
    throw new Error("Holdout gate changed");
  const reviews=await tenantQuery<Review>(OWNER_USER_ID,`select case_id,case_sha256,revision,expected_answer,expected_sources,review_note
    from knowledge_evaluation_review_v3 where corpus_version=$1 and split='holdout'`,[corpus.version],"admin");
  const cases=corpus.cases.filter(item=>item.split==="holdout");
  if(cases.length!==50||reviews.length!==50)throw new Error("Frozen Gold is incomplete");
  const expectedBlindCases=cases.map(item=>({caseId:item.id,caseSha256:evaluationCaseSha256(item),query:item.query,
    expectedOutcome:item.expectedOutcome,group:item.group,tags:item.tags}));
  if(stableJson(manifest.cases)!==stableJson(expectedBlindCases))throw new Error("Blind questions changed");
  const byId=new Map(reviews.map(row=>[row.case_id,row]));
  for(const item of cases){
    const row=byId.get(item.id);
    if(!row||row.case_sha256!==evaluationCaseSha256(item)||!row.expected_answer.trim()
      ||!goldReviewIsPrecise(item,row.expected_sources,row.review_note??""))throw new Error(`Gold changed: ${item.id}`);
  }
  if(hash(stableJson(reviews.sort((a,b)=>a.case_id.localeCompare(b.case_id))))!==manifest.goldSnapshotSha256)
    throw new Error("Frozen Gold snapshot changed");
  const result=scoreAnswerComparison({manifest,candidates:candidateFile.candidates,verdicts:verdictFile.verdicts});
  console.log(JSON.stringify({readOnlyDatabase:true,externalCalls:0,blindManifestSha256:manifestHash,
    candidatesSha256:hash(candidatesText),verdictsSha256:hash(verdictsText),...result}));
}finally{await getPool().end();}
