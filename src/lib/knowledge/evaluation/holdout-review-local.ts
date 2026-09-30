import "server-only";
import {createHash,randomUUID} from "node:crypto";
import {appendFile,readFile,rename,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {tenantQuery,tenantTransaction} from "@/lib/rag/db";
import {buildKnowledgeEvaluationCorpus} from "./corpus";
import {answerCandidateSha256,scoreAnswerComparison,type AnswerCandidate,type AnswerPath,
  type AnswerVerdict,type BlindManifest} from "./answer-comparison";
import {evaluationCaseSha256,goldReviewIsPrecise,retrievalProfileSha256,RAG_V3_RETRIEVAL_PROFILE,
  stableJson,type GoldSourceCoordinate} from "../review-types";

const root=resolve(process.cwd(),"tmp/ma24-holdout-evaluation");
const blindFile=resolve(root,"blind-questions.json");
const candidateFile=resolve(root,"candidates.json");
const verdictFile=resolve(root,"verdicts.json");
const historyFile=resolve(root,"verdict-history.jsonl");
const hash=(text:string)=>createHash("sha256").update(text).digest("hex");
type GoldRow={case_id:string;case_sha256:string;revision:number;expected_answer:string;
  expected_sources:GoldSourceCoordinate[];review_note:string|null};
type StoredVerdicts={blindManifestSha256:string;verdicts:AnswerVerdict[]};
function assertLocal(){
  const database=process.env.DATABASE_URL;
  if(!database||!["localhost","127.0.0.1","::1"].includes(new URL(database).hostname))
    throw new Error("Holdout answer review requires local PostgreSQL");
}
async function readInputs(userId:string){
  assertLocal();
  const [blindText,candidateText,verdictText]=await Promise.all([
    readFile(blindFile,"utf8"),readFile(candidateFile,"utf8"),
    readFile(verdictFile,"utf8").catch(error=>{
      if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;return null;
    }),
  ]);
  const manifest=JSON.parse(blindText) as BlindManifest;
  const candidates=JSON.parse(candidateText) as {blindManifestSha256:string;candidates:AnswerCandidate[]};
  const stored=verdictText?JSON.parse(verdictText) as StoredVerdicts:{blindManifestSha256:hash(blindText),verdicts:[]};
  const blindHash=hash(blindText);
  if(candidates.blindManifestSha256!==blindHash||stored.blindManifestSha256!==blindHash)
    throw new Error("Holdout answer input hash changed");
  const corpus=buildKnowledgeEvaluationCorpus();
  const expected=corpus.cases.filter(item=>item.split==="holdout").map(item=>({caseId:item.id,
    caseSha256:evaluationCaseSha256(item),query:item.query,expectedOutcome:item.expectedOutcome,
    group:item.group,tags:item.tags}));
  if(manifest.cases.length!==50||stableJson(manifest.cases)!==stableJson(expected)
    ||manifest.profileKey!==RAG_V3_RETRIEVAL_PROFILE.key
    ||manifest.profileSha256!==retrievalProfileSha256()||manifest.corpusVersion!==corpus.version)
    throw new Error("Frozen holdout input changed");
  const [gate]=await tenantQuery<{retrieval_profile_sha256:string}>(userId,
    "select retrieval_profile_sha256 from knowledge_evaluation_holdout_gate_v3 where corpus_version=$1",
    [manifest.corpusVersion],"admin");
  if(gate?.retrieval_profile_sha256!==manifest.profileSha256)throw new Error("Frozen holdout gate changed");
  const gold=await tenantQuery<GoldRow>(userId,
    `select case_id,case_sha256,revision,expected_answer,expected_sources,review_note
      from knowledge_evaluation_review_v3 where corpus_version=$1 and split='holdout'`,
    [manifest.corpusVersion],"admin");
  if(gold.length!==50||hash(stableJson(gold.sort((a,b)=>a.case_id.localeCompare(b.case_id))))!==manifest.goldSnapshotSha256)
    throw new Error("Frozen Gold snapshot changed");
  const byId=new Map(gold.map(row=>[row.case_id,row]));
  for(const item of corpus.cases.filter(item=>item.split==="holdout")){
    const row=byId.get(item.id);
    if(!row||row.case_sha256!==evaluationCaseSha256(item)||!row.expected_answer.trim()
      ||!goldReviewIsPrecise(item,row.expected_sources,row.review_note??""))
      throw new Error("Frozen Gold review changed");
  }
  const score=scoreAnswerComparison({manifest,candidates:candidates.candidates,verdicts:stored.verdicts});
  return{manifest,blindHash,candidates:candidates.candidates,verdicts:stored.verdicts,gold:byId,score};
}
export async function listHoldoutAnswerReviews(userId:string,input:{offset:number;limit:number;pendingOnly:boolean}){
  const data=await readInputs(userId);
  const candidateByKey=new Map(data.candidates.map(item=>[`${item.caseId}:${item.path}`,item]));
  const verdictByKey=new Map(data.verdicts.map(item=>[`${item.caseId}:${item.path}`,item]));
  const cases=data.manifest.cases.filter(item=>!input.pendingOnly||["v3","vectorless"].some(path=>
    !verdictByKey.has(`${item.caseId}:${path}`)));
  const page=cases.slice(input.offset,input.offset+input.limit);
  const hashes=[...new Set(page.flatMap(item=>[
    ...(data.gold.get(item.caseId)?.expected_sources??[]),
    ...(["v3","vectorless"] as const).flatMap(path=>candidateByKey.get(`${item.caseId}:${path}`)?.citations??[]),
  ].map(source=>source.assetSha256)))];
  const assets=hashes.length?await tenantQuery<{id:string;source_sha256:string}>(userId,
    `select distinct on(a.source_sha256) a.id,a.source_sha256 from knowledge_asset a
      join knowledge_document d on d.id=a.document_id
      join knowledge_tree_version v on v.id=d.current_tree_version_id and v.asset_id=a.id
      where a.source_sha256=any($1::text[]) and a.registration_status='registered'
        and d.status='active' and d.visibility='shared' and v.status='ready'
      order by a.source_sha256,a.created_at desc`,[hashes],"admin"):[];
  const sourceLinks=Object.fromEntries(assets.map(asset=>[asset.source_sha256,`/api/knowledge/assets/${asset.id}`]));
  return{total:cases.length,offset:input.offset,limit:input.limit,reviewed:data.verdicts.length,
    candidateCount:data.candidates.length,profileKey:data.manifest.profileKey,
    items:page.map(item=>({caseId:item.caseId,query:item.query,group:item.group,tags:item.tags,
      expectedOutcome:item.expectedOutcome,goldAnswer:data.gold.get(item.caseId)!.expected_answer,
      goldSources:data.gold.get(item.caseId)!.expected_sources,
      paths:(["v3","vectorless"] as const).map(path=>{
        const candidate=candidateByKey.get(`${item.caseId}:${path}`)!;
        return{path,candidate,candidateSha256:answerCandidateSha256(candidate),
          verdict:verdictByKey.get(`${item.caseId}:${path}`)??null};
      })})),sourceLinks};
}
export async function saveHoldoutAnswerVerdict(userId:string,input:{caseId:string;path:AnswerPath;
  candidateSha256:string;answerCorrect:boolean;preciseCitationCorrect:boolean;note:string}){
  return tenantTransaction(userId,async client=>{
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",["ma24-holdout-verdicts"]);
    const data=await readInputs(userId);
    const candidate=data.candidates.find(item=>item.caseId===input.caseId&&item.path===input.path);
    if(!candidate||answerCandidateSha256(candidate)!==input.candidateSha256)
      throw new Error("Candidate changed; reload before reviewing");
    const verdict:AnswerVerdict={caseId:input.caseId,path:input.path,candidateSha256:input.candidateSha256,
      answerCorrect:input.answerCorrect,preciseCitationCorrect:input.preciseCitationCorrect,
      reviewer:userId,reviewedAt:new Date().toISOString(),note:input.note};
    const next=[...data.verdicts.filter(item=>item.caseId!==input.caseId||item.path!==input.path),verdict];
    scoreAnswerComparison({manifest:data.manifest,candidates:data.candidates,verdicts:next});
    const temporary=`${verdictFile}.${randomUUID()}.next`;
    await writeFile(temporary,JSON.stringify({blindManifestSha256:data.blindHash,verdicts:next},null,2),"utf8");
    await appendFile(historyFile,`${JSON.stringify(verdict)}\n`,"utf8");
    await rename(temporary,verdictFile);
    return{reviewed:next.length,verdict};
  },"admin");
}
