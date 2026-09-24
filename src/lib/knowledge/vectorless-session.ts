import {createHash} from "node:crypto";
import {tenantQuery} from "@/lib/rag/db";
import {hybridSearch} from "@/lib/rag/repository";
import {aggregateDocumentSet,browseTree,currentCandidateDocuments,filterDocumentSet,modelTokensInQuery,readEvidence,searchDocuments} from "./vectorless";

type Session={id:string;candidate_ids:string[];matched_count:number;search_used:number;navigation_used:number;evidence_used:number};
type Partial={status:"partial";reason:string;unsearchedDocumentIds:string[];beyondCandidateCount:number};
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
async function session(userId:string,sessionId:string){
  const [current]=await tenantQuery<Session>(userId,`select id,candidate_ids,matched_count,search_used,navigation_used,evidence_used
    from knowledge_retrieval_session where id=$1 and owner_id=$2`,[sessionId,userId]);
  if(!current)throw new Error("Owned retrieval session required");
  return current;
}
async function receipt(userId:string,sessionId:string,operation:string,request:Record<string,unknown>,result:Record<string,unknown>){
  await tenantQuery(userId,`insert into knowledge_retrieval_step(session_id,operation,request,result) values($1,$2,$3,$4)`,
    [sessionId,operation,JSON.stringify(request),JSON.stringify(result)]);
}
async function reserve(userId:string,sessionId:string,kind:"search"|"navigation"|"evidence"){
  const column=kind==="search"?"search_used":kind==="navigation"?"navigation_used":"evidence_used";
  const ceiling=kind==="search"?1:8;
  const rows=await tenantQuery<{count:number}>(userId,`update knowledge_retrieval_session set ${column}=${column}+1
    where id=$1 and owner_id=$2 and ${column}<$3 returning ${column} as count`,[sessionId,userId,ceiling]);
  return Boolean(rows[0]);
}
async function limit(userId:string,sessionId:string,reason:string):Promise<Partial>{
  const current=await session(userId,sessionId);
  const visited=await tenantQuery<{documentId:string}>(userId,`select distinct document_id as "documentId" from(
    select request->>'documentId' document_id from knowledge_retrieval_step where session_id=$1 and operation='browse'
    union all select result->>'documentId' from knowledge_retrieval_step where session_id=$1 and operation='read') x
    where document_id is not null`,[sessionId]);
  const visitedIds=new Set(visited.map(row=>row.documentId));
  const unsearchedDocumentIds=current.candidate_ids.filter(id=>!visitedIds.has(id));
  const beyondCandidateCount=Math.max(0,current.matched_count-current.candidate_ids.length);
  await receipt(userId,sessionId,"budget-exceeded",{reason},{unsearchedDocumentIds,beyondCandidateCount});
  return {status:"partial",reason,unsearchedDocumentIds,beyondCandidateCount};
}
export async function startVectorlessSession(userId:string,question:string){
  if(!question.trim()||question.length>4000)throw new Error("Question required within 4000 characters");
  const [row]=await tenantQuery<{id:string}>(userId,`insert into knowledge_retrieval_session(owner_id,question) values($1,$2) returning id`,[userId,question.trim()]);
  return row.id;
}
export async function searchSessionDocuments(userId:string,sessionId:string,filters:{market?:string;companyId?:string;productId?:string}={}){
  const current=await session(userId,sessionId);
  if(!await reserve(userId,sessionId,"search"))return limit(userId,sessionId,"search budget exhausted");
  const [record]=await tenantQuery<{question:string}>(userId,"select question from knowledge_retrieval_session where id=$1",[sessionId]);
  const documents=await searchDocuments(userId,record.question,filters);
  const ids=documents.map(document=>document.documentId);
  const matchedCount=documents[0]?.totalCount??0;
  await tenantQuery(userId,`update knowledge_retrieval_session set candidate_ids=$2::uuid[],matched_count=$3 where id=$1`,[sessionId,ids,matchedCount]);
  await receipt(userId,sessionId,"search",{filters,questionSha256:digest(record.question)},
    {candidateIds:ids,matchedCount,unsearchedDocuments:Math.max(0,matchedCount-ids.length)});
  return {status:"ok" as const,documents,matchedCount,partial:matchedCount>ids.length,
    unsearchedDocuments:Math.max(0,matchedCount-ids.length),candidateLimit:24,sessionId:current.id};
}
/** Use the active v3 release only to propose more document IDs; never return its chunk text as evidence. */
export async function supplementSessionFromV3(userId:string,sessionId:string){
  const current=await session(userId,sessionId);
  if(current.search_used!==1)throw new Error("Search this session before requesting fallback candidates");
  const claimed=await tenantQuery<{id:string}>(userId,`update knowledge_retrieval_session set fallback_used=true
    where id=$1 and owner_id=$2 and fallback_used=false returning id`,[sessionId,userId]);
  if(!claimed[0])return limit(userId,sessionId,"v3 candidate fallback already used");
  const activeRelease=await tenantQuery<{release_id:string}>(userId,`select release_id from knowledge_release_pointer_v3
    where scope_kind='shared' order by activated_at desc limit 1`);
  if(!activeRelease.length){
    await receipt(userId,sessionId,"v3-candidate",{activeRelease:false},{proposedChunkIds:[],validatedDocumentIds:[],addedDocumentIds:[]});
    return {status:"ok" as const,documents:[],sessionId,partial:false,unsearchedDocuments:0,candidateLimit:24,v3CandidateOnly:true};
  }
  const [record]=await tenantQuery<{question:string}>(userId,"select question from knowledge_retrieval_session where id=$1",[sessionId]);
  const chunks=await hybridSearch(userId,record.question,null,
    {structuredProductTerms:modelTokensInQuery(record.question),lexicalQuery:record.question},40);
  const proposed=[...new Set(chunks.map(chunk=>chunk.documentId))];
  const validated=await currentCandidateDocuments(userId,proposed);
  const extra=validated.filter(document=>!current.candidate_ids.includes(document.documentId));
  const remaining=Math.max(0,24-current.candidate_ids.length);
  const added=extra.slice(0,remaining);
  const candidateIds=[...current.candidate_ids,...added.map(document=>document.documentId)];
  const matchedCount=current.matched_count+extra.length;
  await tenantQuery(userId,`update knowledge_retrieval_session set candidate_ids=$2::uuid[],matched_count=$3
    where id=$1 and owner_id=$4`,[sessionId,candidateIds,matchedCount,userId]);
  await receipt(userId,sessionId,"v3-candidate",{questionSha256:digest(record.question)},
    {proposedChunkIds:chunks.map(chunk=>chunk.id),validatedDocumentIds:validated.map(document=>document.documentId),
      addedDocumentIds:added.map(document=>document.documentId),unsearchedDocuments:Math.max(0,matchedCount-candidateIds.length)});
  return {status:"ok" as const,documents:added,sessionId,partial:matchedCount>candidateIds.length,
    unsearchedDocuments:Math.max(0,matchedCount-candidateIds.length),candidateLimit:24,v3CandidateOnly:true};
}
export async function browseSessionTree(userId:string,sessionId:string,documentId:string,parentId:string|null=null){
  const current=await session(userId,sessionId);
  if(!current.candidate_ids.includes(documentId))throw new Error("Document is outside this session's candidate set");
  if(!await reserve(userId,sessionId,"navigation"))return limit(userId,sessionId,"navigation budget exhausted");
  const nodes=await browseTree(userId,documentId,parentId);
  await receipt(userId,sessionId,"browse",{documentId,parentId},{nodeIds:nodes.map(node=>node.id),count:nodes.length});
  return {status:"ok" as const,nodes,partial:nodes.length===200};
}
export async function readSessionEvidence(userId:string,sessionId:string,nodeId:string){
  const current=await session(userId,sessionId);
  if(!await reserve(userId,sessionId,"evidence"))return limit(userId,sessionId,"evidence budget exhausted");
  const evidence=await readEvidence(userId,nodeId);
  const authorized=evidence&&current.candidate_ids.includes(evidence.documentId)?evidence:null;
  await receipt(userId,sessionId,"read",{nodeId},{found:Boolean(authorized),documentId:authorized?.documentId??null,
    sourceSha256:authorized?.source_sha256??null,sourceLocation:authorized?.source_location??null,
    contentSha256:authorized?digest(authorized.content):null});
  return {status:"ok" as const,evidence:authorized};
}
export async function aggregateSessionDocuments(userId:string,sessionId:string,documentIds:string[]){
  const current=await session(userId,sessionId);
  if(documentIds.some(id=>!current.candidate_ids.includes(id)))throw new Error("Document is outside this session's candidate set");
  if(!await reserve(userId,sessionId,"navigation"))return limit(userId,sessionId,"navigation budget exhausted");
  const result=await aggregateDocumentSet(userId,documentIds);
  await receipt(userId,sessionId,"aggregate",{documentIds},{...result});
  return {status:"ok" as const,...result};
}
export async function filterSessionDocuments(userId:string,sessionId:string,documentIds:string[],filters:{market?:string;companyId?:string;productId?:string;collection?:string;capturedFrom?:string;capturedBefore?:string}){
  const current=await session(userId,sessionId);
  if(documentIds.some(id=>!current.candidate_ids.includes(id)))throw new Error("Document is outside this session's candidate set");
  if(!await reserve(userId,sessionId,"navigation"))return limit(userId,sessionId,"navigation budget exhausted");
  const result=await filterDocumentSet(userId,documentIds,filters);
  await receipt(userId,sessionId,"filter",{documentIds,filters},{...result});
  return {status:"ok" as const,...result};
}
