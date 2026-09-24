import nextEnv from "@next/env";
import {Pool} from "pg";
import {getPool,tenantQuery} from "../src/lib/rag/db";
import {observeMemory} from "../src/lib/knowledge/temporal-memory";

nextEnv.loadEnvConfig(process.cwd());
const url=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
if(!url||!["localhost","127.0.0.1","::1"].includes(new URL(url).hostname))throw new Error("Local PostgreSQL required");
const apply=process.argv.includes("--apply");
const admin=new Pool({connectionString:url});
type Legacy={id:string;user_id:string;external_id:string;title:string;content:string;kind:string;status:string;
  usage_scope:string;market_codes:string[];channel_roles:string[];context:Record<string,unknown>;created_at:string;updated_at:string};
try{
  const rows=await admin.query<Legacy>(`select id,user_id,external_id,title,content,kind,status,usage_scope,
    market_codes,channel_roles,context,created_at::text,updated_at::text
    from user_outreach_memory order by user_id,created_at,id`);
  let eligible=0,already=0,created=0,invalidated=0,skipped=0;
  for(const row of rows.rows){
    // Historical approved claims and archived entries keep their old status and review boundary.
    if(row.kind!=="email-style"||row.usage_scope!=="internal-learning"){
      skipped++;continue;
    }
    if(row.market_codes.some(code=>!/^[A-Z]{2}$/.test(code))){skipped++;continue;}
    eligible++;
    const key=`legacy-outreach:${row.id}:${row.updated_at}`;
    const existing=await tenantQuery<{id:string}>(row.user_id,
      "select id from agent_memory_observation where owner_id=$1 and idempotency_key=$2",[row.user_id,key]);
    if(existing.length){already++;continue;}
    const [prior]=await tenantQuery<{id:string}>(row.user_id,`select m.id from agent_memory_observation m
      where m.owner_id=$1 and m.source_receipt->>'type'='legacy-user-outreach-memory'
        and m.source_receipt->>'legacyId'=$2
        and not exists(select 1 from agent_memory_observation r where r.owner_id=$1
          and (r.corrects_id=m.id or r.invalidates_id=m.id))
      order by m.recorded_at desc,m.id desc limit 1`,[row.user_id,row.id]);
    if(row.status==="archived"){
      if(!prior){skipped++;continue;}
      if(apply){await observeMemory(row.user_id,{kind:"experience",content:`Archived legacy memory ${row.id}`,
        invalidatesId:prior.id,idempotencyKey:key,
        sourceReceipt:{type:"legacy-user-outreach-memory-archive",legacyId:row.id,status:row.status,updatedAt:row.updated_at}});
        invalidated++;}
      continue;
    }
    if(row.status!=="active"){skipped++;continue;}
    if(!apply)continue;
    await observeMemory(row.user_id,{kind:"preference",content:row.content,memoryKey:`legacy-outreach:${row.external_id}`,
      marketCodes:row.market_codes,idempotencyKey:key,correctsId:prior?.id,
      sourceReceipt:{type:"legacy-user-outreach-memory",legacyId:row.id,externalId:row.external_id,
        title:row.title,kind:row.kind,status:row.status,usageScope:row.usage_scope,
        channelRoles:row.channel_roles,context:row.context,createdAt:row.created_at,updatedAt:row.updated_at}});
    created++;
  }
  console.log(JSON.stringify({local:true,apply,total:rows.rowCount,eligible,already,created,invalidated,skipped,
    businessValidity:"unknown",externalCalls:0,embeddingCalls:0}));
}finally{await admin.end();await getPool().end();}
