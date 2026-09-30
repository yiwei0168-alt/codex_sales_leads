/** MA24-12: resumable, one-attempt-per-stage, bounded local holdout comparison. */
import {createHash} from "node:crypto";
import {mkdir,readFile,rename,writeFile} from "node:fs/promises";
import nextEnv from "@next/env";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {withSpendContext} from "../src/lib/billing/context";
import {readFreshCnyFxReference} from "../src/lib/billing/fresh-fx-reference";
import {sdkModelFetch,withSdkModelCall} from "../src/lib/billing/sdk-model-call";
import {getPool,tenantQuery} from "../src/lib/rag/db";
import {getRagConfig} from "../src/lib/rag/config";
import {hybridSearch} from "../src/lib/rag/repository";
import {generateGroundedAnswer,groundedAnswerRequestBody} from "../src/lib/rag/openai-provider";
import type {RetrievedChunk} from "../src/lib/rag/types";
import {embedTextsWithBge} from "../src/lib/rag/bge-client";
import {buildControlledLexicalQuery} from "../src/lib/knowledge/query-normalizer";
import {modelTokensInQuery} from "../src/lib/knowledge/vectorless";
import {browseSessionTree,readSessionEvidence,searchSessionDocuments,startVectorlessSession} from "../src/lib/knowledge/vectorless-session";
import {buildKnowledgeEvaluationCorpus} from "../src/lib/knowledge/evaluation/corpus";
import type {AnswerCandidate,BlindManifest} from "../src/lib/knowledge/evaluation/answer-comparison";
import {HOLDOUT_PAID_SCOPE,assertHoldoutPaidCapacity,holdoutPaidTariffs,type HoldoutPaidKind,type HoldoutReservation} from "../src/lib/knowledge/evaluation/paid-scope";
import {retrievalProfileSha256} from "../src/lib/knowledge/review-types";

nextEnv.loadEnvConfig(process.cwd());
const url=process.env.DATABASE_URL;
if(!url||!["localhost","127.0.0.1","::1"].includes(new URL(url).hostname))throw new Error("Local PostgreSQL required");
const root="tmp/ma24-holdout-evaluation";
const blindFile=`${root}/blind-questions.json`,stateFile=`${root}/paid-run-state.json`;
const expectedBlindHash="711ed12f970c54d7d3a73bd5d824946aa7c89cb3c9995b2976445c88bc017d70";
const sha=(value:string)=>createHash("sha256").update(value).digest("hex");
const args=process.argv.slice(2);
const dryRun=args.includes("--dry-run");
const recoverMissing=args.includes("--recover-missing");
const recoverLast=args.includes("--recover-last-p4-explain");
const repairOpenCase=args.includes("--repair-open-pilot")?"base-43-open"
  :args.find(arg=>arg.startsWith("--repair-open-case="))?.slice("--repair-open-case=".length);
const limitArgument=args.find(arg=>arg.startsWith("--limit="));
const limit=limitArgument?Number(limitArgument.slice(8)):50;
if(!Number.isSafeInteger(limit)||limit<1||limit>50)throw new Error("--limit must be between 1 and 50");
type Ledger={id:string;stage:string;status:string;tariff_key:string;native_micros:string|null;settled_source:string|null;
  valid_output_items:number|null;output_incomplete:boolean|null};
type State={blindSha256:string;operationId:string;profileSha256:string;fxVersion:string;
  vectors:Record<string,number[]>;candidates:AnswerCandidate[];errors:Array<{caseId:string;stage:string;reason:string}>};
const modelTokens=(query:string)=>modelTokensInQuery(query);
const publicSource=(type:string)=>type.startsWith("public-")||["official-website","official-platform-profile","independent-public"].includes(type);
const citationIds=(answer:string)=>[...new Set([...answer.matchAll(/\[KB:([0-9a-f-]{36})\]/g)].map(match=>match[1]))];
const isOpenRequest=(query:string)=>/(?:打开|open\b)/i.test(query)&&/datasheet/i.test(query);
const excerpt=(value:string)=>value.trim().replace(/\s+/g," ").slice(0,180);
const stageName=(caseId:string,kind:"qwen"|"v3"|"vectorless")=>`ma24-holdout:${caseId}:${kind}`;
const rowReceipts=(ledger:Ledger[],stage:string)=>ledger.filter(row=>row.stage===stage).map(row=>row.id);

