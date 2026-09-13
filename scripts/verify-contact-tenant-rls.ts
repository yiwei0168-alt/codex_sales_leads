import nextEnv from "@next/env";
import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {request as playwrightRequest} from "@playwright/test";
import {Pool} from "pg";
import {databaseConnectionString,databaseSslConfiguration} from "../src/lib/rag/database-ssl";
import type {ContactLookupProvider} from "../src/providers/contact-lookup";

nextEnv.loadEnvConfig(process.cwd());
const app=process.env.DATABASE_URL,migration=process.env.DATABASE_MIGRATION_URL;
if(!app||!migration)throw new Error("Both database connections required");
const a=new URL(app),m=new URL(migration);
if(a.hostname!==m.hostname||(a.port||"5432")!==(m.port||"5432")||a.pathname!==m.pathname)
  throw new Error("Fixture database mismatch");
const admin=new Pool({connectionString:databaseConnectionString(migration),ssl:databaseSslConfiguration(migration)});
const {getPool,tenantQuery}=await import("../src/lib/rag/db");
const {lookupAndStoreContacts}=await import("../src/lib/contacts/lookup-service");
const {hashPassword}=await import("../src/lib/auth/password");
const userId=randomUUID(),otherUserId=randomUUID(),workspaceId=randomUUID(),otherWorkspaceId=randomUUID(),companyId=randomUUID();
const password=randomBytes(32).toString("base64url");
const httpBase=process.env.CONTACT_HTTP_BASE_URL;
if(httpBase){const url=new URL(httpBase);if(url.protocol!=="http:"||!["localhost","127.0.0.1"].includes(url.hostname))
  throw new Error("Contact HTTP probe requires a local server");}
