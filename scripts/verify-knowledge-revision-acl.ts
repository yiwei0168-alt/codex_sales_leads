import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import nextEnv from "@next/env";
import {Pool} from "pg";
import {databaseConnectionString,databaseSslConfiguration} from "../src/lib/rag/database-ssl";

nextEnv.loadEnvConfig(process.cwd());
const application=process.env.DATABASE_URL,migration=process.env.DATABASE_MIGRATION_URL;
if(!application||!migration)throw new Error("Both database connections required");
const a=new URL(application),m=new URL(migration);
if(a.hostname!==m.hostname||(a.port||"5432")!==(m.port||"5432")||a.pathname!==m.pathname)
  throw new Error("Fixture database mismatch");
const pool=new Pool({connectionString:databaseConnectionString(migration),ssl:databaseSslConfiguration(migration)});
const client=await pool.connect();
const userId=randomUUID(),collectionId=randomUUID(),documentId=randomUUID();
try{
  await client.query("begin");
  await client.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Revision ACL fixture','member','disabled')",
    [userId,`revision-acl-${userId}@fixture.invalid`]);
  await client.query("insert into knowledge_collection(id,slug,name,base_type) values($1,$2,'Revision ACL fixture','company')",
    [collectionId,`revision-acl-${collectionId}`]);
  await client.query(`insert into knowledge_document(id,collection_id,external_id,title,source_type,content_sha256,owner_id,visibility)
    values($1,$2,'fixture','Revision ACL fixture','fixture',$3,$4,'private')`,
  [documentId,collectionId,"a".repeat(64),userId]);
  await client.query("set local role network_copilot_app");
  await client.query("select set_config('app.current_user_id',$1,true)",[userId]);
  await client.query(`insert into knowledge_document_revision(document_id,user_id,content_sha256,title,content)
    values($1,$2,$3,'Revision ACL fixture','synthetic content')`,[documentId,userId,"a".repeat(64)]);
  assert.equal((await client.query("select id from knowledge_document_revision where document_id=$1",[documentId])).rowCount,1);
  for(const statement of [
    "update knowledge_document_revision set title=title where document_id=$1",
    "delete from knowledge_document_revision where document_id=$1",
  ]){
    await client.query("savepoint immutable_revision");
    let denied=false;
    try{await client.query(statement,[documentId]);}
    catch(error){denied=(error as {code?:string}).code==="42501";}
    await client.query("rollback to savepoint immutable_revision");
    assert.equal(denied,true,"Application role could edit knowledge history");
  }
  await client.query("delete from knowledge_document where id=$1 and owner_id=$2",[documentId,userId]);
  assert.equal((await client.query("select id from knowledge_document_revision where document_id=$1",[documentId])).rowCount,0,
    "Parent deletion did not cascade to history");
  await client.query("rollback");
  console.log(JSON.stringify({revisionInsertRead:true,ownerUpdateDeleteDenied:true,parentDeleteCascade:true,
    fixtureRolledBack:true,paidCalls:0}));
}catch(error){await client.query("rollback");throw error;}
finally{client.release();await pool.end();}
