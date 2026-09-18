import "server-only";
import type {PoolClient} from "pg";
import {buildKnowledgeEvaluationCorpus} from "./evaluation/corpus";
import {correctedFactValueIsValid,evaluationCaseSha256,goldSourcesRequired,retrievalProfileSha256,RAG_V3_RETRIEVAL_PROFILE,type FactReviewDecision,type GoldSourceCoordinate,type KnowledgeFactReviewResponse,type KnowledgeGoldReviewResponse} from "./review-types";
import {tenantQuery,tenantTransaction} from "@/lib/rag/db";

const corpus=buildKnowledgeEvaluationCorpus();

export async function listFactReviews(userId:string,input:{offset:number;limit:number;reason?:string;query?:string;status?:string}):Promise<KnowledgeFactReviewResponse>{
  const query=input.query?.trim()??"";const reason=input.reason?.trim()??"";const status=input.status?.trim()||"open";
  const [items,total,groups]=await Promise.all([
    tenantQuery<KnowledgeFactReviewResponse["items"][number]>(userId,`select q.id as "reviewId",q.release_id as "releaseId",q.reason,q.status,
      e.canonical_key as "entityKey",f.entity_version as "entityVersion",f.market,f.attribute_key as "attributeKey",
      f.raw_value as "rawValue",f.typed_value as "typedValue",f.unit,f.polarity,f.verification_status as "verificationStatus",
      a.id as "assetId",d.title as "documentTitle",a.document_version as "documentVersion",a.source_sha256 as "sourceSha256",
      f.evidence_location as "sourceLocation",left(coalesce(f.evidence_location->>'evidenceText',''),1800) as "evidenceText",
      q.resolution_note as "resolutionNote",q.reviewed_at::text as "reviewedAt",('/api/knowledge/assets/'||a.id)::text as "assetUrl"
      from knowledge_review_queue_v3 q join knowledge_fact_v3 f on f.id=q.fact_id join knowledge_entity e on e.id=f.entity_id
      join knowledge_source_revision_v3 sr on sr.id=f.source_revision_id join knowledge_asset a on a.id=sr.asset_id
      join knowledge_document d on d.id=a.document_id
      where q.status=$1 and($2='' or q.reason=$2)and($3='' or e.canonical_key ilike '%'||$3||'%' or f.attribute_key ilike '%'||$3||'%' or d.title ilike '%'||$3||'%')
      order by case q.reason when 'conflict' then 0 else 1 end,q.created_at,q.id limit $4 offset $5`,[status,reason,query,input.limit,input.offset],"admin"),
    tenantQuery<{count:string}>(userId,`select count(*)::text count from knowledge_review_queue_v3 q join knowledge_fact_v3 f on f.id=q.fact_id join knowledge_entity e on e.id=f.entity_id join knowledge_source_revision_v3 sr on sr.id=f.source_revision_id join knowledge_asset a on a.id=sr.asset_id join knowledge_document d on d.id=a.document_id where q.status=$1 and($2='' or q.reason=$2)and($3='' or e.canonical_key ilike '%'||$3||'%' or f.attribute_key ilike '%'||$3||'%' or d.title ilike '%'||$3||'%')`,[status,reason,query],"admin"),
    tenantQuery<{reason:string;count:string}>(userId,`select reason,count(*)::text count from knowledge_review_queue_v3 where status='open' group by reason order by reason`,[],"admin"),
  ]);
  return{items,total:Number(total[0]?.count??0),offset:input.offset,limit:input.limit,counts:Object.fromEntries(groups.map(item=>[item.reason,Number(item.count)]))};
}