const startedAt=Date.now();
let created=false,providerCalls=0;
try{
  const client=await admin.connect();
  try{
    await client.query("begin");
    for(const id of [userId,otherUserId]){
      await client.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Contact RLS fixture',$3,'member',$4)",
        [id,`contact-rls-${id}@fixture.invalid`,hashPassword(password),httpBase?"active":"disabled"]);
    }
    for(const [id,owner] of [[workspaceId,userId],[otherWorkspaceId,otherUserId]]){
      await client.query("insert into market_workspace(id,owner_id,slug,name,market,country_code,objective) values($1,$2,'global-sales','Contact RLS fixture','Global','WW','Synthetic isolation check')",
        [id,owner]);
    }
    await client.query("insert into sales_company(id,external_id,canonical_name,domain,country_code,record) values($1,$2,'Contact RLS fixture',$3,'CO','{}')",
      [companyId,`contact-rls-${companyId}`,`${companyId}.invalid`]);
    await client.query("commit");created=true;
  }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  const provider:ContactLookupProvider={id:"synthetic-contact-rls",isConfigured:()=>true,
    lookupCompany:async()=>{providerCalls++;return {provider:"synthetic-contact-rls",creditsUsed:0,warnings:[],
      contacts:[{fullName:"Fixture Contact",email:`contact-${companyId}@fixture.invalid`,emailStatus:"Unknown",
        sourceUrl:`https://${companyId}.invalid/contact`}]};}};
  const request={companyId,companyName:"Contact RLS fixture",websiteUrl:`https://${companyId}.invalid`,
    domain:`${companyId}.invalid`,countryCode:"CO",targetRoles:["SI"]};
  const first=await lookupAndStoreContacts(userId,workspaceId,request,provider);
  assert.equal(first.cached,false);
  const second=await lookupAndStoreContacts(userId,workspaceId,request,provider);
  assert.equal(second.cached,true);assert.equal(providerCalls,1);
  const run=(await tenantQuery<{id:string}>(userId,"select id from company_enrichment_run where workspace_id=$1",[workspaceId]))[0];
  const contact=(await tenantQuery<{id:string}>(userId,"select id from company_contact where workspace_id=$1",[workspaceId]))[0];
  const email=(await tenantQuery<{id:string}>(userId,"select id from company_email_candidate where workspace_id=$1",[workspaceId]))[0];
  assert.ok(run&&contact&&email);
  const verification=(await tenantQuery<{id:string}>(userId,
    `insert into contact_verification_run(workspace_id,routine_model,escalation_model,prompt_version,target_count,timeout_ms)
       values($1,'fixture','fixture','fixture',1,1000) returning id`,[workspaceId]))[0];
  const assessment=(await tenantQuery<{id:string}>(userId,
    `insert into contact_model_assessment(run_id,company_id,email_candidate_id,sequence_number,provider,model_version,
       prompt_version,latency_ms,output) values($1,$2,$3,1,'fixture','fixture','fixture',0,'{}') returning id`,
    [verification.id,companyId,email.id]))[0];
  const decision=(await tenantQuery<{id:string}>(userId,
    `insert into contact_verification_decision(run_id,company_id,contact_id,email_candidate_id,category,lifecycle_status,
       contact_type,confidence_score,role_relevance_score,reachability_score,development_priority,employment_status,
       email_evidence_status,delivery_status,decided_at)
       values($1,$2,$3,$4,'NeedsReview','Active','NamedPerson',50,50,50,50,'unknown','unknown','unknown',now()) returning id`,
    [verification.id,companyId,contact.id,email.id]))[0];
  const review=(await tenantQuery<{id:string}>(userId,
    "insert into contact_review_queue(decision_id,priority) values($1,50) returning id",[decision.id]))[0];
  const ownTables:[string,string][]=[["company_enrichment_run",run.id],["company_contact",contact.id],
    ["company_email_candidate",email.id],["contact_verification_run",verification.id],
    ["contact_model_assessment",assessment.id],["contact_verification_decision",decision.id],
    ["contact_review_queue",review.id]];
  for(const table of ["company_enrichment_run_item","company_web_evidence"]){
    const rows=await tenantQuery<{id:string}>(userId,`select id from ${table} where run_id=$1`,[run.id]);
    assert.equal(rows.length,1);ownTables.push([table,rows[0].id]);
  }
  for(const [table,id] of ownTables){
    assert.equal((await tenantQuery(otherUserId,`select id from ${table} where id=$1`,[id])).length,0,`${table} leaked`);
    assert.equal((await tenantQuery(otherUserId,`update ${table} set id=id where id=$1 returning id`,[id])).length,0,
      `${table} accepted a foreign update`);
  }
  await assert.rejects(tenantQuery(otherUserId,
    "insert into company_enrichment_run(workspace_id,target_count) values($1,1)",[workspaceId]),
    /row-level security|permission denied/i);
  const otherRun=await tenantQuery(otherUserId,
    "insert into company_enrichment_run(workspace_id,target_count) values($1,1) returning id",[otherWorkspaceId]);
  assert.equal(otherRun.length,1);
  let httpChecks=0;
  if(httpBase){
    const anonymous=await playwrightRequest.newContext({baseURL:httpBase});
    try{assert.equal((await anonymous.get("/api/contact-enrichment/runs/latest")).status(),401);httpChecks++;}
    finally{await anonymous.dispose();}
    for(const [id,expectedRun,expectedItems] of [[userId,run.id,1],[otherUserId,otherRun[0].id,0]] as const){
      const client=await playwrightRequest.newContext({baseURL:httpBase});
      try{
        const login=await client.post("/api/auth/login",{data:{email:`contact-rls-${id}@fixture.invalid`,password}});
        assert.equal(login.status(),200);
        const response=await client.get("/api/contact-enrichment/runs/latest");
        assert.equal(response.status(),200);
        const body=await response.json() as {run?:{id:string};items?:unknown[];workspaceCoverage?:{targetCount:number}};
        assert.equal(body.run?.id,expectedRun);
        assert.equal(body.items?.length,expectedItems);
        if(id===userId)assert.equal(body.workspaceCoverage?.targetCount,0);
        httpChecks++;
      }finally{await client.dispose();}
    }
  }
  console.log(JSON.stringify({contactTenantRls:"passed",isolatedTables:ownTables.length,ownerContacts:1,ownerEmails:1,
    providerCalls,providerCredits:0,cacheReused:true,actualPaidCalls:0,httpChecks,latencyMs:Date.now()-startedAt}));
}finally{
  if(created){
    const client=await admin.connect();
    try{
      await client.query("begin");
      const owners=await client.query("select id from app_user where id=any($1::uuid[]) and display_name='Contact RLS fixture' for update",[[userId,otherUserId]]);
      if(owners.rowCount!==2)throw new Error("Fixture identity mismatch");
      await client.query("delete from user_contact_lookup_cache where user_id=$1",[userId]);
      await client.query("delete from market_workspace where id=any($1::uuid[])",[[workspaceId,otherWorkspaceId]]);
      await client.query("delete from sales_company where id=$1 and external_id=$2",[companyId,`contact-rls-${companyId}`]);
      await client.query("delete from app_user where id=any($1::uuid[])",[[userId,otherUserId]]);
      await client.query("commit");console.log("Synthetic contact RLS fixture removed.");
    }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  }
  await getPool().end();await admin.end();
}
