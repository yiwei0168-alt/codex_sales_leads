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
const extended=process.env.SESSION_HTTP_EXTENDED_SCOPE==='1';
if(extended){assert(httpBase);assert.match(a.pathname,/^\/ma24_session_[a-f0-9]{12}$/, 'Extended fixture requires a disposable database');}
const connectionId=randomUUID(),otherConnectionId=randomUUID();
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
  let httpChecks=0,extendedHttpChecks=0;
  let httpCookieMode="none";
  if(httpBase){
    const client=await playwrightRequest.newContext({baseURL:httpBase});
    try{
      const before=await client.get("/api/auth/session");
      assert.equal(before.status(),200);assert.equal((await before.json()).authenticated,false);httpChecks++;
      const login=await client.post("/api/auth/login",{data:{email:`session-rls-${userId}@fixture.invalid`,password}});
      assert.equal(login.status(),200);assert.equal((await login.json()).authenticated,true);httpChecks++;
      const setCookie=login.headers()["set-cookie"] ?? "";
      assert.match(setCookie,/^network_copilot_session=[^;]+;/);
      assert.match(setCookie,/;\s*HttpOnly(?:;|$)/i);
      assert.match(setCookie,/;\s*SameSite=Lax(?:;|$)/i);
      const secure=/;\s*Secure(?:;|$)/i.test(setCookie);
      const cookiePair=setCookie.split(";",1)[0];
      // A production Secure cookie is deliberately not sent back by HTTP clients.
      // Replay it explicitly to verify server-side session handling on loopback HTTP.
      const probeOptions=secure?{headers:{cookie:cookiePair}}:undefined;
      httpCookieMode=secure?"explicit-secure-cookie-replay":"client-cookie-jar";
      const active=await client.get("/api/auth/session",probeOptions);
      assert.equal(active.status(),200);assert.equal((await active.json()).authenticated,true);httpChecks++;
      if(extended){
        for(const [id,owner] of [[connectionId,userId],[otherConnectionId,otherUserId]]){
          await admin.query("insert into mailbox_connection(id,user_id,provider,email,display_name,credential_ciphertext) values($1,$2,'alimail-imap',$3,'Synthetic session scope','never-decrypted')",[id,owner,`${owner}@fixture.invalid`]);
          await admin.query("insert into mailbox_daily_sync(connection_id,user_id,enabled,next_run_at) values($1,$2,false,now()+interval '1 day')",[id,owner]);
        }
        const own=await client.get('/api/mailbox/daily-sync',probeOptions);assert.equal(own.status(),200);
        const schedules=(await own.json()).schedules;assert.equal(schedules.length,1);assert.equal(schedules[0].connection_id,connectionId);assert.equal(schedules[0].uncovered_failed_days,0);extendedHttpChecks++;
        const foreign=await client.post('/api/mailbox/daily-sync',{headers:{cookie:cookiePair},data:{connectionId:otherConnectionId,enabled:true}});
        assert.equal(foreign.status(),409);assert.equal((await admin.query('select enabled from mailbox_daily_sync where connection_id=$1',[otherConnectionId])).rows[0].enabled,false);extendedHttpChecks++;
        const peer=await playwrightRequest.newContext({baseURL:httpBase});
        try{
          const peerLogin=await peer.post('/api/auth/login',{data:{email:`session-rls-${otherUserId}@fixture.invalid`,password}});assert.equal(peerLogin.status(),200);
          const peerCookie=(peerLogin.headers()['set-cookie']??'').split(';',1)[0];assert.match(peerCookie,/^network_copilot_session=/);
          const peerRead=await peer.get('/api/mailbox/daily-sync',{headers:{cookie:peerCookie}});assert.equal(peerRead.status(),200);
          const rows=(await peerRead.json()).schedules;assert.equal(rows.length,1);assert.equal(rows[0].connection_id,otherConnectionId);extendedHttpChecks++;
        }finally{await peer.dispose();}
        await admin.query("update app_user set status='disabled' where id=$1",[userId]);
        assert.equal((await client.get('/api/mailbox/daily-sync',probeOptions)).status(),401);extendedHttpChecks++;
        await admin.query("update app_user set status='active' where id=$1",[userId]);
      }
      const logout=await client.post("/api/auth/logout",probeOptions);
      assert.equal(logout.status(),200);assert.equal((await logout.json()).authenticated,false);httpChecks++;
      const after=await client.get("/api/auth/session",probeOptions);
      assert.equal(after.status(),200);assert.equal((await after.json()).authenticated,false);httpChecks++;
      if(extended){assert.equal((await client.get('/api/mailbox/daily-sync',probeOptions)).status(),401);extendedHttpChecks++;}
    }finally{await client.dispose();}
  }
  console.log(JSON.stringify({sessionTokenBoundary:"passed",ownedInsert:1,foreignInsertDenied:true,
    directSelectUpdateDeleteDenied:3,activeTokenResolved:1,expiredDenied:true,disabledDenied:true,revokeVerified:true,
    httpChecks,httpCookieMode,extendedHttpChecks,extendedScopeVerified:extended,actualPaidCalls:0,latencyMs:Date.now()-startedAt}));
}finally{
  if(created){
    const client=await admin.connect();
    try{
      await client.query("begin");
      const owners=await client.query("select id from app_user where id=any($1::uuid[]) and display_name='Session RLS fixture' for update",[[userId,otherUserId]]);
      if(owners.rowCount!==2)throw new Error("Fixture identity mismatch");
      if(extended){
        await client.query('delete from mailbox_daily_sync where connection_id=any($1::uuid[]) and user_id=any($2::uuid[])',[[connectionId,otherConnectionId],[userId,otherUserId]]);
        await client.query('delete from mailbox_connection where id=any($1::uuid[]) and user_id=any($2::uuid[])',[[connectionId,otherConnectionId],[userId,otherUserId]]);
      }
      await client.query("delete from app_user where id=any($1::uuid[])",[[userId,otherUserId]]);
      await client.query("commit");console.log("Synthetic session RLS fixture removed.");
    }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  }
  await getPool().end();await admin.end();
}
