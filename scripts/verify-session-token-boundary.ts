import nextEnv from "@next/env";
import assert from "node:assert/strict";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {request as playwrightRequest} from "@playwright/test";
import {Pool} from "pg";
import {databaseConnectionString,databaseSslConfiguration} from "../src/lib/rag/database-ssl";

nextEnv.loadEnvConfig(process.cwd());
const app=process.env.DATABASE_URL,migration=process.env.DATABASE_MIGRATION_URL;
if(!app||!migration)throw new Error("Both database connections required");
const a=new URL(app),m=new URL(migration);
if(a.hostname!==m.hostname||(a.port||"5432")!==(m.port||"5432")||a.pathname!==m.pathname)
  throw new Error("Fixture database mismatch");
const admin=new Pool({connectionString:databaseConnectionString(migration),ssl:databaseSslConfiguration(migration)});
const {getPool,query,tenantQuery}=await import("../src/lib/rag/db");
const {hashPassword}=await import("../src/lib/auth/password");
const userId=randomUUID(),otherUserId=randomUUID();
const password=randomBytes(32).toString("base64url");
const httpBase=process.env.SESSION_HTTP_BASE_URL;
if(httpBase){const url=new URL(httpBase);if(url.protocol!=="http:"||!["localhost","127.0.0.1"].includes(url.hostname))
  throw new Error("Session HTTP probe requires a local server");}
const tokenHash=createHash("sha256").update(randomBytes(32)).digest("hex");
const expiredHash=createHash("sha256").update(randomBytes(32)).digest("hex");
let created=false;
const startedAt=Date.now();
try{
  const client=await admin.connect();
  try{
    await client.query("begin");
    for(const id of [userId,otherUserId])await client.query(
      "insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Session RLS fixture',$3,'member','active')",
      [id,`session-rls-${id}@fixture.invalid`,hashPassword(password)]);
    await client.query("commit");created=true;
  }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  await tenantQuery(userId,
    "insert into app_session(user_id,token_sha256,expires_at) values($1,$2,now()+interval '1 hour')",
    [userId,tokenHash]);
  await tenantQuery(userId,
    "insert into app_session(user_id,token_sha256,expires_at) values($1,$2,now()-interval '1 hour')",
    [userId,expiredHash]);
  await assert.rejects(tenantQuery(otherUserId,
    "insert into app_session(user_id,token_sha256,expires_at) values($1,$2,now()+interval '1 hour')",
    [userId,createHash("sha256").update(randomBytes(32)).digest("hex")]),
    /row-level security|permission denied/i);
  for(const statement of ["select token_sha256 from app_session", "update app_session set last_seen_at=now() returning id",
    "delete from app_session returning id"]){
    await assert.rejects(tenantQuery(userId,statement),/permission denied|row-level security/i);
  }
  const resolved=await query<{user_id:string;display_name:string;role:string}>(
    "select user_id,display_name,role from app_session_resolve($1)",[tokenHash]);
  assert.equal(resolved.length,1);assert.equal(resolved[0].user_id,userId);
  assert.equal(resolved[0].display_name,"Session RLS fixture");assert.equal(resolved[0].role,"member");
  assert.equal((await query("select user_id from app_session_resolve($1)",[expiredHash])).length,0);
  assert.equal((await query("select user_id from app_session_resolve($1)",[
    createHash("sha256").update(randomBytes(32)).digest("hex")])).length,0);
  await admin.query("update app_user set status='disabled' where id=$1",[userId]);
  assert.equal((await query("select user_id from app_session_resolve($1)",[tokenHash])).length,0);
  await admin.query("update app_user set status='active' where id=$1",[userId]);
  await query("select app_session_revoke($1)",[tokenHash]);
  assert.equal((await query("select user_id from app_session_resolve($1)",[tokenHash])).length,0);
  let httpChecks=0;
  if(httpBase){
    const client=await playwrightRequest.newContext({baseURL:httpBase});
    try{
      const before=await client.get("/api/auth/session");
      assert.equal(before.status(),200);assert.equal((await before.json()).authenticated,false);httpChecks++;
      const login=await client.post("/api/auth/login",{data:{email:`session-rls-${userId}@fixture.invalid`,password}});
      assert.equal(login.status(),200);assert.equal((await login.json()).authenticated,true);httpChecks++;
      const active=await client.get("/api/auth/session");
      assert.equal(active.status(),200);assert.equal((await active.json()).authenticated,true);httpChecks++;
      const logout=await client.post("/api/auth/logout");
      assert.equal(logout.status(),200);assert.equal((await logout.json()).authenticated,false);httpChecks++;
      const after=await client.get("/api/auth/session");
      assert.equal(after.status(),200);assert.equal((await after.json()).authenticated,false);httpChecks++;
    }finally{await client.dispose();}
  }
  console.log(JSON.stringify({sessionTokenBoundary:"passed",ownedInsert:1,foreignInsertDenied:true,
    directSelectUpdateDeleteDenied:3,activeTokenResolved:1,expiredDenied:true,disabledDenied:true,revokeVerified:true,
    httpChecks,actualPaidCalls:0,latencyMs:Date.now()-startedAt}));
}finally{
  if(created){
    const client=await admin.connect();
    try{
      await client.query("begin");
      const owners=await client.query("select id from app_user where id=any($1::uuid[]) and display_name='Session RLS fixture' for update",[[userId,otherUserId]]);
      if(owners.rowCount!==2)throw new Error("Fixture identity mismatch");
      await client.query("delete from app_user where id=any($1::uuid[])",[[userId,otherUserId]]);
      await client.query("commit");console.log("Synthetic session RLS fixture removed.");
    }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  }
  await getPool().end();await admin.end();
}
