/** MA24-10: apply an inspected manifest under the user's 2026-09-29 authorization. */
import nextEnv from "@next/env";
import {registerHooks} from "node:module";
import {readFileSync} from "node:fs";
import {getPool,tenantQuery} from "../src/lib/rag/db";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {buildKnowledgeEvaluationCorpus} from "../src/lib/knowledge/evaluation/corpus";
import {evaluationCaseSha256,goldReviewIsPrecise,stableJson,type GoldSourceCoordinate} from "../src/lib/knowledge/review-types";
import {listGoldSourceEvidence,normalizeGoldExcerpt} from "../src/lib/knowledge/gold-source";

nextEnv.loadEnvConfig(process.cwd());
registerHooks({resolve(specifier,context,next){
  if(specifier==="server-only")return{url:"data:text/javascript,export {}",shortCircuit:true};
  return next(specifier,context);
}});
type Entry={caseId:string;caseSha256:string;pattern:string;expectedAnswer:string;expectedSources:GoldSourceCoordinate[];reviewNote:string};
type Manifest={policyId:string;corpusVersion:string;entries:Entry[]};
const path=process.argv[2];
if(!path)throw new Error("Manifest path required; add --apply to write");
const databaseUrl=process.env.DATABASE_URL;
if(!databaseUrl||!["localhost","127.0.0.1","::1"].includes(new URL(databaseUrl).hostname))throw new Error("Local PostgreSQL required");
const manifest=JSON.parse(readFileSync(path,"utf8")) as Manifest;
const corpus=buildKnowledgeEvaluationCorpus();
if(manifest.policyId!=="MA24-10"||manifest.corpusVersion!==corpus.version)throw new Error("Authorization/corpus mismatch");
const seen=new Set<string>();
for(const entry of manifest.entries){
  const item=corpus.cases.find(c=>c.id===entry.caseId);
  if(!item||item.split==="holdout"||evaluationCaseSha256(item)!==entry.caseSha256)throw new Error(`Locked, missing or changed case: ${entry.caseId}`);
  if(seen.has(entry.caseId))throw new Error(`Duplicate case: ${entry.caseId}`);
  seen.add(entry.caseId);
  const type=entry.caseId.match(/^base-\d+-(open|ports|poe|compare|explain)$/)?.[1];
  const baseMatch=entry.pattern===type&&entry.caseId!=="base-15-compare";
  const clarificationMatch=entry.pattern==="clarify-datasheet-model"&&/^boundary-[1-4]-0[12]$/.test(entry.caseId);
  if(!baseMatch&&!clarificationMatch)throw new Error(`Pattern not approved: ${entry.caseId}`);
  if(!entry.expectedAnswer.trim()||!entry.reviewNote.includes("MA24-10"))throw new Error(`Missing answer/authorization receipt: ${entry.caseId}`);
}
try{
  const {saveGoldReview}=await import("../src/lib/knowledge/review-repository");
  const rows=await tenantQuery<{case_id:string;case_sha256:string;expected_answer:string;expected_sources:GoldSourceCoordinate[];review_note:string|null}>(OWNER_USER_ID,
    "select case_id,case_sha256,expected_answer,expected_sources,review_note from knowledge_evaluation_review_v3 where corpus_version=$1",[corpus.version],"admin");
  const existing=new Map(rows.map(r=>[r.case_id,r]));
  // Inspect every existing row before any mutation; never overwrite a prior decision.
  for(const entry of manifest.entries){
    const row=existing.get(entry.caseId);
    if(row&&(row.case_sha256!==entry.caseSha256||row.expected_answer!==entry.expectedAnswer||stableJson(row.expected_sources)!==stableJson(entry.expectedSources)))
      throw new Error(`Existing decision differs: ${entry.caseId}`);
  }
  const evidenceCache=new Map<string,Awaited<ReturnType<typeof listGoldSourceEvidence>>>();
  for(const entry of manifest.entries){
    const item=corpus.cases.find(c=>c.id===entry.caseId)!;
    if(!goldReviewIsPrecise(item,entry.expectedSources,entry.reviewNote))throw new Error(`Incomplete precision fields: ${entry.caseId}`);
    for(const source of entry.expectedSources){
      const key=`${source.assetSha256}:${source.unitIndex}`;
      let blocks=evidenceCache.get(key);
      if(!blocks){blocks=await listGoldSourceEvidence(OWNER_USER_ID,source.assetSha256,source.unitIndex);evidenceCache.set(key,blocks);}
      if(!blocks.some(b=>(!source.blockId||b.blockId===source.blockId)&&normalizeGoldExcerpt(b.content).includes(normalizeGoldExcerpt(source.excerpt??""))))
        throw new Error(`Source mismatch: ${entry.caseId}`);
    }
  }
  let saved=0,skipped=0;
  for(const entry of manifest.entries){
    if(existing.has(entry.caseId)){skipped++;continue;}
    if(!process.argv.includes("--apply"))continue;
    await saveGoldReview(OWNER_USER_ID,entry);
    const [row]=await tenantQuery<{expected_answer:string;expected_sources:GoldSourceCoordinate[];review_note:string}>(OWNER_USER_ID,
      "select expected_answer,expected_sources,review_note from knowledge_evaluation_review_v3 where corpus_version=$1 and case_id=$2",[corpus.version,entry.caseId],"admin");
    if(!row||row.expected_answer!==entry.expectedAnswer||row.review_note!==entry.reviewNote||stableJson(row.expected_sources)!==stableJson(entry.expectedSources))
      throw new Error(`Readback differs: ${entry.caseId}`);
    saved++;
    console.log(JSON.stringify({caseId:entry.caseId,saved:true}));
  }
  console.log(JSON.stringify({local:true,policy:manifest.policyId,apply:process.argv.includes("--apply"),entries:manifest.entries.length,saved,skipped}));
}finally{await getPool().end();}
