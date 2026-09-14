import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {spawnSync} from "node:child_process";
import {readFile} from "node:fs/promises";

import nextEnv from "@next/env";
import {Pool} from "pg";

import {databaseConnectionString,databaseSslConfiguration} from "../src/lib/rag/database-ssl";
import {DeepSeekProvider} from "../src/providers/deepseek";
import type {StructuredAiRequest,StructuredAiResponse} from "../src/providers/contracts";
import {qualificationPhaseOutputJsonSchema} from "../src/lib/leads/workflow/qualification-phase-output";
import {LeadQualificationAgent} from "../src/lib/leads/workflow/qualification-agent";
import {leadEvidenceContentHash} from "../src/lib/leads/evidence-snapshot";
import {assessment,correctedCandidate,playbook} from "./workflow-recovery-fixtures";
import {BudgetDeniedError} from "../src/lib/billing/policy";

nextEnv.loadEnvConfig(process.cwd());
const appUrl=process.env.DATABASE_URL,migrationUrl=process.env.DATABASE_MIGRATION_URL;
if(!appUrl||!migrationUrl)throw new Error("Both database connections are required");
const app=new URL(appUrl),migration=new URL(migrationUrl);
if(app.hostname!==migration.hostname||(app.port||"5432")!==(migration.port||"5432")
  ||app.pathname!==migration.pathname)throw new Error("Database target mismatch");
const admin=new Pool({connectionString:databaseConnectionString(migrationUrl),
  ssl:databaseSslConfiguration(migrationUrl)});
const {tenantQuery,getPool}=await import("../src/lib/rag/db");
const {productQualificationPhaseCheckpoint}=await import("../src/lib/leads/workflow/qualification-phase-checkpoint");
const {assertUncheckpointedQualificationResponsesAbsent}=await import("../src/lib/billing/repository");
const sourceFingerprint=createHash("sha256").update("synthetic-phase-source").digest("hex");
const request:StructuredAiRequest<unknown>={task:"lead-qualification",modelVersion:"deepseek-v4-pro",
  promptVersion:"qualification-fact-phase-v1",outputSchema:qualificationPhaseOutputJsonSchema,
  evidenceIds:["fixture-e1","fixture-e2"],input:{phaseIndex:0,sourceFingerprint,
    market:{countryCode:"CO",countryName:"Colombia",objective:"new-market"},
    unlinkedEvidenceIds:["fixture-e2"],candidate:{candidateId:"synthetic-phase-company",
      findings:[{findingId:"fixture-f1",evidenceIds:["fixture-e1"]}],
      evidence:[{evidenceId:"fixture-e1"},{evidenceId:"fixture-e2"}]}}};
const wire=new DeepSeekProvider({apiKey:"fixture-never-sent",maxAttempts:1,
  fetchImplementation:async()=>{throw new Error("External transport is forbidden");}});
const contract=wire.cacheIdentity(request);
const paidFingerprint=wire.paidRequestFingerprint(request);
assert.match(contract??"",/^[a-f0-9]{64}$/);
assert.match(paidFingerprint,/^[a-f0-9]{64}$/);
const response:StructuredAiResponse<unknown>={output:{facts:[{findingId:"fixture-f1",materiality:"material",
  summary:"Official source supports distribution.",evidenceIds:["fixture-e1"]}],
  sources:[{evidenceId:"fixture-e2",materiality:"context",summary:"Additional public source."}]},
  modelVersion:request.modelVersion,promptVersion:request.promptVersion,latencyMs:7,warnings:[],
  requestedModelVersion:request.modelVersion,actualProviderId:"deepseek",attempts:1,retries:0,
  usage:{promptTokens:30,completionTokens:12,reasoningTokens:0,totalTokens:42}};
const originalEvidence={...correctedCandidate.evidence[0],evidenceRunId:"run-1",
  freshnessStatus:"fresh" as const,
  contentHash:leadEvidenceContentHash(correctedCandidate.evidence[0].excerpt)};
