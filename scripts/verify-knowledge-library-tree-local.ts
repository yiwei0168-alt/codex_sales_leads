import nextEnv from "@next/env";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {getPool} from "../src/lib/rag/db";
import {listKnowledgeLibrary} from "../src/lib/knowledge/library-service";

nextEnv.loadEnvConfig(process.cwd());
const url=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
if(!url||!["localhost","127.0.0.1","::1"].includes(new URL(url).hostname))throw new Error("Local PostgreSQL required");
try{
  const page=await listKnowledgeLibrary(OWNER_USER_ID,"shared","WR3000",0,12);
  const sample=page.items.find(item=>item.title.includes("WR3000")) as {id:string;treeStatus:string;treeVersionId:string;sourceSha256:string}|undefined;
  if(!sample||sample.treeStatus!=="searchable"||!sample.treeVersionId||!sample.sourceSha256)throw new Error("Shared library tree status missing");
  console.log(JSON.stringify({local:true,items:page.items.length,sampleDocumentId:sample.id,treeStatus:sample.treeStatus,
    treeVersion:sample.treeVersionId.slice(0,8),sourceHash:sample.sourceSha256.slice(0,8),externalCalls:0}));
}finally{await getPool().end();}
