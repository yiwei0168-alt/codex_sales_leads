/** Freeze an explicitly approved v3 profile after all 250 nonholdout Gold pass source checks. */
import nextEnv from "@next/env";
import {registerHooks} from "node:module";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {getPool,tenantQuery} from "../src/lib/rag/db";
import {buildKnowledgeEvaluationCorpus} from "../src/lib/knowledge/evaluation/corpus";
import {retrievalProfileSha256,RAG_V3_RETRIEVAL_PROFILE} from "../src/lib/knowledge/review-types";

nextEnv.loadEnvConfig(process.cwd());
const url=process.env.DATABASE_URL;
if(!url||!["localhost","127.0.0.1","::1"].includes(new URL(url).hostname))throw new Error("Local PostgreSQL required");
registerHooks({resolve(specifier,context,next){
  if(specifier==="server-only")return{url:"data:text/javascript,export {}",shortCircuit:true};
  return next(specifier,context);
}});
const hash=retrievalProfileSha256();
const confirmedHash=process.argv.find(arg=>arg.startsWith("--confirmed-sha256="))?.slice("--confirmed-sha256=".length);
if(confirmedHash!==hash)throw new Error("Explicitly confirmed profile SHA-256 required");
const corpus=buildKnowledgeEvaluationCorpus();
try{
  const {unlockGoldHoldout}=await import("../src/lib/knowledge/review-repository");
  const apply=process.argv.includes("--apply");
  if(apply)await unlockGoldHoldout(OWNER_USER_ID,true);
  const [gate]=await tenantQuery<{retrieval_profile_key:string;retrieval_profile_sha256:string}>(OWNER_USER_ID,
    "select retrieval_profile_key,retrieval_profile_sha256 from knowledge_evaluation_holdout_gate_v3 where corpus_version=$1",[corpus.version],"admin");
  if(apply&&(gate?.retrieval_profile_key!==RAG_V3_RETRIEVAL_PROFILE.key||gate.retrieval_profile_sha256!==hash))
    throw new Error("Frozen profile readback differs");
  console.log(JSON.stringify({local:true,apply,corpusVersion:corpus.version,profileKey:RAG_V3_RETRIEVAL_PROFILE.key,
    profileSha256:hash,holdoutUnlocked:Boolean(gate),gateMatchesCurrentProfile:Boolean(gate&&gate.retrieval_profile_key===RAG_V3_RETRIEVAL_PROFILE.key&&gate.retrieval_profile_sha256===hash)}));
}finally{await getPool().end();}
