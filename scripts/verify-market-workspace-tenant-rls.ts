import nextEnv from "@next/env";
import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {randomBytes,randomUUID} from "node:crypto";
import {promisify} from "node:util";
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
const {getCurrentWorkspace}=await import("../src/lib/sales/repository");
const {resolveTargetWorkspace}=await import("./resolve-target-workspace");
const userId=randomUUID(),otherUserId=randomUUID(),workspaceId=randomUUID(),otherWorkspaceId=randomUUID();
const email=`workspace-rls-${userId}@fixture.invalid`,otherEmail=`workspace-rls-${otherUserId}@fixture.invalid`;
const provisionEmail=`workspace-provision-${randomUUID()}@fixture.invalid`;
let created=false,provisionedId:string|undefined;
const startedAt=Date.now();
try{
  const client=await admin.connect();
  try{
    await client.query("begin");
    for(const [id,address] of [[userId,email],[otherUserId,otherEmail]])await client.query(
      "insert into app_user(id,email,display_name,role,status) values($1,$2,'Workspace RLS fixture','member','active')",[id,address]);
    for(const [id,owner] of [[workspaceId,userId],[otherWorkspaceId,otherUserId]])await client.query(
      "insert into market_workspace(id,owner_id,slug,name,market,country_code,objective) values($1,$2,'global-sales','Workspace RLS fixture','Global','WW','Synthetic isolation check')",
      [id,owner]);
    await client.query("commit");created=true;
  }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  const resolved=await resolveTargetWorkspace(["node","verify",`--user-email=${email}`]);
  assert.equal(resolved.id,workspaceId);assert.equal(resolved.ownerId,userId);
  const current=await getCurrentWorkspace(userId);
  assert.equal(current?.id,workspaceId);
  assert.equal(Object.hasOwn(current!,"mode"),false);
  const own=await tenantQuery<{mode:string|null}>(userId,"select mode from market_workspace where id=$1",[workspaceId]);
  assert.equal(own[0]?.mode,null);
  assert.equal((await tenantQuery(otherUserId,"select id from market_workspace where id=$1",[workspaceId])).length,0);
  assert.equal((await tenantQuery(otherUserId,
    "update market_workspace set name=name where id=$1 returning id",[workspaceId])).length,0);
  await assert.rejects(tenantQuery(otherUserId,
    `insert into market_workspace(owner_id,slug,name,market,country_code,objective)
     values($1,$2,'Foreign fixture','Global','WW','Denied')`,[userId,`foreign-${randomUUID()}`]),
    /row-level security|permission denied/i);
  const other=await resolveTargetWorkspace(["node","verify",`--user-email=${otherEmail}`]);
  assert.equal(other.id,otherWorkspaceId);
  await promisify(execFile)(process.execPath,["scripts/run-tsx.cjs","scripts/upsert-app-user.ts"],{
    cwd:process.cwd(),env:{...process.env,APP_USER_EMAIL:provisionEmail,APP_USER_DISPLAY_NAME:"Workspace provisioning fixture",
      APP_PASSWORD_SETUP:randomBytes(32).toString("base64url"),APP_USER_ROLE:"member"}});
  const provisioned=await admin.query<{id:string}>(
    "select id from app_user where email=$1 and display_name='Workspace provisioning fixture'",[provisionEmail]);
  assert.equal(provisioned.rowCount,1);provisionedId=provisioned.rows[0].id;
  const provisionedWorkspace=await tenantQuery<{id:string}>(provisionedId,
    "select id from market_workspace where owner_id=$1 and slug='global-sales'",[provisionedId]);
  assert.equal(provisionedWorkspace.length,1);
  console.log(JSON.stringify({marketWorkspaceTenantRls:"passed",resolvedOwners:2,ownerWorkspaceRead:1,provisioningCli:"passed",
    foreignReads:0,foreignUpdates:0,foreignInsertDenied:true,actualPaidCalls:0,latencyMs:Date.now()-startedAt}));
}finally{
  if(created){
    const client=await admin.connect();
    try{
      await client.query("begin");
      const owners=await client.query("select id from app_user where id=any($1::uuid[]) and display_name='Workspace RLS fixture' for update",[[userId,otherUserId]]);
      if(owners.rowCount!==2)throw new Error("Fixture identity mismatch");
      if(provisionedId){
        const provisioned=await client.query("select id from app_user where id=$1 and email=$2 and display_name='Workspace provisioning fixture' for update",[provisionedId,provisionEmail]);
        if(provisioned.rowCount!==1)throw new Error("Provisioning fixture identity mismatch");
        await client.query("delete from market_workspace where owner_id=$1",[provisionedId]);
        await client.query("delete from app_user where id=$1",[provisionedId]);
      }
      await client.query("delete from market_workspace where id=any($1::uuid[])",[[workspaceId,otherWorkspaceId]]);
      await client.query("delete from app_user where id=any($1::uuid[])",[[userId,otherUserId]]);
      await client.query("commit");console.log("Synthetic market workspace RLS fixture removed.");
    }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  }
  await getPool().end();await admin.end();
}
