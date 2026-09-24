import nextEnv from "@next/env";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {getPool} from "../src/lib/rag/db";
import {searchMemoryWithGraph} from "../src/lib/knowledge/memory-graph-search";

nextEnv.loadEnvConfig(process.cwd());
const url=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
if(!url||!["localhost","127.0.0.1","::1"].includes(new URL(url).hostname))throw new Error("Local PostgreSQL required");
try{
  const now=new Date().toISOString();
  const result=await searchMemoryWithGraph(OWNER_USER_ID,"ma24-synthetic-graph-outage",now,now);
  if(result.path!=="postgres")throw new Error("Neo4j outage did not fall back to PostgreSQL");
  console.log(JSON.stringify({local:true,graphUnavailable:true,postgresFallback:true}));
}finally{await getPool().end();}
