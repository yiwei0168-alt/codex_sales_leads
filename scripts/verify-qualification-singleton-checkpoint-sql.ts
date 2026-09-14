import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {spawnSync} from "node:child_process";

import nextEnv from "@next/env";
import {Pool} from "pg";

import {databaseConnectionString,databaseSslConfiguration} from "../src/lib/rag/database-ssl";
import {DeepSeekProvider} from "../src/providers/deepseek";
import {planQualificationSingletonChunks} from "../src/lib/leads/workflow/qualification-singleton-chunks";
import {productQualificationSingletonChunkCheckpoint} from "../src/lib/leads/workflow/qualification-singleton-checkpoint";

nextEnv.loadEnvConfig(process.cwd());
const application=process.env.DATABASE_URL,migration=process.env.DATABASE_MIGRATION_URL;
if(!application||!migration)throw new Error("Application and migration connections are required");
const app=new URL(application),adminUrl=new URL(migration);
if(app.hostname!==adminUrl.hostname||(app.port||"5432")!==(adminUrl.port||"5432")
  ||app.pathname!==adminUrl.pathname)throw new Error("Database target mismatch");
const admin=new Pool({connectionString:databaseConnectionString(migration),
  ssl:databaseSslConfiguration(migration)});
const {tenantQuery,getPool}=await import("../src/lib/rag/db");
const wire=new DeepSeekProvider({apiKey:"fixture-never-sent",maxAttempts:1,
  fetchImplementation:async()=>{throw new Error("External transport is forbidden");}});