export async function decideFactReview(userId:string,input:{reviewId:string;decision:FactReviewDecision;note:string;correctedValue?:unknown;correctedRawValue?:string;correctedUnit?:string|null}):Promise<void>{
  await tenantTransaction(userId,async(client:PoolClient)=>{
    const result=await client.query<{factId:string;status:string;attributeKey:string}>(`select q.fact_id as "factId",q.status,f.attribute_key as "attributeKey" from knowledge_review_queue_v3 q join knowledge_fact_v3 f on f.id=q.fact_id where q.id=$1 and q.fact_id is not null for update of q`,[input.reviewId]);
    const review=result.rows[0];if(!review)throw new Error("review-not-found");if(review.status!=="open")throw new Error("review-already-resolved");
    if(input.decision==="correct"&&!correctedFactValueIsValid(review.attributeKey,input.correctedValue,input.correctedUnit))throw new Error("invalid-correction");
    const reviewStatus=input.decision==="reject"?"rejected":input.decision==="correct"?"corrected":"accepted";
    const correction=input.decision==="correct"?{rawValue:input.correctedRawValue,typedValue:input.correctedValue,unit:input.correctedUnit??null}:null;
    await client.query(`update knowledge_review_queue_v3 set status=$2,resolution_note=$3,correction=$4::jsonb,reviewed_by=$5,reviewed_at=now() where id=$1`,[input.reviewId,reviewStatus,input.note||null,JSON.stringify(correction),userId]);
    if(input.decision==="verify")await client.query(`update knowledge_fact_v3 set verification_status='verified',verified_at=now() where id=$1`,[review.factId]);
    else if(input.decision==="retain-candidate")await client.query(`update knowledge_fact_v3 set verification_status='candidate',verified_at=null where id=$1`,[review.factId]);
    else if(input.decision==="reject")await client.query(`update knowledge_fact_v3 set verification_status='rejected',verified_at=null where id=$1`,[review.factId]);
    else await client.query(`update knowledge_fact_v3 set typed_value=$2::jsonb,raw_value=$3,unit=$4,verification_status='verified',verified_at=now() where id=$1`,[review.factId,JSON.stringify(input.correctedValue),input.correctedRawValue,input.correctedUnit??null]);
  },"admin");
}

type GoldRow={caseId:string;caseSha256:string;expectedAnswer:string;expectedSources:GoldSourceCoordinate[];reviewNote:string|null;reviewedAt:string;revision:number};
type SuggestionRow={entityKey:string;assetId:string;assetSha256:string;title:string;version:string|null};
export async function listGoldReviews(userId:string,input:{offset:number;limit:number;split?:string;reviewed?:boolean}):Promise<KnowledgeGoldReviewResponse>{
  const [rows,gates,suggestions]=await Promise.all([
    tenantQuery<GoldRow>(userId,`select case_id as "caseId",case_sha256 as "caseSha256",expected_answer as "expectedAnswer",expected_sources as "expectedSources",review_note as "reviewNote",reviewed_at::text as "reviewedAt",revision from knowledge_evaluation_review_v3 where corpus_version=$1`,[corpus.version],"admin"),
    tenantQuery<{corpusVersion:string}>(userId,`select corpus_version as "corpusVersion" from knowledge_evaluation_holdout_gate_v3 where corpus_version=$1`,[corpus.version],"admin"),
    tenantQuery<SuggestionRow>(userId,`select distinct e.canonical_key as "entityKey",a.id as "assetId",a.source_sha256 as "assetSha256",d.title,a.document_version as version from knowledge_release_v3 r join knowledge_chunk_v3 c on c.release_id=r.id join knowledge_chunk_entity_v3 ce on ce.chunk_id=c.id join knowledge_entity e on e.id=ce.entity_id join knowledge_source_revision_v3 sr on sr.id=c.source_revision_id join knowledge_asset a on a.id=sr.asset_id join knowledge_document d on d.id=a.document_id where r.scope_kind='shared' and r.status in('building','validated','active') order by e.canonical_key,d.title`,[],"admin"),
  ]);
  const byId=new Map(rows.map(row=>[row.caseId,row]));const holdoutUnlocked=Boolean(gates[0]);
  const sourceByEntity=new Map<string,SuggestionRow[]>();for(const item of suggestions){const list=sourceByEntity.get(item.entityKey.toLowerCase())??[];list.push(item);sourceByEntity.set(item.entityKey.toLowerCase(),list);}
  let items=corpus.cases.filter(item=>!input.split||item.split===input.split).map(item=>{const row=byId.get(item.id);const reviewed=Boolean(row&&row.caseSha256===evaluationCaseSha256(item));return{...item,caseSha256:evaluationCaseSha256(item),expectedAnswer:reviewed?row!.expectedAnswer:"",expectedSources:reviewed?row!.expectedSources:[],reviewNote:reviewed?row!.reviewNote??"":"",reviewed,reviewedAt:reviewed?row!.reviewedAt:null,revision:reviewed?row!.revision:0,locked:item.split==="holdout"&&!holdoutUnlocked,sourceSuggestions:[...new Map(item.expectedEntities.flatMap(entity=>sourceByEntity.get(entity.toLowerCase())??[]).map(source=>[source.assetSha256,{assetId:source.assetId,assetSha256:source.assetSha256,title:source.title,version:source.version,url:`/api/knowledge/assets/${source.assetId}`}])).values()]};});
  if(input.reviewed!==undefined)items=items.filter(item=>item.reviewed===input.reviewed);
  const total=items.length;items=items.slice(input.offset,input.offset+input.limit);
  const counts=Object.fromEntries((["development","validation","holdout"] as const).map(split=>{const cases=corpus.cases.filter(item=>item.split===split);return[split,{total:cases.length,reviewed:cases.filter(item=>{const row=byId.get(item.id);return Boolean(row&&row.caseSha256===evaluationCaseSha256(item));}).length}];}));
  return{corpusVersion:corpus.version,items,total,offset:input.offset,limit:input.limit,reviewed:rows.filter(row=>corpus.cases.some(item=>item.id===row.caseId&&row.caseSha256===evaluationCaseSha256(item))).length,counts,holdoutUnlocked,retrievalProfileKey:RAG_V3_RETRIEVAL_PROFILE.key,retrievalProfileSha256:retrievalProfileSha256()};
}