const agentExtras=Array.from({length:150},(_,index)=>{
  const excerpt=Array.from({length:9},(_,part)=>createHash("sha256")
    .update(`agent-sql-phase-${index}-${part}`).digest("hex")).join(" ");
  return {...originalEvidence,id:`agent-sql-source-${index}`,
    url:`https://fixture.invalid/agent/${index}`,excerpt,contentHash:leadEvidenceContentHash(excerpt)};
});
const agentCandidate={...correctedCandidate,evidence:[originalEvidence,...agentExtras],
  correction:{...correctedCandidate.correction,findings:[...correctedCandidate.correction.findings,
    ...agentExtras.map((item,index)=>({...correctedCandidate.correction.findings[0],
      findingId:`agent-sql-finding-${index}`,kind:"product-family" as const,
      statement:`Corrected networking fact ${index}: ${createHash("sha256")
        .update(`agent-fact-${index}`).digest("hex")}`,evidenceIds:[item.id],
      status:index===25?"conflicting" as const:"supported" as const}))]}};
function agentProvider(failPhaseAt=0){
  const calls:StructuredAiRequest<unknown>[]=[];
  let phaseCalls=0;
  return {calls,provider:{id:"synthetic-phase-agent",requestBytes:(input:StructuredAiRequest<unknown>)=>wire.requestBytes(input),
    cacheIdentity:(input:StructuredAiRequest<unknown>)=>wire.cacheIdentity(input),
    paidRequestFingerprint:(input:StructuredAiRequest<unknown>)=>wire.paidRequestFingerprint(input),
    execute:async<I,O>(input:StructuredAiRequest<I>):Promise<StructuredAiResponse<O>>=>{
      calls.push(input as StructuredAiRequest<unknown>);
      if(input.promptVersion==="qualification-fact-phase-v1"){
        phaseCalls++;
        if(phaseCalls===failPhaseAt)throw new BudgetDeniedError("budget-exhausted");
        const phase=input.input as {candidate:{findings:Array<{findingId:string;evidenceIds:string[]}>};
          unlinkedEvidenceIds:string[]};
        return {output:{facts:phase.candidate.findings.map(item=>({findingId:item.findingId,
          materiality:"material",summary:`Screened ${item.findingId}`,evidenceIds:item.evidenceIds})),
          sources:phase.unlinkedEvidenceIds.map(id=>({evidenceId:id,materiality:"context",
            summary:`Screened ${id}`}))} as O,modelVersion:input.modelVersion,
          promptVersion:input.promptVersion,latencyMs:3,warnings:[],actualProviderId:"synthetic-phase-agent"};
      }
      const dimensionRationales=Object.entries(assessment.dimensions).map(([dimension,score])=>({
        dimension,score,reason:"Synthetic cited scoring rationale.",
        findingIds:["finding-distribution"],evidenceIds:[originalEvidence.id],confidence:85}));
      return {output:{assessments:[{...assessment,dimensionRationales,
        escalation:{required:false,expectedTotalScoreChange:0,criticalStateChanges:[],
          higherCapabilityCanResolve:false,reason:""}}]} as O,
        modelVersion:input.modelVersion,promptVersion:input.promptVersion,latencyMs:3,warnings:[],
        actualProviderId:"synthetic-phase-agent"};
    }},
  };
}
const mode=process.argv[2];
if(mode==="probe"){
  const [userId,workspaceId,actionId]=process.argv.slice(3);
  const loaded=await productQualificationPhaseCheckpoint({userId,workspaceId,actionId,
    countryCode:"CO",expectedProviderId:"deepseek"}).load(request,contract!,paidFingerprint);
  assert.deepEqual(loaded,response);
  console.log(JSON.stringify({crossProcessPhaseCheckpoint:"passed",modelCalls:0}));
  await getPool().end();await admin.end();
}else if(mode==="probe-agent"){
  const [userId,workspaceId,actionId]=process.argv.slice(3);
  const {calls,provider}=agentProvider();
  const agent=new LeadQualificationAgent(provider,{routineModel:"deepseek-v4-pro",
    escalationModel:"deepseek-v4-pro",includeCooperationPaths:true,batchSize:1,concurrency:1});
  const contracts=await agent.phasedCacheContracts([agentCandidate],playbook,"CO","Colombia",
    "new-market",{userId,workspaceId,actionId});
  assert.match(contracts.get(agentCandidate.candidateId)??"",/^[a-f0-9]{64}$/);
  assert.equal(calls.length,0);
  console.log(JSON.stringify({crossProcessAgentPhaseContracts:"passed",modelCalls:0}));
  await getPool().end();await admin.end();
}else if(mode==="probe-agent-resume"){
  const [userId,workspaceId,actionId]=process.argv.slice(3);
  const {calls,provider}=agentProvider();
  const agent=new LeadQualificationAgent(provider,{routineModel:"deepseek-v4-pro",
    escalationModel:"deepseek-v4-pro",includeCooperationPaths:true,batchSize:1,concurrency:1});
  const result=await agent.evaluateWithUsage([agentCandidate],playbook,"CO","Colombia",
    "new-market",undefined,{userId,workspaceId,actionId});
  assert.equal(result.assessments[0].scoringStatus,"completed");
  assert.ok(calls.length>1);
  assert.ok(calls.every(item=>item.input!==null));
  const phases=await tenantQuery<{n:number}>(userId,
    "select count(*)::int as n from lead_qualification_phase_checkpoint where action_id=$1 and candidate_id=$2",
    [actionId,agentCandidate.candidateId]);
  assert.equal(phases[0].n,calls.length);
  console.log(JSON.stringify({crossProcessAgentResume:"passed",reusedCompletedPhases:1,
    newPhaseCalls:calls.length-1,finalScoreCalls:1,paidProviderCalls:0}));
  await getPool().end();await admin.end();
}else if(!mode){
  const userId=randomUUID(),otherUserId=randomUUID(),workspaceId=randomUUID(),otherWorkspaceId=randomUUID();
  const actionId=randomUUID(),otherActionId=randomUUID(),conversationId=randomUUID(),otherConversationId=randomUUID();
  const reservationId=randomUUID(),companyKey=createHash("sha256").update("synthetic-phase-company-key").digest("hex");
  let created=false;
  try{
    const ddl=await readFile(new URL("../db/migrations/067_qualification_phase_checkpoint.sql",import.meta.url),"utf8");
    await admin.query(ddl);
    await admin.query(await readFile(new URL("../db/migrations/068_qualification_phase_paid_replay_identity.sql",import.meta.url),"utf8"));
    const client=await admin.connect();
    try{
      await client.query("begin");
      for(const id of [userId,otherUserId])await client.query(
        "insert into app_user(id,email,display_name,role,status) values($1,$2,'Phase checkpoint fixture','member','disabled')",
        [id,`phase-checkpoint-${id}@fixture.invalid`]);
      for(const [workspace,owner] of [[workspaceId,userId],[otherWorkspaceId,otherUserId]])await client.query(
        "insert into market_workspace(id,owner_id,slug,name,market,country_code,objective) values($1,$2,'global-sales','Phase checkpoint fixture','Global','WW','Synthetic')",
        [workspace,owner]);
      for(const [conversation,owner] of [[conversationId,userId],[otherConversationId,otherUserId]])await client.query(
        "insert into assistant_conversation(id,user_id,title) values($1,$2,'Phase checkpoint fixture')",
        [conversation,owner]);
      for(const [action,owner,conversation] of [[actionId,userId,conversationId],[otherActionId,otherUserId,otherConversationId]])
        await client.query("insert into assistant_action(id,user_id,conversation_id,action_type,status,payload) values($1,$2,$3,'lead-search','running','{}'::jsonb)",
          [action,owner,conversation]);
      await client.query("commit");created=true;
    }catch(error){await client.query("rollback");throw error;}finally{client.release();}
    const own=productQualificationPhaseCheckpoint({userId,workspaceId,actionId,
      countryCode:"CO",expectedProviderId:"deepseek"});
    await own.save(request,contract!,paidFingerprint,response);
    assert.deepEqual(await own.load(request,contract!,paidFingerprint),response);
    const child=spawnSync(process.execPath,["scripts/run-tsx.cjs",
      "scripts/verify-qualification-phase-checkpoint-sql.ts","probe",userId,workspaceId,actionId],
      {cwd:process.cwd(),encoding:"utf8",windowsHide:true,timeout:30_000});
    assert.equal(child.status,0,`Cross-process phase load failed: ${child.stderr}`);
    assert.match(child.stdout,/"crossProcessPhaseCheckpoint":"passed"/);
    await own.save(request,contract!,paidFingerprint,response);
    assert.equal((await tenantQuery<{n:number}>(userId,
      "select count(*)::int as n from lead_qualification_phase_checkpoint where action_id=$1",[actionId]))[0].n,1);
    await assert.rejects(own.save(request,contract!,paidFingerprint,{...response,output:{...response.output as object,
      facts:[{findingId:"fixture-f1",materiality:"material",summary:"Changed.",evidenceIds:["fixture-e1"]}]}}),
    /conflict/);
    await assert.rejects(own.save(request,contract!,paidFingerprint,{...response,output:{facts:[],sources:[]}}),
      /missing or extra/);
    await assert.rejects(own.save(request,contract!,paidFingerprint,{...response,actualProviderId:"fallback-provider"}),
      /actual route differs/);
    assert.equal(await productQualificationPhaseCheckpoint({userId,workspaceId,actionId,
      countryCode:"MX",expectedProviderId:"deepseek"}).load({...request,input:{...request.input as object,
      market:{countryCode:"MX"}}},contract!,paidFingerprint),null);
    assert.equal(await productQualificationPhaseCheckpoint({userId:otherUserId,workspaceId:otherWorkspaceId,
      actionId:otherActionId,countryCode:"CO",expectedProviderId:"deepseek"}).load(request,contract!,paidFingerprint),null);
    assert.equal((await tenantQuery(otherUserId,
      "select id from lead_qualification_phase_checkpoint where action_id=$1",[actionId])).length,0);
    await assert.rejects(productQualificationPhaseCheckpoint({userId:otherUserId,workspaceId,
      actionId,countryCode:"CO",expectedProviderId:"deepseek"}).save(request,contract!,paidFingerprint,response),
    /row-level security|permission denied/i);
    await assert.rejects(tenantQuery(userId,
      "update lead_qualification_phase_checkpoint set response='{}'::jsonb where action_id=$1",[actionId]),
    /permission denied/i);
    await admin.query(`insert into paid_call_reservation(id,user_id,operation_id,stage,tariff_key,tariff_version,
      reserved_micros,reported_micros,status,metrics,request_fingerprint)
      values($1,$2,$3,'scoring','synthetic-phase','fixture',1,1,'reported',$4::jsonb,$5)`,
      [reservationId,userId,actionId,JSON.stringify({modelAttempt:{task:"lead-qualification"},
        costAttribution:{kind:"company-inputs",companyKeys:[companyKey]},validOutputItems:1,
        outputIncomplete:false}),"a".repeat(64)]);
    const guard=()=>assertUncheckpointedQualificationResponsesAbsent(userId,actionId,
      new Date(Date.now()-60_000).toISOString(),[companyKey]);
    await assert.rejects(guard(),/paid-request-already-recorded/);
    await admin.query("update paid_call_reservation set request_fingerprint=$2 where id=$1",
      [reservationId,paidFingerprint]);
    await guard();
    await admin.query("update paid_call_reservation set status='unknown' where id=$1",[reservationId]);
    await assert.rejects(guard(),/paid-request-already-recorded/);
    await admin.query("update paid_call_reservation set status='reported',metrics=metrics || '{\"outputIncomplete\":true}'::jsonb where id=$1",
      [reservationId]);
    await assert.rejects(guard(),/paid-request-already-recorded/);
    await admin.query("update paid_call_reservation set metrics=metrics || '{\"outputIncomplete\":false}'::jsonb where id=$1",
      [reservationId]);
    await guard();
    const {calls,provider}=agentProvider(2);
    const agent=new LeadQualificationAgent(provider,{routineModel:"deepseek-v4-pro",
      escalationModel:"deepseek-v4-pro",includeCooperationPaths:true,batchSize:1,concurrency:1});
    const agentScope={userId,workspaceId,actionId};
    await assert.rejects(agent.evaluateWithUsage([agentCandidate],playbook,"CO","Colombia",
      "new-market",undefined,agentScope),/budget-exhausted/);
    assert.equal(calls.length,2);
    assert.equal((await tenantQuery<{n:number}>(userId,
      "select count(*)::int as n from lead_qualification_phase_checkpoint where action_id=$1 and candidate_id=$2",
      [actionId,agentCandidate.candidateId]))[0].n,1);
    const resumeChild=spawnSync(process.execPath,["scripts/run-tsx.cjs",
      "scripts/verify-qualification-phase-checkpoint-sql.ts","probe-agent-resume",userId,workspaceId,actionId],
      {cwd:process.cwd(),encoding:"utf8",windowsHide:true,timeout:30_000});
    assert.equal(resumeChild.status,0,`Cross-process agent resume failed: ${resumeChild.stderr}`);
    assert.match(resumeChild.stdout,/"crossProcessAgentResume":"passed"/);
    const agentPhaseRows=(await tenantQuery<{n:number}>(userId,
      "select count(*)::int as n from lead_qualification_phase_checkpoint where action_id=$1 and candidate_id=$2",
      [actionId,agentCandidate.candidateId]))[0].n;
    assert.ok(agentPhaseRows>1);
    const agentChild=spawnSync(process.execPath,["scripts/run-tsx.cjs",
      "scripts/verify-qualification-phase-checkpoint-sql.ts","probe-agent",userId,workspaceId,actionId],
      {cwd:process.cwd(),encoding:"utf8",windowsHide:true,timeout:30_000});
    assert.equal(agentChild.status,0,`Cross-process agent phase load failed: ${agentChild.stderr}`);
    assert.match(agentChild.stdout,/"crossProcessAgentPhaseContracts":"passed"/);
    console.log(JSON.stringify({phaseCheckpointSql:"passed",crossProcessLoads:1,completedRows:1,
      duplicateRows:0,foreignReads:0,crossCountryReads:0,mutationDenied:true,
      replayGuard:"exact reported complete only",agentPhaseRows,
      crossProcessAgentLoads:1,crossProcessPartialResume:1,paidProviderCalls:0}));
  }finally{
    if(created){
      const client=await admin.connect();
      try{
        await client.query("begin");
        const owners=await client.query("select id from app_user where id=any($1::uuid[]) and display_name='Phase checkpoint fixture' for update",
          [[userId,otherUserId]]);
        if(owners.rowCount!==2)throw new Error("Fixture ownership mismatch");
        await client.query("delete from paid_call_reservation where id=$1 and user_id=$2",[reservationId,userId]);
        await client.query("delete from market_workspace where id=any($1::uuid[])",[[workspaceId,otherWorkspaceId]]);
        await client.query("delete from app_user where id=any($1::uuid[])",[[userId,otherUserId]]);
        await client.query("commit");
        console.log("Synthetic phase checkpoint fixture removed.");
      }catch(error){await client.query("rollback");throw error;}finally{client.release();}
      const leftovers=await admin.query<{n:number}>(
        "select count(*)::int as n from lead_qualification_phase_checkpoint where user_id=any($1::uuid[])",
        [[userId,otherUserId]]);
      assert.equal(leftovers.rows[0].n,0);
    }
    await getPool().end();await admin.end();
  }
}else throw new Error("Invalid checkpoint verifier mode");