const baseFingerprint=createHash("sha256").update("synthetic-critical-source-v1").digest("hex");
const text="opening 甲β "+"critical evidence with unique middle 𝌆 ".repeat(2_500)+" closing disputed status";
function plan(workspaceId:string,countryCode="CO"){
  return planQualificationSingletonChunks({candidateId:"synthetic-critical-company",countryCode,
    countryName:countryCode==="CO"?"Colombia":"Mexico",objective:"new-market",
    sourceFingerprint:baseFingerprint,modelVersion:"deepseek-v4-pro",
    dataClassification:"private-workspace",tenantScope:workspaceId,
    unit:{kind:"evidence",id:"source-original",text,evidenceIds:["source-original"]},
    requestBytes:request=>wire.requestBytes(request)});
}
function response(request:ReturnType<typeof plan>["requests"][number]){
  const index=(request.input as {chunkIndex:number}).chunkIndex;
  return {output:{unitKind:"evidence" as const,unitId:"source-original",chunkIndex:index,
    materiality:"uncertain" as const,summary:`Segment ${index} needs full-source review.`,
    citedEvidenceIds:["source-original"]},modelVersion:request.modelVersion,
    promptVersion:request.promptVersion,latencyMs:3,warnings:[],
    requestedModelVersion:request.modelVersion,actualProviderId:"deepseek",attempts:1,retries:0,
    usage:{promptTokens:10,completionTokens:5,reasoningTokens:0,totalTokens:15}};
}
const mode=process.argv[2];
if(mode==="probe"){
  const [userId,workspaceId,actionId]=process.argv.slice(3);
  try{
    const request=plan(workspaceId).requests[0];
    const stored=await productQualificationSingletonChunkCheckpoint({userId,workspaceId,actionId,
      countryCode:"CO",expectedProviderId:"deepseek"}).load(request,wire.cacheIdentity(request),
      wire.paidRequestFingerprint(request));
    assert.deepEqual(stored,response(request));
    console.log(JSON.stringify({crossProcessChunkLoad:"passed",providerCalls:0}));
  }finally{await getPool().end();await admin.end();}
}else if(!mode){
  const userId=randomUUID(),otherUserId=randomUUID(),workspaceId=randomUUID(),otherWorkspaceId=randomUUID();
  const actionId=randomUUID(),otherActionId=randomUUID();
  const conversationId=randomUUID(),otherConversationId=randomUUID();
  let created=false;
  try{
    const client=await admin.connect();
    try{
      await client.query("begin");
      for(const id of [userId,otherUserId])await client.query(
        "insert into app_user(id,email,display_name,role,status) values($1,$2,'Singleton checkpoint fixture','member','disabled')",
        [id,`singleton-${id}@fixture.invalid`]);
      for(const [workspace,owner] of [[workspaceId,userId],[otherWorkspaceId,otherUserId]])await client.query(
        "insert into market_workspace(id,owner_id,slug,name,market,country_code,objective) values($1,$2,'global-sales','Singleton checkpoint fixture','Global','WW','Synthetic')",
        [workspace,owner]);
      for(const [conversation,owner] of [[conversationId,userId],[otherConversationId,otherUserId]])await client.query(
        "insert into assistant_conversation(id,user_id,title) values($1,$2,'Singleton checkpoint fixture')",
        [conversation,owner]);
      for(const [action,owner,conversation] of [[actionId,userId,conversationId],
        [otherActionId,otherUserId,otherConversationId]])await client.query(
        "insert into assistant_action(id,user_id,conversation_id,action_type,status,payload) values($1,$2,$3,'lead-search','running','{}'::jsonb)",
        [action,owner,conversation]);
      await client.query("commit");created=true;
    }catch(error){await client.query("rollback");throw error;}finally{client.release();}
    const requests=plan(workspaceId).requests;
    assert.ok(requests.length>1);
    const own=productQualificationSingletonChunkCheckpoint({userId,workspaceId,actionId,
      countryCode:"CO",expectedProviderId:"deepseek"});
    const first=requests[0],firstContract=wire.cacheIdentity(first),firstPaid=wire.paidRequestFingerprint(first);
    await own.save(first,firstContract,firstPaid,response(first));
    assert.deepEqual(await own.load(first,firstContract,firstPaid),response(first));
    const child=spawnSync(process.execPath,["scripts/run-tsx.cjs",
      "scripts/verify-qualification-singleton-checkpoint-sql.ts","probe",userId,workspaceId,actionId],
    {cwd:process.cwd(),encoding:"utf8",windowsHide:true,timeout:30_000});
    assert.equal(child.status,0,`Cross-process singleton load failed: ${child.stderr}`);
    assert.match(child.stdout,/"crossProcessChunkLoad":"passed"/);
    await assert.rejects(own.assertNoOtherCompleted(first,[{contract:firstContract,
      paidFingerprint:firstPaid}]),/completed concurrently/);
    await assert.rejects(own.assertNoOtherCompleted(first,[{contract:"a".repeat(64),
      paidFingerprint:firstPaid}]),/route changed/);
    await own.save(first,firstContract,firstPaid,response(first));
    await assert.rejects(own.save(first,firstContract,firstPaid,{...response(first),
      output:{...response(first).output,summary:"Changed paid output"}}),/conflict/);
    await assert.rejects(own.save(first,firstContract,firstPaid,{...response(first),
      actualProviderId:"wrong-provider"}),/actual route differs/);
    for(const request of requests.slice(1))await own.save(request,wire.cacheIdentity(request),
      wire.paidRequestFingerprint(request),response(request));
    const rows=await tenantQuery<{n:number}>(userId,
      "select count(*)::int as n from lead_qualification_phase_checkpoint where action_id=$1",
      [actionId]);
    assert.equal(rows[0].n,requests.length);
    const changed=planQualificationSingletonChunks({candidateId:"synthetic-critical-company",
      countryCode:"CO",countryName:"Colombia",objective:"new-market",
      sourceFingerprint:baseFingerprint,modelVersion:"deepseek-v4-pro",
      dataClassification:"private-workspace",tenantScope:workspaceId,
      unit:{kind:"evidence",id:"source-original",text:text.replace("unique middle","changed middle"),
        evidenceIds:["source-original"]},requestBytes:request=>wire.requestBytes(request)}).requests[0];
    assert.notEqual(wire.paidRequestFingerprint(changed),firstPaid);
    assert.equal(await own.load(changed,wire.cacheIdentity(changed),
      wire.paidRequestFingerprint(changed)),null);
    const foreign=plan(otherWorkspaceId).requests[0];
    assert.equal(await productQualificationSingletonChunkCheckpoint({userId:otherUserId,
      workspaceId:otherWorkspaceId,actionId:otherActionId,countryCode:"CO",
      expectedProviderId:"deepseek"}).load(foreign,wire.cacheIdentity(foreign),
      wire.paidRequestFingerprint(foreign)),null);
    const mexico=plan(workspaceId,"MX").requests[0];
    assert.equal(await productQualificationSingletonChunkCheckpoint({userId,workspaceId,actionId,
      countryCode:"MX",expectedProviderId:"deepseek"}).load(mexico,wire.cacheIdentity(mexico),
      wire.paidRequestFingerprint(mexico)),null);
    await assert.rejects(tenantQuery(userId,
      "update lead_qualification_phase_checkpoint set response='{}'::jsonb where action_id=$1",
      [actionId]),/permission denied/i);
    console.log(JSON.stringify({singletonCheckpointSql:"passed",chunks:requests.length,
      crossProcessLoads:1,duplicateRows:0,foreignReads:0,crossCountryReads:0,
      mutationDenied:true,providerCalls:0,paidApiCredits:0}));
  }finally{
    if(created){
      const client=await admin.connect();
      try{
        await client.query("begin");
        const owners=await client.query("select id from app_user where id=any($1::uuid[]) and display_name='Singleton checkpoint fixture' for update",
          [[userId,otherUserId]]);
        if(owners.rowCount!==2)throw new Error("Fixture ownership mismatch");
        await client.query("delete from market_workspace where id=any($1::uuid[])",[[workspaceId,otherWorkspaceId]]);
        await client.query("delete from app_user where id=any($1::uuid[])",[[userId,otherUserId]]);
        await client.query("commit");
      }catch(error){await client.query("rollback");throw error;}finally{client.release();}
      const leftovers=await admin.query<{n:number}>(
        "select count(*)::int as n from lead_qualification_phase_checkpoint where user_id=any($1::uuid[])",
        [[userId,otherUserId]]);
      assert.equal(leftovers.rows[0].n,0);
      console.log("Synthetic singleton checkpoint fixture removed.");
    }
    await getPool().end();await admin.end();
  }
}else throw new Error("Unknown singleton checkpoint verifier mode");