export async function saveGoldReview(userId:string,input:{caseId:string;caseSha256:string;expectedAnswer:string;expectedSources:GoldSourceCoordinate[];reviewNote:string}):Promise<void>{
  const item=corpus.cases.find(candidate=>candidate.id===input.caseId);if(!item)throw new Error("case-not-found");
  if(evaluationCaseSha256(item)!==input.caseSha256)throw new Error("case-changed");
  const gates=await tenantQuery<{ok:number}>(userId,`select 1 ok from knowledge_evaluation_holdout_gate_v3 where corpus_version=$1`,[corpus.version],"admin");
  if(item.split==="holdout"&&!gates[0])throw new Error("holdout-locked");
  if(goldSourcesRequired(item)&&input.expectedSources.length===0)throw new Error("sources-required");
  await tenantQuery(userId,`insert into knowledge_evaluation_review_v3(corpus_version,case_id,case_sha256,split,expected_answer,expected_sources,review_note,reviewed_by) values($1,$2,$3,$4,$5,$6::jsonb,$7,$8) on conflict(corpus_version,case_id) do update set case_sha256=excluded.case_sha256,split=excluded.split,expected_answer=excluded.expected_answer,expected_sources=excluded.expected_sources,review_note=excluded.review_note,reviewed_by=excluded.reviewed_by,reviewed_at=now(),revision=knowledge_evaluation_review_v3.revision+1`,[corpus.version,item.id,input.caseSha256,item.split,input.expectedAnswer,JSON.stringify(input.expectedSources),input.reviewNote||null,userId],"admin");
}

export async function unlockGoldHoldout(userId:string,confirmed:boolean):Promise<void>{
  if(!confirmed)throw new Error("confirmation-required");
  const nonHoldout=corpus.cases.filter(item=>item.split!=="holdout");
  const rows=await tenantQuery<{caseId:string;caseSha256:string}>(userId,`select case_id as "caseId",case_sha256 as "caseSha256" from knowledge_evaluation_review_v3 where corpus_version=$1 and split<>'holdout'`,[corpus.version],"admin");
  const reviewed=new Map(rows.map(row=>[row.caseId,row.caseSha256]));
  if(nonHoldout.some(item=>reviewed.get(item.id)!==evaluationCaseSha256(item)))throw new Error("development-review-incomplete");
  await tenantQuery(userId,`insert into knowledge_evaluation_holdout_gate_v3(corpus_version,retrieval_profile_key,retrieval_profile_sha256,frozen_by) values($1,$2,$3,$4) on conflict(corpus_version) do nothing`,[corpus.version,RAG_V3_RETRIEVAL_PROFILE.key,retrievalProfileSha256(),userId],"admin");
}
