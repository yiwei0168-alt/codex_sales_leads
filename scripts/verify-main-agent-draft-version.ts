import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import nextEnv from "@next/env";
import {Pool} from "pg";
import {databaseConnectionString,databaseSslConfiguration} from "../src/lib/rag/database-ssl";
import {getPool} from "../src/lib/rag/db";
import {readDevelopmentDraft,updateDevelopmentDraftVersioned} from "../src/lib/outreach/repository";

nextEnv.loadEnvConfig(process.cwd());
const url=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
if(!url)throw new Error("Database configuration required");
if(process.env.DATABASE_URL){
  const a=new URL(url),b=new URL(process.env.DATABASE_URL);
  assert.equal(`${a.hostname}:${a.port||"5432"}${a.pathname}`,`${b.hostname}:${b.port||"5432"}${b.pathname}`);
}
const admin=new Pool({connectionString:databaseConnectionString(url),ssl:databaseSslConfiguration(url)});
const owner=randomUUID(),other=randomUUID(),workspace=randomUUID(),company=randomUUID(),draft=randomUUID();
const external=`synthetic-${randomUUID()}`;
let created=false,checks=0;
try{
  const client=await admin.connect();
  try{
    await client.query("begin");
    for(const id of [owner,other])await client.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic draft version','member','disabled')",[id,`${id}@example.invalid`]);
    await client.query("insert into market_workspace(id,owner_id,slug,name,market,country_code) values($1,$2,'global-sales','Synthetic draft version','Germany','DE')",[workspace,owner]);
    await client.query("insert into sales_company(id,external_id,canonical_name,domain,country_code) values($1,$2,'Synthetic draft version',$3,'DE')",[company,external,`${external}.invalid`]);
    await client.query("insert into outreach_draft(id,user_id,workspace_id,company_id,strategy,body,model,prompt_version,market_country_code) values($1,$2,$3,$4,'{}','Original synthetic draft','synthetic','fixture','DE')",[draft,owner,workspace,company]);
    await client.query("commit");created=true;
  }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  const read=async()=>{
    const row=await admin.query<{revision:number;status:string;manual_body:string|null}>("select revision,status,manual_body from outreach_draft where id=$1 and user_id=$2",[draft,owner]);
    return row.rows[0];
  };
  assert.deepEqual(await read(),{revision:1,status:"generated",manual_body:null});checks++;
  assert.equal((await readDevelopmentDraft(owner,draft))?.revision,1);checks++;
  assert.equal(await readDevelopmentDraft(other,draft),null);checks++;
  const edited=await updateDevelopmentDraftVersioned(owner,draft,{body:"First synthetic revision",expectedRevision:1});
  assert.deepEqual(edited,{status:"updated",revision:2,draftStatus:"generated"});checks++;
  assert.equal((await read()).manual_body,"First synthetic revision");checks++;
  assert.equal((await readDevelopmentDraft(owner,draft))?.body,"First synthetic revision");checks++;
  assert.deepEqual(await updateDevelopmentDraftVersioned(owner,draft,{body:"Stale overwrite",expectedRevision:1}),{status:"conflict"});checks++;
  assert.equal((await read()).manual_body,"First synthetic revision");checks++;
  assert.deepEqual(await updateDevelopmentDraftVersioned(other,draft,{approve:true,expectedRevision:2}),{status:"not-found"});checks++;
  assert.deepEqual(await updateDevelopmentDraftVersioned(owner,draft,{approve:true,expectedRevision:2}),{status:"updated",revision:2,draftStatus:"approved"});checks++;
  assert.deepEqual(await updateDevelopmentDraftVersioned(owner,draft,{approve:true,expectedRevision:2}),{status:"updated",revision:2,draftStatus:"approved"});checks++;
  assert.deepEqual(await updateDevelopmentDraftVersioned(owner,draft,{body:"Second synthetic revision",expectedRevision:2}),{status:"updated",revision:3,draftStatus:"generated"});checks++;
  assert.deepEqual(await read(),{revision:3,status:"generated",manual_body:"Second synthetic revision"});checks++;
  assert.deepEqual(await updateDevelopmentDraftVersioned(owner,draft,{approve:true,expectedRevision:2}),{status:"conflict"});checks++;
  assert.equal((await admin.query("select count(*)::int as count from outbound_mail where user_id=$1",[owner])).rows[0].count,0);checks++;
  console.log(JSON.stringify({passed:checks,synthetic:true,modelCalls:0,searchCalls:0,sends:0,customerDataModified:false}));
}finally{
  if(created){const client=await admin.connect();try{
    await client.query("begin");
    const verified=await client.query("select id from app_user where id=any($1::uuid[]) and display_name='Synthetic draft version' and email=id::text||'@example.invalid' for update",[[owner,other]]);
    if(verified.rowCount!==2)throw new Error("Fixture identity mismatch");
    await client.query("delete from market_workspace where id=$1 and owner_id=$2",[workspace,owner]);
    await client.query("delete from sales_company where id=$1 and external_id=$2",[company,external]);
    await client.query("delete from app_user where id=any($1::uuid[])",[[owner,other]]);
    await client.query("commit");
  }catch(error){await client.query("rollback");throw error;}finally{client.release();}}
  await admin.end();await getPool().end();
}