async function ledger(operationId:string){return tenantQuery<Ledger>(OWNER_USER_ID,
  `select id,stage,status,tariff_key,metrics->'foreignCostBound'->>'maximumNativeMicros' native_micros,
    settled_source,(metrics->>'validOutputItems')::int valid_output_items,
    (metrics->>'outputIncomplete')::boolean output_incomplete
    from paid_call_reservation where user_id=$1 and operation_id=$2 order by created_at,id`,
  [OWNER_USER_ID,operationId],"admin");}
async function admit(operationId:string,stage:string,kind:HoldoutPaidKind){
  const rows=await ledger(operationId);
  if(rows.some(row=>row.stage===stage))throw new Error(`Paid stage already attempted: ${stage}`);
  // A completed HTTP transport can lack a provider bill. An interrupted transport also
  // consumes its full conservative CNY bound, but its exact stage is never replayed.
  if(rows.some(row=>row.status==="reserved"||row.status==="bound-exceeded"))
    throw new Error("Unsettled or bound-exceeded paid outcome; stop before another call");
  assertHoldoutPaidCapacity(rows.map(row=>({tariffKey:row.tariff_key,
    maximumNativeMicros:Number(row.native_micros)} satisfies HoldoutReservation)),kind);
}
async function persist(state:State){
  await mkdir(root,{recursive:true});
  const temporary=`${stateFile}.next`;
  await writeFile(temporary,JSON.stringify(state,null,2),"utf8");
  await rename(temporary,stateFile);
  const candidateFile=`${root}/candidates.json`;
  await writeFile(`${candidateFile}.next`,JSON.stringify({blindManifestSha256:state.blindSha256,
    candidates:state.candidates},null,2),"utf8");
  await rename(`${candidateFile}.next`,candidateFile);
}
async function loadState(blindSha256:string,operationId:string,profileSha256:string,fxVersion:string):Promise<State>{
  let existing:State|null=null;
  try{existing=JSON.parse(await readFile(stateFile,"utf8")) as State;}catch(error){
    if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;
  }
  if(existing){
    if(existing.blindSha256!==blindSha256||existing.operationId!==operationId
      ||existing.profileSha256!==profileSha256||existing.fxVersion!==fxVersion)
      throw new Error("Saved run is bound to a different blind input, profile, operation or FX snapshot");
    return existing;
  }
  return{blindSha256,operationId,profileSha256,fxVersion,vectors:{},candidates:[],errors:[]};
}
async function validatedV3Chunks(chunks:RetrievedChunk[]){
  if(!chunks.length)return{chunks:[] as RetrievedChunk[],sources:new Map<string,Source>(),excluded:0};
  const rows=await tenantQuery<Source>(OWNER_USER_ID,`select c.id,c.document_id as "documentId",c.content as raw_content,
    c.source_location as location,a.source_sha256 as "assetSha256",a.document_version as version,
    a.registration_status,a.externally_disclosable,d.visibility,d.source_type,d.status as document_status,
    (v.asset_id=a.id and v.source_sha256=a.source_sha256 and v.status='ready') as current_asset
    from knowledge_chunk_v3 c join knowledge_source_revision_v3 sr on sr.id=c.source_revision_id
    join knowledge_asset a on a.id=sr.asset_id join knowledge_document d on d.id=c.document_id
    left join knowledge_tree_version v on v.id=d.current_tree_version_id
    join knowledge_release_pointer_v3 p on p.release_id=c.release_id and p.scope_kind='shared'
    where c.id=any($1::uuid[])`,[chunks.map(chunk=>chunk.id)],"admin");
  const authorized=new Map(rows.filter(approvedSource).map(row=>[row.id,row]));
  return{chunks:chunks.filter(chunk=>authorized.has(chunk.id)),sources:authorized,
    excluded:chunks.length-authorized.size};
}
type Source={id:string;documentId:string;raw_content:string;location:Record<string,unknown>;
  assetSha256:string;version:string|null;registration_status:string;externally_disclosable:boolean;
  visibility:string;source_type:string;document_status:string;current_asset:boolean};
