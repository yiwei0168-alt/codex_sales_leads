/** Read-only paid-call admission preflight. Never sends a model request. */
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import nextEnv from "@next/env";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {readSpendBudget} from "../src/lib/billing/repository";
import {readFreshCnyFxReference} from "../src/lib/billing/fresh-fx-reference";
import {getPool,tenantQuery} from "../src/lib/rag/db";
import {getRagConfig} from "../src/lib/rag/config";
import {buildKnowledgeEvaluationCorpus} from "../src/lib/knowledge/evaluation/corpus";
import {assertHoldoutPaidCapacity,HOLDOUT_PAID_SCOPE,holdoutPaidTariffs,type HoldoutReservation} from "../src/lib/knowledge/evaluation/paid-scope";
import {retrievalProfileSha256,RAG_V3_RETRIEVAL_PROFILE} from "../src/lib/knowledge/review-types";

nextEnv.loadEnvConfig(process.cwd());
const url=process.env.DATABASE_URL;
if(!url||!["localhost","127.0.0.1","::1"].includes(new URL(url).hostname))throw new Error("Local PostgreSQL required");
const hash=(text:string)=>createHash("sha256").update(text).digest("hex");
try{
  const blind=await readFile("tmp/ma24-holdout-evaluation/blind-questions.json","utf8");
  const manifest=JSON.parse(blind) as {corpusVersion:string;profileKey:string;profileSha256:string;goldSnapshotSha256:string;cases:Array<{caseId:string}>};
  const blindHash=hash(blind);
  if(blindHash!=="711ed12f970c54d7d3a73bd5d824946aa7c89cb3c9995b2976445c88bc017d70"
    ||manifest.cases.length!==50||manifest.corpusVersion!==buildKnowledgeEvaluationCorpus().version
    ||manifest.profileKey!==RAG_V3_RETRIEVAL_PROFILE.key||manifest.profileSha256!==retrievalProfileSha256())
    throw new Error("Frozen blind input changed");
  const [gate]=await tenantQuery<{retrieval_profile_key:string;retrieval_profile_sha256:string}>(OWNER_USER_ID,
    "select retrieval_profile_key,retrieval_profile_sha256 from knowledge_evaluation_holdout_gate_v3 where corpus_version=$1",[manifest.corpusVersion],"admin");
  if(gate?.retrieval_profile_key!==manifest.profileKey||gate.retrieval_profile_sha256!==manifest.profileSha256)
    throw new Error("Frozen holdout gate changed");
  const config=getRagConfig();
  if(config.ragAnswerBaseUrl!=="https://api.moonshot.cn/v1"||config.ragAnswerModel!=="kimi-k3"
    ||config.embeddingModel!=="text-embedding-v4"||!config.embeddingApiKey||!config.ragAnswerApiKey)
    throw new Error("Authorized provider configuration unavailable");
  const fx=await readFreshCnyFxReference();
  if(!fx)throw new Error("Fresh official CNY/USD reference unavailable");
  const rules=holdoutPaidTariffs(config.embeddingBaseUrl,fx);
  const operationId=`ma24-holdout-${blindHash.slice(0,16)}`;
  const rows=await tenantQuery<{tariff_key:string;native_micros:string|null}>(OWNER_USER_ID,
    `select tariff_key,metrics->'foreignCostBound'->>'maximumNativeMicros' as native_micros
      from paid_call_reservation where user_id=$1 and operation_id=$2`,[OWNER_USER_ID,operationId],"admin");
  const reservations:HoldoutReservation[]=rows.map(row=>({tariffKey:row.tariff_key,maximumNativeMicros:Number(row.native_micros)}));
  const qwen=assertHoldoutPaidCapacity(reservations,"qwen");
  const kimi=assertHoldoutPaidCapacity(reservations,"kimi");
  const spending=await readSpendBudget(OWNER_USER_ID);
  const remainingUsdMicros=Number(spending.budget?.remaining_micros??0);
  const accountReady=Boolean(spending.budget&&!spending.budget.frozen
    &&remainingUsdMicros>=Math.max(...rules.map(rule=>rule.maximumChargeMicros)));
  console.log(JSON.stringify({local:true,modelCalls:0,blindManifestSha256:blindHash,
    operationId,profileSha256:manifest.profileSha256,goldSnapshotSha256:manifest.goldSnapshotSha256,
    scopeVersion:HOLDOUT_PAID_SCOPE.version,authorizedMaximumCnyMicros:HOLDOUT_PAID_SCOPE.capCnyMicros,
    tariffKeys:rules.map(rule=>rule.key),fxVersion:fx.version,fxAsOf:fx.asOf,
    priorReservations:rows.length,qwenCalls:qwen.qwenCalls,kimiCalls:kimi.kimiCalls,
    reservedCnyMicrosWithBuffer:qwen.reservedCnyMicrosWithBuffer,
    accountBudgetReady:accountReady,accountBudgetFrozen:spending.budget?.frozen??null,
    readyForFirstPaidCall:accountReady}));
}finally{await getPool().end();}
