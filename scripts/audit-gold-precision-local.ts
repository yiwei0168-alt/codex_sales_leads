import nextEnv from "@next/env";
import {Pool} from "pg";
import {buildKnowledgeEvaluationCorpus} from "../src/lib/knowledge/evaluation/corpus";
import {evaluationCaseSha256,goldReviewIsPrecise,type GoldSourceCoordinate} from "../src/lib/knowledge/review-types";

nextEnv.loadEnvConfig(process.cwd());
const url=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
if(!url||!["localhost","127.0.0.1","::1"].includes(new URL(url).hostname))throw new Error("Local PostgreSQL required");
const pool=new Pool({connectionString:url});
try{
  const corpus=buildKnowledgeEvaluationCorpus();
  const rows=await pool.query<{case_id:string;case_sha256:string;expected_sources:GoldSourceCoordinate[];review_note:string|null}>(`
    select case_id,case_sha256,expected_sources,review_note from knowledge_evaluation_review_v3
    where corpus_version=$1`,[corpus.version]);
  const byId=new Map(rows.rows.map(row=>[row.case_id,row]));
  const groups=(["development","validation","holdout"] as const).map(split=>{
    const cases=corpus.cases.filter(item=>item.split===split);
    const reviewed=cases.filter(item=>byId.get(item.id)?.case_sha256===evaluationCaseSha256(item));
    return {split,total:cases.length,reviewed:reviewed.length,
      precise:reviewed.filter(item=>{const row=byId.get(item.id)!;return goldReviewIsPrecise(item,row.expected_sources,row.review_note??"");}).length};
  });
  console.log(JSON.stringify({local:true,groups}));
}finally{await pool.end();}