function approvedSource(row:Source){return row.registration_status==="registered"&&row.externally_disclosable
  &&row.visibility==="shared"&&row.document_status==="active"&&row.current_asset&&publicSource(row.source_type);}
type Evidence={chunk:RetrievedChunk;source:Source};
function coordinates(answer:string,evidence:Evidence[]){
  const byId=new Map(evidence.map(item=>[item.chunk.id,item.source]));
  return citationIds(answer).flatMap(id=>{
    const source=byId.get(id);if(!source)return[];
    const unitIndex=Number(source.location.unitIndex);
    if(!Number.isSafeInteger(unitIndex)||unitIndex<1)return[];
    const row=Number(source.location.rowStart);
    return[{assetSha256:source.assetSha256,unitIndex,
      ...(Number.isSafeInteger(row)&&row>0?{row}:{}),
      ...(source.version?{version:source.version}:{}),
      ...((typeof source.location.blockId==="string")?{blockId:source.location.blockId}:{}),
      excerpt:excerpt(source.raw_content)}];
  });
}
function fitEvidence(question:string,evidence:Evidence[]){
  const selected=[...evidence];
  while(selected.length&&Buffer.byteLength(groundedAnswerRequestBody(question,selected.map(item=>item.chunk)),"utf8")
    >HOLDOUT_PAID_SCOPE.maximumKimiRequestBytes)selected.pop();
  return selected;
}
async function originalLinkCandidate(caseId:string,path:"v3"|"vectorless",question:string,
  evidence:Evidence[],receiptIds:string[],profileSha256:string):Promise<AnswerCandidate|null>{
  const models=modelTokens(question);
  const chosen=evidence.find(item=>/datasheet/i.test(item.chunk.title)
    &&(!models.length||models.some(model=>item.chunk.title.toLowerCase().includes(model))));
  if(!chosen)return null;
  const assetId=chosen.chunk.sourceUrl?.match(/^\/api\/knowledge\/assets\/([0-9a-f-]{36})$/)?.[1];
  if(!assetId)return null;
  const [cover]=await tenantQuery<{content:string;unit_index:number;source_sha256:string;document_version:string|null;mime_type:string}>(OWNER_USER_ID,
    `select n.content,n.unit_index,a.source_sha256,a.document_version,a.mime_type from knowledge_tree_node n
      join knowledge_tree_version v on v.id=n.version_id join knowledge_document d on d.current_tree_version_id=v.id
      join knowledge_asset a on a.id=v.asset_id and a.source_sha256=v.source_sha256
      where d.id=$1 and a.id=$2 and d.status='active' and d.visibility='shared'
        and a.registration_status='registered' and a.externally_disclosable and v.status='ready'
        and n.node_kind='evidence' order by n.unit_index,n.ordinal limit 1`,
    [chosen.chunk.documentId,assetId],"admin");
  if(!cover||cover.mime_type!=="application/pdf"||cover.source_sha256!==chosen.source.assetSha256)
    return null;
  const link=`/api/knowledge/assets/${assetId}`;
  const answer=/[\p{Script=Han}]/u.test(question)
    ?`已找到《${chosen.chunk.title}》原始 PDF：[打开或下载](${link})。`
    :`Original PDF found: [open or download ${chosen.chunk.title}](${link}).`;
  return{caseId,path,answer,citations:[{assetSha256:cover.source_sha256,unitIndex:cover.unit_index,
    ...(cover.document_version?{version:cover.document_version}:{}),excerpt:excerpt(cover.content)}],
    receiptIds,modelId:"local-original-link-v1",retrievalProfileSha256:profileSha256};
}
async function vectorlessEvidence(question:string):Promise<{evidence:Evidence[];sessionId:string;partial:boolean}> {
  const sessionId=await startVectorlessSession(OWNER_USER_ID,question);
  const search=await searchSessionDocuments(OWNER_USER_ID,sessionId);
  if(search.status!=="ok")throw new Error("Vectorless search budget exhausted");
  const candidateIds=search.documents.map(row=>row.documentId);
  if(!candidateIds.length)return{evidence:[],sessionId,partial:search.partial};
  const documents=await tenantQuery<{id:string;title:string;collection:string;source_type:string;asset_id:string}>(OWNER_USER_ID,
    `select d.id,d.title,k.slug collection,d.source_type,a.id asset_id
     from knowledge_document d join knowledge_collection k on k.id=d.collection_id
     join knowledge_tree_version v on v.id=d.current_tree_version_id and v.status='ready'
     join knowledge_asset a on a.id=v.asset_id and a.source_sha256=v.source_sha256
     where d.id=any($1::uuid[]) and d.status='active' and d.visibility='shared'
       and a.registration_status='registered' and a.externally_disclosable
     order by array_position($1::uuid[],d.id)`,[candidateIds],"admin");
  const publicDocs=documents.filter(row=>publicSource(row.source_type));
  const mentioned=modelTokens(question);
  const selected=publicDocs.filter(row=>!mentioned.length||mentioned.some(token=>row.title.toLowerCase().includes(token)));
  const chosen=(selected.length?selected:publicDocs).slice(0,mentioned.length>1?3:2);
  if(!chosen.length)return{evidence:[],sessionId,partial:true};
  const lower=question.toLowerCase();
  const terms=/poe/.test(lower)?["poe","power","input","output"]
    :/ports?|网口|接口/.test(lower)?["port","ethernet","rj45","gbe","sfp"]
    :/compare|比较|区别/.test(lower)?["port","power","poe","wireless"]
    :/explain|场景|scenario|fit/.test(lower)?["application","feature","mount","wireless","wi-fi"]
    :["model","datasheet"];
  const ranked=await tenantQuery<{id:string;documentId:string;unitIndex:number;parentId:string;score:number}>(OWNER_USER_ID,
    `select n.id,v.document_id as "documentId",n.unit_index as "unitIndex",n.parent_id as "parentId",
      (select count(*)::int from unnest($2::text[]) term where position(term in lower(n.content))>0) as score
     from knowledge_tree_node n join knowledge_tree_version v on v.id=n.version_id
     where v.document_id=any($1::uuid[]) and n.node_kind='evidence' and v.status='ready'
     order by score desc,array_position($1::uuid[],v.document_id),n.unit_index,n.ordinal limit 32`,
    [chosen.map(row=>row.id),terms],"admin");
  const roots=new Map<string,Set<string>>();const browsed=new Set<string>();const evidence:Evidence[]=[];
  for(const row of ranked){
    if(evidence.length>=8)break;
    const document=chosen.find(item=>item.id===row.documentId);if(!document)continue;
    if(!roots.has(document.id)){
      const result=await browseSessionTree(OWNER_USER_ID,sessionId,document.id);
      if(result.status!=="ok")break;
      roots.set(document.id,new Set(result.nodes.map(item=>item.id)));
    }
    if(!roots.get(document.id)?.has(row.parentId))continue;
    const key=`${document.id}:${row.parentId}`;
    if(!browsed.has(key)){
      const result=await browseSessionTree(OWNER_USER_ID,sessionId,document.id,row.parentId);
      if(result.status!=="ok")break;
      browsed.add(key);
      if(!result.nodes.some(item=>item.id===row.id))continue;
    }
    const read=await readSessionEvidence(OWNER_USER_ID,sessionId,row.id);
    if(read.status!=="ok")break;
    if(!read.evidence)continue;
    const [identity]=await tenantQuery<Source>(OWNER_USER_ID,
      `select n.id,d.id as "documentId",n.content as raw_content,n.source_location as location,
        a.source_sha256 as "assetSha256",a.document_version as version,a.registration_status,
        a.externally_disclosable,d.visibility,d.source_type,d.status as document_status,
        (d.current_tree_version_id=v.id and v.status='ready') as current_asset
       from knowledge_tree_node n join knowledge_tree_version v on v.id=n.version_id
       join knowledge_document d on d.id=v.document_id join knowledge_asset a on a.id=v.asset_id
       where n.id=$1 and n.node_kind='evidence'`,[row.id],"admin");
    if(!identity||!approvedSource(identity)||identity.assetSha256!==read.evidence.source_sha256)continue;
    evidence.push({source:identity,chunk:{id:row.id,documentId:document.id,
      collection:document.collection as RetrievedChunk["collection"],title:document.title,
      content:read.evidence.content,sourceUrl:`/api/knowledge/assets/${document.asset_id}`,
      sourceType:document.source_type,authorityLevel:3,headingPath:[],retrievalSignals:[],
      corroborated:false,score:0,metadata:{sourceLocation:identity.location},visibility:"shared"}});
  }
  return{evidence,sessionId,partial:search.partial||ranked.length>evidence.length};
}
async function paidQwen(question:string,stage:string,operationId:string,fxVersion:string,rules:ReturnType<typeof holdoutPaidTariffs>,baseUrl:string,apiKey:string){
  await admit(operationId,stage,"qwen");
  const body=JSON.stringify({model:"text-embedding-v4",input:[question],dimensions:1536,encoding_format:"float"});
  const response=await withSpendContext({userId:OWNER_USER_ID,operationId,stage,
    tariffPolicy:{version:HOLDOUT_PAID_SCOPE.version,rules},fixedFxReferenceVersion:fxVersion},
  ()=>withSdkModelCall({provider:"embedding-configured",task:"rag-embedding",promptVersion:"ma24-holdout-qwen-v1"},
    ()=>sdkModelFetch()(`${baseUrl}/embeddings`,{method:"POST",headers:{authorization:`Bearer ${apiKey}`,
      "content-type":"application/json"},body,signal:AbortSignal.timeout(90_000)})));
  if(!response.ok)throw new Error(`Qwen embedding HTTP ${response.status}`);
  const parsed=await response.json() as {data?:Array<{embedding:number[]}>};
  const vector=parsed.data?.[0]?.embedding;
  if(!vector||vector.length!==1536||vector.some(value=>!Number.isFinite(value)))throw new Error("Invalid Qwen vector");
  return vector;
}
async function answer(question:string,evidence:Evidence[],stage:string,operationId:string,fxVersion:string,rules:ReturnType<typeof holdoutPaidTariffs>){
  await admit(operationId,stage,"kimi");
  return withSpendContext({userId:OWNER_USER_ID,operationId,stage,
    tariffPolicy:{version:HOLDOUT_PAID_SCOPE.version,rules},fixedFxReferenceVersion:fxVersion},
  ()=>generateGroundedAnswer(question,evidence.map(item=>item.chunk),fetch,
    recoverMissing||recoverLast?180_000:90_000));
}

