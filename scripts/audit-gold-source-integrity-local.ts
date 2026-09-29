/** Read-only MA24 audit; never reads locked case answers or unlocks the gate. */
import nextEnv from "@next/env";
import {registerHooks} from "node:module";
import {readFileSync} from "node:fs";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {getPool,tenantQuery} from "../src/lib/rag/db";
import {buildKnowledgeEvaluationCorpus} from "../src/lib/knowledge/evaluation/corpus";
import {listGoldSourceEvidence,normalizeGoldExcerpt} from "../src/lib/knowledge/gold-source";
import {evaluationCaseSha256,goldReviewIsPrecise,retrievalProfileSha256,RAG_V3_RETRIEVAL_PROFILE,stableJson,type GoldSourceCoordinate} from "../src/lib/knowledge/review-types";

nextEnv.loadEnvConfig(process.cwd());
const url=process.env.DATABASE_URL;
if(!url||!["localhost","127.0.0.1","::1"].includes(new URL(url).hostname))throw new Error("Local PostgreSQL required");
registerHooks({resolve(specifier,context,next){
  if(specifier==="server-only")return{url:"data:text/javascript,export {}",shortCircuit:true};
  return next(specifier,context);
}});
type Review={case_id:string;case_sha256:string;revision:number;expected_answer:string;expected_sources:GoldSourceCoordinate[];review_note:string|null};
try{
  const corpus=buildKnowledgeEvaluationCorpus();
  const cases=corpus.cases.filter(item=>item.split!=="holdout");
  const rows=await tenantQuery<Review>(OWNER_USER_ID,`select case_id,case_sha256,revision,expected_answer,expected_sources,review_note
    from knowledge_evaluation_review_v3 where corpus_version=$1 and split<>'holdout'`,[corpus.version],"admin");
  const byId=new Map(rows.map(row=>[row.case_id,row]));
  const cache=new Map<string,Awaited<ReturnType<typeof listGoldSourceEvidence>>>();
  const missing:string[]=[];
  let coordinates=0;
  for(const item of cases){
    const row=byId.get(item.id);
    if(!row){missing.push(item.id);continue;}
    if(row.case_sha256!==evaluationCaseSha256(item)||!row.expected_answer.trim()
      ||!goldReviewIsPrecise(item,row.expected_sources,row.review_note??""))throw new Error(`Incomplete or changed Gold: ${item.id}`);
    for(const source of row.expected_sources){
      const key=`${source.assetSha256}:${source.unitIndex}`;
      let blocks=cache.get(key);
      if(!blocks){blocks=await listGoldSourceEvidence(OWNER_USER_ID,source.assetSha256,source.unitIndex);cache.set(key,blocks);}
      if(!blocks.some(block=>(!source.blockId||source.blockId===block.blockId)
        &&normalizeGoldExcerpt(block.content).includes(normalizeGoldExcerpt(source.excerpt??""))))throw new Error(`Inactive or mismatched source: ${item.id}`);
      coordinates++;
    }
  }
  let preserved:number|undefined;
  const snapshotPath=process.argv[2];
  if(snapshotPath){
    const snapshot=JSON.parse(readFileSync(snapshotPath,"utf8")) as {corpusVersion:string;saved:Review[]};
    if(snapshot.corpusVersion!==corpus.version)throw new Error("Snapshot corpus mismatch");
    for(const prior of snapshot.saved){
      if(!cases.some(item=>item.id===prior.case_id))throw new Error("Snapshot contains a locked or unknown case");
      const row=byId.get(prior.case_id);
      if(!row||stableJson(row)!==stableJson(prior))throw new Error(`Prior decision changed: ${prior.case_id}`);
    }
    preserved=snapshot.saved.length;
  }
  const [gate]=await tenantQuery<{retrieval_profile_key:string;retrieval_profile_sha256:string}>(OWNER_USER_ID,
    "select retrieval_profile_key,retrieval_profile_sha256 from knowledge_evaluation_holdout_gate_v3 where corpus_version=$1",[corpus.version],"admin");
  console.log(JSON.stringify({local:true,readOnly:true,corpusVersion:corpus.version,reviewed:rows.length,total:cases.length,
    sourceCoordinates:coordinates,distinctSourceUnits:cache.size,priorDecisionsPreserved:preserved,missing,
    holdoutUnlocked:Boolean(gate),profile:RAG_V3_RETRIEVAL_PROFILE,profileSha256:retrievalProfileSha256(),
    existingGate:gate??null,externalCalls:0,answerQualityValidated:false}));
}finally{await getPool().end();}
