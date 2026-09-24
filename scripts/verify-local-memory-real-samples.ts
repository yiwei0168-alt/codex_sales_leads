import nextEnv from "@next/env";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {getPool,tenantQuery} from "../src/lib/rag/db";
import {extractLocalPreferences} from "../src/lib/knowledge/local-memory-extraction";

nextEnv.loadEnvConfig(process.cwd());
const databaseUrl=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
if(!databaseUrl||!["localhost","127.0.0.1","::1"].includes(new URL(databaseUrl).hostname))throw new Error("Local PostgreSQL required");
try{
  const rows=await tenantQuery<{content:string}>(OWNER_USER_ID,`select m.content from agent_run r
    join assistant_message m on m.user_id=r.user_id and m.conversation_id=r.conversation_id
      and m.metadata->>'runId'=r.id::text and m.role='user'
    where r.user_id=$1 and r.status='completed' and r.execution_kind='main-agent'
      and length(m.content) between 10 and 12000
    order by r.created_at desc,m.created_at asc limit 5`,[OWNER_USER_ID]);
  let accepted=0,empty=0,rejected=0;
  for(const row of rows){
    try{const items=await extractLocalPreferences(row.content);if(items.length)accepted++;else empty++;}
    catch{rejected++;}
  }
  console.log(JSON.stringify({local:true,model:"qwen3:8b",sampleCount:rows.length,accepted,empty,rejected,persisted:0}));
  if(!rows.length||rejected)process.exitCode=1;
}finally{await getPool().end();}
