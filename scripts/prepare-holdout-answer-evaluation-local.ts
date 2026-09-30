/** Build a blind, read-only holdout input. The answer key stays in PostgreSQL. */
import {createHash} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import nextEnv from "@next/env";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {getPool,tenantQuery} from "../src/lib/rag/db";
import {buildKnowledgeEvaluationCorpus} from "../src/lib/knowledge/evaluation/corpus";
import {evaluationCaseSha256,goldReviewIsPrecise,retrievalProfileSha256,RAG_V3_RETRIEVAL_PROFILE,stableJson,type GoldSourceCoordinate} from "../src/lib/knowledge/review-types";

nextEnv.loadEnvConfig(process.cwd());
const url=process.env.DATABASE_URL;
if(!url||!["localhost","127.0.0.1","::1"].includes(new URL(url).hostname))throw new Error("Local PostgreSQL required");
const corpus=buildKnowledgeEvaluationCorpus();
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
type Review={case_id:string;case_sha256:string;revision:number;expected_answer:string;expected_sources:GoldSourceCoordinate[];review_note:string|null};
const output="tmp/ma24-holdout-evaluation/blind-questions.json";
try{
  const [gate]=await tenantQuery<{retrieval_profile_key:string;retrieval_profile_sha256:string}>(OWNER_USER_ID,
    "select retrieval_profile_key,retrieval_profile_sha256 from knowledge_evaluation_holdout_gate_v3 where corpus_version=$1",[corpus.version],"admin");
  if(gate?.retrieval_profile_key!==RAG_V3_RETRIEVAL_PROFILE.key||gate.retrieval_profile_sha256!==retrievalProfileSha256())
    throw new Error("Frozen holdout gate is missing or changed");
  const reviews=await tenantQuery<Review>(OWNER_USER_ID,`select case_id,case_sha256,revision,expected_answer,expected_sources,review_note
    from knowledge_evaluation_review_v3 where corpus_version=$1 and split='holdout'`,[corpus.version],"admin");
  const cases=corpus.cases.filter(item=>item.split==="holdout");
  const byId=new Map(reviews.map(row=>[row.case_id,row]));
  if(cases.length!==50||reviews.length!==50)throw new Error("Complete frozen holdout Gold required");
  for(const item of cases){
    const row=byId.get(item.id);
    if(!row||row.case_sha256!==evaluationCaseSha256(item)||!row.expected_answer.trim()
      ||!goldReviewIsPrecise(item,row.expected_sources,row.review_note??""))throw new Error(`Gold changed or incomplete: ${item.id}`);
  }
  const goldSnapshotSha256=hash(stableJson(reviews.sort((a,b)=>a.case_id.localeCompare(b.case_id))));
  const manifest={corpusVersion:corpus.version,profileKey:gate.retrieval_profile_key,
    profileSha256:gate.retrieval_profile_sha256,goldSnapshotSha256,
    cases:cases.map(item=>({caseId:item.id,caseSha256:evaluationCaseSha256(item),query:item.query,
      expectedOutcome:item.expectedOutcome,group:item.group,tags:item.tags}))};
  const serialized=JSON.stringify(manifest,null,2)+"\n";
  await mkdir("tmp/ma24-holdout-evaluation",{recursive:true});
  let existing:string|null=null;
  try{existing=await readFile(output,"utf8");}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
  if(existing!==null&&existing!==serialized)throw new Error("Blind manifest changed; inspect existing evaluation before replacing it");
  if(existing===null)await writeFile(output,serialized,{flag:"wx"});
  console.log(JSON.stringify({readOnlyDatabase:true,holdoutCases:cases.length,routeCases:cases.filter(item=>item.expectedOutcome==="route").length,
    profileKey:gate.retrieval_profile_key,profileSha256:gate.retrieval_profile_sha256,goldSnapshotSha256,
    blindManifestSha256:hash(serialized),blindManifest:output,includesGoldAnswers:false,
    includesGoldSources:false,answerQualityValidated:false,externalCalls:0}));
}finally{await getPool().end();}
