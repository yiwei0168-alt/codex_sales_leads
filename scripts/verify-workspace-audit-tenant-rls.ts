import nextEnv from "@next/env";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {Pool} from "pg";
import {databaseConnectionString,databaseSslConfiguration} from "../src/lib/rag/database-ssl";

nextEnv.loadEnvConfig(process.cwd());
const app=process.env.DATABASE_URL,migration=process.env.DATABASE_MIGRATION_URL;
if(!app||!migration)throw new Error("Both database connections required");
const a=new URL(app),m=new URL(migration);
if(a.hostname!==m.hostname||(a.port||"5432")!==(m.port||"5432")||a.pathname!==m.pathname)
  throw new Error("Fixture database mismatch");
const admin=new Pool({connectionString:databaseConnectionString(migration),ssl:databaseSslConfiguration(migration)});
const {getPool,tenantQuery}=await import("../src/lib/rag/db");
const {updateWorkspaceMode}=await import("../src/lib/sales/repository");
const userId=randomUUID(),otherUserId=randomUUID(),workspaceId=randomUUID(),otherWorkspaceId=randomUUID();
let created=false;
const startedAt=Date.now();
try{
  const client=await admin.connect();
  try{
    await client.query("begin");
    for(const id of [userId,otherUserId])await client.query(
      "insert into app_user(id,email,display_name,role,status) values($1,$2,'Audit RLS fixture','member','disabled')",
      [id,`audit-rls-${id}@fixture.invalid`]);
    for(const [id,owner] of [[workspaceId,userId],[otherWorkspaceId,otherUserId]])await client.query(
      "insert into market_workspace(id,owner_id,slug,name,market,country_code,objective) values($1,$2,'global-sales','Audit RLS fixture','Global','WW','Synthetic isolation check')",
      [id,owner]);
    await client.query("commit");created=true;
  }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  await updateWorkspaceMode("new-market",userId);
  await updateWorkspaceMode("growth",otherUserId);
  const own=await tenantQuery<{id:string;actor_user_id:string;changes:{mode:string}}>(userId,
    "select id::text,actor_user_id,changes from workspace_audit_event where workspace_id=$1",[workspaceId]);
  assert.equal(own.length,1);assert.equal(own[0].actor_user_id,userId);assert.equal(own[0].changes.mode,"new-market");
  const foreign=await tenantQuery(otherUserId,
    "select id from workspace_audit_event where id=$1",[own[0].id]);
  assert.equal(foreign.length,0);
  await assert.rejects(tenantQuery(otherUserId,
    "update workspace_audit_event set changes=changes where id=$1 returning id",[own[0].id]),
  /permission denied/i);
  await assert.rejects(tenantQuery(userId,
    "update workspace_audit_event set changes=changes where id=$1 returning id",[own[0].id]),
  /permission denied/i);
  await assert.rejects(tenantQuery(userId,
    "delete from workspace_audit_event where id=$1",[own[0].id]),
  /permission denied/i);
  await assert.rejects(tenantQuery(otherUserId,
    `insert into workspace_audit_event(workspace_id,actor_user_id,entity_type,entity_id,action,changes)
     values($1,$2,'fixture','foreign','fixture','{}')`,[workspaceId,otherUserId]),
    /row-level security|permission denied/i);
  await assert.rejects(tenantQuery(otherUserId,
    `insert into workspace_audit_event(workspace_id,actor_user_id,entity_type,entity_id,action,changes)
     values($1,$2,'fixture','impersonation','fixture','{}')`,[otherWorkspaceId,userId]),
    /row-level security|permission denied/i);
  console.log(JSON.stringify({workspaceAuditTenantRls:"passed",ownerEvents:1,foreignReads:0,foreignUpdates:"denied",
    ownerUpdates:"denied",ownerDeletes:"denied",
    foreignInsertDenied:true,actorImpersonationDenied:true,actualPaidCalls:0,latencyMs:Date.now()-startedAt}));
}finally{
  if(created){
    const client=await admin.connect();
    try{
      await client.query("begin");
      const owners=await client.query("select id from app_user where id=any($1::uuid[]) and display_name='Audit RLS fixture' for update",[[userId,otherUserId]]);
      if(owners.rowCount!==2)throw new Error("Fixture identity mismatch");
      await client.query("delete from market_workspace where id=any($1::uuid[])",[[workspaceId,otherWorkspaceId]]);
      await client.query("delete from app_user where id=any($1::uuid[])",[[userId,otherUserId]]);
      await client.query("commit");console.log("Synthetic audit RLS fixture removed.");
    }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  }
  await getPool().end();await admin.end();
}
