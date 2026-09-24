import nextEnv from "@next/env";
import {Pool} from "pg";
import {tenantTransaction,getPool} from "../src/lib/rag/db";
import {indexTextRevision} from "../src/lib/knowledge/text-tree";

nextEnv.loadEnvConfig(process.cwd());
const url=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
if(!url||!["localhost","127.0.0.1","::1"].includes(new URL(url).hostname))throw new Error("Local PostgreSQL required");
const apply=process.argv.includes("--apply");
const limitArg=process.argv.find(arg=>arg.startsWith("--limit="));
const limit=Math.min(500,Math.max(1,Number(limitArg?.split("=")[1]??50)));
if(!Number.isInteger(limit))throw new Error("Integer --limit required");
const admin=new Pool({connectionString:url});
type Row={id:string;owner_id:string;role:"admin"|"member";title:string;content_sha256:string;content:string};
let built=0,failed=0;
try{
  const {rows}=await admin.query<Row>(`select d.id,d.owner_id,u.role,d.title,d.content_sha256,r.content
    from knowledge_document d join app_user u on u.id=d.owner_id
    join knowledge_document_revision r on r.document_id=d.id and r.content_sha256=d.content_sha256 and not r.reconstructed
    where d.status='active' and u.status='active' and d.visibility in('private','shared')
      and not exists(select 1 from knowledge_asset a where a.document_id=d.id)
      and (d.current_tree_version_id is null or not exists(select 1 from knowledge_tree_version v
        where v.id=d.current_tree_version_id and v.source_sha256=d.content_sha256 and v.status='ready'))
      and length(r.content) between 1 and 2000000
    order by d.id limit $1`,[limit]);
  if(apply){
    for(const row of rows){
      try{
        await tenantTransaction(row.owner_id,async client=>{
          await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[row.id]);
          const current=await client.query<{content_sha256:string;status:string}>("select content_sha256,status from knowledge_document where id=$1 and owner_id=$2 for update",[row.id,row.owner_id]);
          if(current.rows[0]?.content_sha256!==row.content_sha256||current.rows[0]?.status!=="active")return;
          await indexTextRevision(client,row.id,row.content,row.content_sha256,row.title);
          built++;
        },row.role);
      }catch(error){failed++;console.error(JSON.stringify({documentId:row.id,error:error instanceof Error?error.message:"unknown"}));}
    }
  }
  console.log(JSON.stringify({local:true,mode:apply?"apply":"dry-run",eligible:rows.length,built,failed,limit,externalCalls:0}));
  if(failed)process.exitCode=1;
}finally{await admin.end();await getPool().end();}
