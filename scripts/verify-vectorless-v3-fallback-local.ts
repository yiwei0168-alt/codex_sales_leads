import nextEnv from "@next/env";
import {Pool} from "pg";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {getPool,tenantQuery} from "../src/lib/rag/db";
import {browseSessionTree,readSessionEvidence,searchSessionDocuments,startVectorlessSession,supplementSessionFromV3} from "../src/lib/knowledge/vectorless-session";

nextEnv.loadEnvConfig(process.cwd());
const databaseUrl=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
if(!databaseUrl||!["localhost","127.0.0.1","::1"].includes(new URL(databaseUrl).hostname))throw new Error("Local PostgreSQL required");
const cleanup=new Pool({connectionString:databaseUrl});
let sessionId="";
try{
  sessionId=await startVectorlessSession(OWNER_USER_ID,"WR3000");
  const primary=await searchSessionDocuments(OWNER_USER_ID,sessionId);
  if(primary.status!=="ok"||!primary.documents.length)throw new Error("Primary candidates missing");
  const fallback=await supplementSessionFromV3(OWNER_USER_ID,sessionId);
  if(fallback.status!=="ok"||!fallback.v3CandidateOnly)throw new Error("V3 fallback receipt missing");
  if(fallback.documents.some(document=>"content" in document||"sourceUrl" in document))
    throw new Error("Legacy chunk body escaped candidate-only path");
  const replay=await supplementSessionFromV3(OWNER_USER_ID,sessionId);
  if(replay.status!=="partial")throw new Error("Fallback was repeated");
  const receipt=await tenantQuery<{operation:string;result:{proposedChunkIds:string[];validatedDocumentIds:string[];addedDocumentIds:string[]}}>(OWNER_USER_ID,
    "select operation,result from knowledge_retrieval_step where session_id=$1 and operation='v3-candidate'",[sessionId]);
  if(receipt.length!==1||!Array.isArray(receipt[0].result.proposedChunkIds))throw new Error("Candidate route was not receipted");
  let reread=false;
  if(fallback.documents[0]){
    const roots=await browseSessionTree(OWNER_USER_ID,sessionId,fallback.documents[0].documentId);
    if(roots.status!=="ok")throw new Error("Current tree rejected validated candidate");
    const leaves=roots.nodes[0]?await browseSessionTree(OWNER_USER_ID,sessionId,fallback.documents[0].documentId,roots.nodes[0].id):null;
    if(leaves?.status==="ok"&&leaves.nodes[0]){
      const evidence=await readSessionEvidence(OWNER_USER_ID,sessionId,leaves.nodes[0].id);
      reread=evidence.status==="ok"&&Boolean(evidence.evidence?.content);
    }
  }
  console.log(JSON.stringify({local:true,primaryCandidates:primary.documents.length,
    proposedChunks:receipt[0].result.proposedChunkIds.length,validatedDocuments:receipt[0].result.validatedDocumentIds.length,
    addedDocuments:fallback.documents.length,legacyBodyReturned:false,replayDenied:true,currentEvidenceReread:reread,
    externalCalls:0,embeddingCalls:0}));
}finally{
  try{if(sessionId){await cleanup.query("delete from knowledge_retrieval_step where session_id=$1",[sessionId]);
    await cleanup.query("delete from knowledge_retrieval_session where id=$1",[sessionId]);}}
  finally{await cleanup.end();await getPool().end();}
}
