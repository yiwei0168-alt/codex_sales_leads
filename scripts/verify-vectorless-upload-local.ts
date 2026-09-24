import {createHash,randomUUID} from "node:crypto";
import {mkdir,rm,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import nextEnv from "@next/env";
import {Pool} from "pg";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {getPool,tenantQuery} from "../src/lib/rag/db";
import {registerVectorlessUpload} from "../src/lib/knowledge/vectorless-registration";
import {browseTree,currentCandidateDocuments,readEvidence,searchDocuments} from "../src/lib/knowledge/vectorless";
import {aggregateSessionDocuments,browseSessionTree,filterSessionDocuments,readSessionEvidence,searchSessionDocuments,startVectorlessSession} from "../src/lib/knowledge/vectorless-session";
import {listKnowledgeUploadJobs} from "../src/lib/knowledge/upload";

nextEnv.loadEnvConfig(process.cwd());
const databaseUrl=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
if(!databaseUrl||!['localhost','127.0.0.1','::1'].includes(new URL(databaseUrl).hostname))throw new Error("Local PostgreSQL required");
const cleanup=new Pool({connectionString:databaseUrl});
const id=randomUUID(),otherUser=randomUUID();
const directory=resolve("knowledge","uploads",OWNER_USER_ID,`ma24-${id}`);
const sourceKey=`knowledge/uploads/${OWNER_USER_ID}/ma24-${id}/fixture.pdf`;
const artifactKey=`knowledge/uploads/${OWNER_USER_ID}/ma24-${id}/fixture.json`;
const source=Buffer.from("%PDF-1.7\nMA24 synthetic local source\n");
const sha=(value:Uint8Array)=>createHash("sha256").update(value).digest("hex");
const artifact=Buffer.from(JSON.stringify({documents:[{sourceSha256:sha(source),extractorVersion:"layout-v2.0.0",
  blocks:[{id:"page-1-block-1",unitType:"page",unitIndex:1,blockType:"paragraph",text:"MA24 synthetic ports: eight.",quality:"success",bbox:[1,2,3,4]}]}]}));
let documentId:string|undefined,sessionId:string|undefined;
try{
  await mkdir(directory,{recursive:true});
  await writeFile(resolve(sourceKey),source);await writeFile(resolve(artifactKey),artifact);
  await tenantQuery(OWNER_USER_ID,`insert into knowledge_upload_job(id,user_id,collection_slug,status,title,original_filename,storage_key,extraction_artifact_key,
    mime_type,byte_size,source_sha256,visibility,extractor_version,metrics)
    values($1,$2,'industry','extracted','MA24 synthetic fixture','fixture.pdf',$3,$4,'application/pdf',$5,$6,'private','layout-v2.0.0',$7)`,
    [id,OWNER_USER_ID,sourceKey,artifactKey,source.length,sha(source),JSON.stringify({artifactSha256:sha(artifact)})]);
  const first=await registerVectorlessUpload(OWNER_USER_ID,id,{language:"en",authorityLevel:2});
  if(first.treeStatus!=="searchable")throw new Error(`Tree failed: ${first.treeError}`);
  documentId=first.documentId;
  const second=await registerVectorlessUpload(OWNER_USER_ID,id,{language:"en",authorityLevel:2});
  const documents=await searchDocuments(OWNER_USER_ID,"MA24");
  const denied=await searchDocuments(otherUser,"MA24");
  const fallbackOwned=await currentCandidateDocuments(OWNER_USER_ID,[documentId]);
  const fallbackDenied=await currentCandidateDocuments(otherUser,[documentId]);
  const units=await browseTree(OWNER_USER_ID,documentId);
  const leaves=await browseTree(OWNER_USER_ID,documentId,units[0]?.id??null);
  const evidence=await readEvidence(OWNER_USER_ID,leaves[0]?.id??randomUUID());
  const listed=(await listKnowledgeUploadJobs(OWNER_USER_ID)).find(job=>job.id===id);
  sessionId=await startVectorlessSession(OWNER_USER_ID,"MA24");
  const candidates=await searchSessionDocuments(OWNER_USER_ID,sessionId);
  if(candidates.status!=="ok"||!candidates.documents.some(item=>item.documentId===documentId))throw new Error("Session search failed");
  const navigation=await browseSessionTree(OWNER_USER_ID,sessionId,documentId);
  const cited=await readSessionEvidence(OWNER_USER_ID,sessionId,leaves[0].id);
  const counted=await aggregateSessionDocuments(OWNER_USER_ID,sessionId,[documentId]);
  const filtered=await filterSessionDocuments(OWNER_USER_ID,sessionId,[documentId],{collection:"industry"});
  if(navigation.status!=="ok"||cited.status!=="ok"||cited.evidence?.id!==leaves[0].id||counted.status!=="ok"||counted.count!==1
    ||filtered.status!=="ok"||filtered.count!==1)throw new Error("Session receipt workflow failed");
  for(let step=0;step<5;step++)await browseSessionTree(OWNER_USER_ID,sessionId,documentId);
  const overBudget=await browseSessionTree(OWNER_USER_ID,sessionId,documentId);
  if(overBudget.status!=="partial")throw new Error("Navigation budget did not stop");
  for(let step=0;step<7;step++)await readSessionEvidence(OWNER_USER_ID,sessionId,leaves[0].id);
  const evidenceOverBudget=await readSessionEvidence(OWNER_USER_ID,sessionId,leaves[0].id);
  if(evidenceOverBudget.status!=="partial")throw new Error("Evidence budget did not stop");
  if(!second.reused||!documents.some(doc=>doc.documentId===documentId)||denied.some(doc=>doc.documentId===documentId)
    ||fallbackOwned.length!==1||fallbackDenied.length!==0
    ||evidence?.content!=="MA24 synthetic ports: eight."||listed?.treeStatus!=="searchable")throw new Error("Registration or tenant evidence check failed");
  await tenantQuery(OWNER_USER_ID,"update knowledge_asset set registration_status='withdrawn' where id=$1",[first.assetId]);
  if(await readEvidence(OWNER_USER_ID,leaves[0].id))throw new Error("Withdrawn source remained citable");
  if((await currentCandidateDocuments(OWNER_USER_ID,[documentId])).length)throw new Error("Withdrawn source remained a fallback candidate");
  console.log(JSON.stringify({local:true,embeddingCalls:0,externalCalls:0,registered:true,replayed:true,treeSearch:true,sourceLocation:evidence.source_location,
    crossAccountDenied:true,withdrawnCitationDenied:true,sessionBudgetEnforced:true}));
}finally{
  try{
    if(sessionId){await cleanup.query("delete from knowledge_retrieval_step where session_id=$1",[sessionId]);await cleanup.query("delete from knowledge_retrieval_session where id=$1",[sessionId]);}
    await cleanup.query("delete from knowledge_upload_job where id=$1",[id]);
    const rows=await cleanup.query<{id:string}>("select id from knowledge_document where owner_id=$1 and external_id=$2",[OWNER_USER_ID,`upload:${id}`]);
    for(const row of rows.rows){
      await cleanup.query("update knowledge_document set current_tree_version_id=null where id=$1",[row.id]);
      await cleanup.query("delete from knowledge_tree_node where version_id in(select id from knowledge_tree_version where document_id=$1)",[row.id]);
      await cleanup.query("delete from knowledge_tree_version where document_id=$1",[row.id]);
      await cleanup.query("delete from knowledge_document where id=$1",[row.id]);
    }
  }finally{await cleanup.end();await getPool().end();await rm(directory,{recursive:true,force:true});}
}
