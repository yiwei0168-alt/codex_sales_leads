import {randomUUID} from "node:crypto";
import nextEnv from "@next/env";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {getPool,tenantQuery,tenantTransaction} from "../src/lib/rag/db";
import {sha256} from "../src/lib/rag/chunker";
import {indexTextRevision,textEvidenceRanges} from "../src/lib/knowledge/text-tree";
import {browseTree,readEvidence,searchDocuments} from "../src/lib/knowledge/vectorless";

nextEnv.loadEnvConfig(process.cwd());
const url=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
if(!url||!["localhost","127.0.0.1","::1"].includes(new URL(url).hostname))throw new Error("Local PostgreSQL required");
const other=randomUUID();
const externalId=`ma24-inline-${randomUUID()}`;
const title="MA24 local inline text";
const content="MA24 private inline evidence 😀\n"+"细节与精确坐标。".repeat(400);
const contentHash=sha256(content);
const ranges=textEvidenceRanges(content);
if(ranges.map(range=>range.content).join("")!==content||ranges.some(range=>Array.from(content).slice(range.start,range.end).join("")!==range.content))throw new Error("Unicode offsets are not exact");
let documentId="",evidenceId="";
try{
  await tenantTransaction(OWNER_USER_ID,async client=>{
    documentId=(await client.query<{id:string}>(`insert into knowledge_document
      (collection_id,external_id,title,source_type,authority_level,language,content_sha256,status,owner_id,visibility)
      values((select id from knowledge_collection where slug='industry'),$1,$2,'private-text',2,'zh-CN',$3,'active',$4,'private') returning id`,
      [externalId,title,contentHash,OWNER_USER_ID])).rows[0].id;
    await client.query(`insert into knowledge_document_revision(document_id,user_id,content_sha256,title,content,reconstructed)
      values($1,$2,$3,$4,$5,false)`,[documentId,OWNER_USER_ID,contentHash,title,content]);
    await indexTextRevision(client,documentId,content,contentHash,title);
  });
  const found=await searchDocuments(OWNER_USER_ID,"MA24");
  const denied=await searchDocuments(other,"MA24");
  const units=await browseTree(OWNER_USER_ID,documentId);
  const leaves=await browseTree(OWNER_USER_ID,documentId,units[0]?.id);
  evidenceId=leaves[0]?.id;
  const evidence=await readEvidence(OWNER_USER_ID,evidenceId);
  if(!found.some(row=>row.documentId===documentId)||denied.some(row=>row.documentId===documentId)
    ||!evidence||evidence.content!==ranges[0].content||await readEvidence(other,evidenceId))throw new Error("Inline text search or account boundary failed");
  await tenantQuery(OWNER_USER_ID,"update knowledge_document set content_sha256=$2 where id=$1",[documentId,sha256("revised")]);
  if(await readEvidence(OWNER_USER_ID,evidenceId))throw new Error("Old text revision remained citable");
  await tenantQuery(OWNER_USER_ID,"update knowledge_document set content_sha256=$2 where id=$1",[documentId,contentHash]);
  await tenantQuery(OWNER_USER_ID,"delete from knowledge_document where id=$1 and owner_id=$2",[documentId,OWNER_USER_ID]);
  if(await readEvidence(OWNER_USER_ID,evidenceId))throw new Error("Deleted text remained citable");
  console.log(JSON.stringify({local:true,source:"immutable-text-revision",rangeCount:ranges.length,crossAccountDenied:true,oldRevisionDenied:true,deleteDenied:true}));
}finally{
  if(documentId)await tenantQuery(OWNER_USER_ID,"update knowledge_document set current_tree_version_id=null where id=$1",[documentId]).catch(()=>undefined);
  if(documentId)await tenantQuery(OWNER_USER_ID,"delete from knowledge_document where id=$1",[documentId]).catch(()=>undefined);
  await getPool().end();
}
