import nextEnv from "@next/env";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {getPool,tenantQuery} from "../src/lib/rag/db";
import {browseTree,readEvidence,searchDocuments} from "../src/lib/knowledge/vectorless";

nextEnv.loadEnvConfig(process.cwd());
const url=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
if(!url||!["localhost","127.0.0.1","::1"].includes(new URL(url).hostname))throw new Error("Local PostgreSQL required");
try{
  const [counts]=await tenantQuery<{eligible:number;ready:number}>(OWNER_USER_ID,`select count(*)::int eligible,
    count(*) filter(where d.current_tree_version_id=v.id and v.status='ready' and v.asset_id=a.id)::int ready
    from knowledge_release_pointer_v3 p join knowledge_source_revision_v3 sr on sr.release_id=p.release_id
    join knowledge_asset a on a.id=sr.asset_id join knowledge_document d on d.id=a.document_id
    left join knowledge_tree_version v on v.document_id=d.id and v.source_sha256=sr.source_sha256
      and v.extractor_version='docling-v3.0.3-release-tree-v1'
    where p.scope_kind='shared' and d.visibility='shared' and d.status='active' and a.registration_status='registered'`,[],"admin");
  const documents=await searchDocuments(OWNER_USER_ID,"WR3000");
  const sample=documents.find(item=>item.title.includes("WR3000"));
  if(!sample)throw new Error("WR3000 source not found");
  const units=await browseTree(OWNER_USER_ID,sample.documentId);
  const leaves=units[0]?await browseTree(OWNER_USER_ID,sample.documentId,units[0].id):[];
  const evidence=leaves[0]?await readEvidence(OWNER_USER_ID,leaves[0].id):null;
  if(!evidence||!evidence.source_location.v3ChunkId||counts.ready!==counts.eligible)throw new Error("Active release tree coverage or source coordinate missing");
  console.log(JSON.stringify({local:true,eligible:counts.eligible,ready:counts.ready,queryCandidates:documents.length,
    sampleDocumentId:sample.documentId,units:units.length,sourceLocation:evidence.source_location,externalCalls:0}));
}finally{await getPool().end();}