const lockClient=await getPool().connect();let locked=false;
try{
  const blind=await readFile(blindFile,"utf8");
  const blindSha256=sha(blind),manifest=JSON.parse(blind) as BlindManifest;
  if(blindSha256!==expectedBlindHash||manifest.cases.length!==50||manifest.profileSha256!==retrievalProfileSha256()
    ||manifest.corpusVersion!==buildKnowledgeEvaluationCorpus().version)throw new Error("Frozen blind manifest changed");
  const operationId=`ma24-holdout-${blindSha256.slice(0,16)}`;
  const lock=await lockClient.query<{locked:boolean}>("select pg_try_advisory_lock(hashtextextended($1,0)) locked",[operationId]);
  if(!lock.rows[0].locked)throw new Error("Another holdout evaluation is running");locked=true;
  const [gate]=await tenantQuery<{retrieval_profile_sha256:string}>(OWNER_USER_ID,
    "select retrieval_profile_sha256 from knowledge_evaluation_holdout_gate_v3 where corpus_version=$1",
    [manifest.corpusVersion],"admin");
  if(gate?.retrieval_profile_sha256!==manifest.profileSha256)throw new Error("Frozen holdout gate changed");
  const config=getRagConfig(),fx=await readFreshCnyFxReference();
  if(!fx||!config.embeddingApiKey||!config.ragAnswerApiKey||config.ragAnswerBaseUrl!=="https://api.moonshot.cn/v1"
    ||config.ragAnswerModel!=="kimi-k3"||config.embeddingModel!=="text-embedding-v4")
    throw new Error("Authorized provider or official FX unavailable");
  const rules=holdoutPaidTariffs(config.embeddingBaseUrl,fx);
  const state=await loadState(blindSha256,operationId,manifest.profileSha256,fx.version);
  const currentLedger=await ledger(operationId);
  if(currentLedger.length&&state.candidates.length===0&&Object.keys(state.vectors).length===0)
    throw new Error("Paid ledger exists without recoverable local run state; inspect before proceeding");
  if(repairOpenCase){
    const target=manifest.cases.find(item=>item.caseId===repairOpenCase);
    if(!target||!isOpenRequest(target.query))throw new Error("Known frozen open case required for repair");
    const pilot=state.candidates.filter(candidate=>candidate.caseId===repairOpenCase&&candidate.modelId==="kimi-k3");
    if(pilot.length!==2)throw new Error("Expected exactly two original pilot answers to archive");
    const archive=`${root}/${repairOpenCase}-original-model-candidates.json`;
    try{await readFile(archive,"utf8");throw new Error("Pilot archive already exists");}
    catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
    await writeFile(archive,JSON.stringify({blindManifestSha256:blindSha256,candidates:pilot},null,2),"utf8");
    state.candidates=state.candidates.filter(candidate=>!pilot.includes(candidate));
    await persist(state);
  }
  if(!dryRun)await embedTextsWithBge(["holdout BGE health probe"]);
  const selected=manifest.cases.slice(0,limit);
  for(const item of selected){
    const vectorStage=stageName(item.caseId,"qwen");
    if(!state.vectors[item.caseId]&&!dryRun){
      if((await ledger(operationId)).some(row=>row.stage===vectorStage)){
        state.errors.push({caseId:item.caseId,stage:vectorStage,reason:"Prior paid attempt has no saved vector; no retry"});
        await persist(state);continue;
      }
      try{state.vectors[item.caseId]=await paidQwen(item.query,vectorStage,operationId,fx.version,rules,
        config.embeddingBaseUrl,config.embeddingApiKey);await persist(state);}
      catch(error){state.errors.push({caseId:item.caseId,stage:vectorStage,reason:String(error)});await persist(state);break;}
    }
    for(const path of ["v3","vectorless"] as const){
      if(state.candidates.some(candidate=>candidate.caseId===item.caseId&&candidate.path===path))continue;
      const stage=stageName(item.caseId,path);
      const prior=(await ledger(operationId)).find(row=>row.stage===stage);
      const recovery=Boolean(!isOpenRequest(item.query)&&prior&&recoverMissing
        &&prior.status==="unknown"&&prior.valid_output_items!==1);
      const previousRecovery=(await ledger(operationId)).find(row=>row.stage===`${stage}:recovery1`);
      const lastRecovery=Boolean(recoverLast&&item.caseId==="base-43-explain"&&path==="v3"
        &&prior?.status==="unknown"&&prior.valid_output_items!==1
        &&previousRecovery?.status==="unknown"&&previousRecovery.valid_output_items!==1);
      const paidStage=lastRecovery?`${stage}:recovery2`:recovery?`${stage}:recovery1`:stage;
      if(!isOpenRequest(item.query)&&prior&&!recovery&&!lastRecovery){
        if(!state.errors.some(error=>error.caseId===item.caseId&&error.stage===stage
          &&error.reason==="Prior paid attempt has no saved answer; no retry")){
          state.errors.push({caseId:item.caseId,stage,reason:"Prior paid attempt has no saved answer; no retry"});
          await persist(state);
        }
        continue;
      }
      if((recovery||lastRecovery)&&(await ledger(operationId)).some(row=>row.stage===paidStage))continue;
      let evidence:Evidence[]=[],receiptIds:string[]=[],partial=false,excluded=0;
      try{
        if(path==="v3"){
          const bge=(await embedTextsWithBge([item.query]))[0];
          const chunks=await hybridSearch(OWNER_USER_ID,item.query,state.vectors[item.caseId]??null,
            {structuredProductTerms:modelTokens(item.query),lexicalQuery:buildControlledLexicalQuery(item.query)},8,bge);
          const validated=await validatedV3Chunks(chunks);
          evidence=validated.chunks.map(chunk=>({chunk,source:validated.sources.get(chunk.id)!}));
          if(lastRecovery)evidence=evidence.slice(0,4);
          excluded=validated.excluded;
          receiptIds=rowReceipts(await ledger(operationId),vectorStage);
        }else{
          const result=await vectorlessEvidence(item.query);
          evidence=result.evidence;partial=result.partial;receiptIds=[result.sessionId];
        }
        if(recovery)receiptIds.push(...rowReceipts(await ledger(operationId),stage));
        if(lastRecovery)receiptIds.push(...rowReceipts(await ledger(operationId),stage),
          ...rowReceipts(await ledger(operationId),`${stage}:recovery1`));
        const evaluatedQuestionBase=partial||excluded>0
          ?`${item.query}\n\nRetrieval notice: only part of the accessible document range or evidence fits this run. State any unsearched scope; do not claim exhaustive coverage.`
          :item.query;
        const evaluatedQuestion=lastRecovery?`${evaluatedQuestionBase}\n\n`
          :recovery?`${evaluatedQuestionBase}\n`:evaluatedQuestionBase;
        const fitted=fitEvidence(evaluatedQuestion,evidence);
        partial||=fitted.length<evidence.length||excluded>0;
        if(isOpenRequest(item.query)&&fitted.length){
          const local=await originalLinkCandidate(item.caseId,path,item.query,fitted,receiptIds,manifest.profileSha256);
          if(local){if(dryRun){console.log(JSON.stringify({caseId:item.caseId,path,localOriginalLink:true}));continue;}
            state.candidates.push(local);await persist(state);
            console.log(JSON.stringify({caseId:item.caseId,path,localOriginalLink:true}));continue;}
        }
        if(!fitted.length){
          if(dryRun){console.log(JSON.stringify({caseId:item.caseId,path,approvedEvidence:0,excluded,partial}));continue;}
          const answer=/[\p{Script=Han}]/u.test(item.query)
            ?"当前可访问且可核验的原始资料不足，无法确认该请求；请补充准确型号或原件。"
            :"The current accessible, verified original sources are insufficient to confirm this request. Please provide the exact model or source.";
          state.candidates.push({caseId:item.caseId,path,answer,citations:[],receiptIds,
            modelId:"local-evidence-gate-v1",retrievalProfileSha256:manifest.profileSha256});
          await persist(state);continue;
        }
        if(dryRun){console.log(JSON.stringify({caseId:item.caseId,path,approvedEvidence:fitted.length,
          excluded,partial,requestBytes:Buffer.byteLength(groundedAnswerRequestBody(evaluatedQuestion,fitted.map(row=>row.chunk)))}));
          continue;}
        const generated=await answer(evaluatedQuestion,fitted,paidStage,operationId,fx.version,rules);
        receiptIds.push(...rowReceipts(await ledger(operationId),paidStage));
        const candidate:AnswerCandidate={caseId:item.caseId,path,answer:generated,
          citations:coordinates(generated,fitted),receiptIds,modelId:"kimi-k3",
          retrievalProfileSha256:manifest.profileSha256};
        if(!receiptIds.length)throw new Error("Paid answer lacks reservation receipt");
        state.candidates.push(candidate);await persist(state);
        console.log(JSON.stringify({caseId:item.caseId,path,answerSaved:true,citations:candidate.citations.length,
          evidenceSent:fitted.length,excluded,partial}));
      }catch(error){state.errors.push({caseId:item.caseId,stage:paidStage,reason:String(error)});await persist(state);break;}
    }
  }
  const finalLedger=await ledger(operationId);
  const capacity=assertHoldoutPaidCapacity(finalLedger.map(row=>({tariffKey:row.tariff_key,
    maximumNativeMicros:Number(row.native_micros)})),"kimi");
  console.log(JSON.stringify({dryRun,operationId,selectedCases:selected.length,
    savedCandidates:state.candidates.length,errors:state.errors.length,paidReservations:finalLedger.length,
    qwenCalls:capacity.qwenCalls,kimiCalls:capacity.kimiCalls,
    reservedCnyMicrosWithBuffer:capacity.reservedCnyMicrosWithBuffer,
    remainingCnyMicros:capacity.remainingCnyMicros,productionRouteChanged:false}));
}finally{
  if(locked)await lockClient.query("select pg_advisory_unlock(hashtextextended($1,0))",[`ma24-holdout-${expectedBlindHash.slice(0,16)}`]);
  lockClient.release();await getPool().end();
}
