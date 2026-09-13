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
const {addManualCompany}=await import("../src/lib/sales/manual-company");
const userId=randomUUID(),otherUserId=randomUUID(),workspaceId=randomUUID(),otherWorkspaceId=randomUUID();
const domain=`company-rls-${userId}.invalid`,otherDomain=`company-rls-${otherUserId}.invalid`;
let created=false;
const startedAt=Date.now();
try{
  const client=await admin.connect();
  try{
    await client.query("begin");
    for(const id of [userId,otherUserId])await client.query(
      "insert into app_user(id,email,display_name,role,status) values($1,$2,'Company RLS fixture','member','disabled')",
      [id,`company-rls-${id}@fixture.invalid`]);
    for(const [id,owner] of [[workspaceId,userId],[otherWorkspaceId,otherUserId]])await client.query(
      "insert into market_workspace(id,owner_id,slug,name,market,country_code,objective) values($1,$2,'global-sales','Company RLS fixture','Global','WW','Synthetic isolation check')",
      [id,owner]);
    await client.query("commit");created=true;
  }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  await addManualCompany(userId,{name:"Company RLS fixture A",country:"CO",website:`https://${domain}`,role:"SI"});
  await addManualCompany(otherUserId,{name:"Company RLS fixture B",country:"MX",website:`https://${otherDomain}`,role:"Retailer"});
  const own=await tenantQuery<{company_id:string}>(userId,
    "select company_id from workspace_company where workspace_id=$1",[workspaceId]);
  assert.equal(own.length,1);
  assert.equal((await tenantQuery(otherUserId,
    "select company_id from workspace_company where workspace_id=$1",[workspaceId])).length,0);
  assert.equal((await tenantQuery(otherUserId,
    "update workspace_company set priority=priority where workspace_id=$1 and company_id=$2 returning company_id",
    [workspaceId,own[0].company_id])).length,0);
  await assert.rejects(tenantQuery(otherUserId,
    `insert into workspace_company(workspace_id,company_id,account_tier,supply_model,brand_involvement,opportunity_stage,priority)
     values($1,$2,'Standard','TBD','Standard','Discovered','Low')`,[workspaceId,own[0].company_id]),
    /row-level security|permission denied/i);
  const other=await tenantQuery<{company_id:string}>(otherUserId,
    "select company_id from workspace_company where workspace_id=$1",[otherWorkspaceId]);
  assert.equal(other.length,1);
  console.log(JSON.stringify({workspaceCompanyTenantRls:"passed",ownerMemberships:1,otherOwnerMemberships:1,
    foreignReads:0,foreignUpdates:0,foreignInsertDenied:true,actualPaidCalls:0,latencyMs:Date.now()-startedAt}));
}finally{
  if(created){
    const client=await admin.connect();
    try{
      await client.query("begin");
      const owners=await client.query("select id from app_user where id=any($1::uuid[]) and display_name='Company RLS fixture' for update",[[userId,otherUserId]]);
      if(owners.rowCount!==2)throw new Error("Fixture identity mismatch");
      await client.query("delete from market_workspace where id=any($1::uuid[])",[[workspaceId,otherWorkspaceId]]);
      await client.query("delete from sales_company where domain=any($1::text[]) and not exists(select 1 from workspace_company where company_id=sales_company.id)",[[domain,otherDomain]]);
      await client.query("delete from app_user where id=any($1::uuid[])",[[userId,otherUserId]]);
      await client.query("commit");console.log("Synthetic company membership RLS fixture removed.");
    }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  }
  await getPool().end();await admin.end();
}
