import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { getPool } from "../src/lib/rag/db";
import { buildLeadWorkflowGraph, type LeadWorkflowDependencies } from "../src/lib/leads/workflow/graph";
import { checkpointInvocation, WorkflowPausedError } from "../src/lib/leads/workflow/pause";
import { compactLeadSingleton } from "../src/providers/compact-lead-request";
import { DeepSeekProvider } from "../src/providers/deepseek";
import { leadRequestBatches } from "../src/providers/lead-request-batches";
import type { LeadWorkflowCandidate, WorkflowModelUsage } from "../src/lib/leads/workflow/types";
import { plan, playbook, candidate, correctedCandidate, assessment } from "./workflow-recovery-fixtures";

// Synthetic business adapters; production serializer, graph and PostgreSQL checkpointer.
// No network/model execution is reachable. Only this generated checkpoint thread is written.
const mode=process.argv[2];
const threadId=process.argv[3]??`verify-compact:${randomUUID()}`;
if(!/^verify-compact:[a-f0-9-]{36}$/.test(threadId))throw new Error("Invalid verification thread");
if(mode&&!['seed','resume'].includes(mode))throw new Error("Invalid verification phase");
const saver=new PostgresSaver(getPool(),undefined,{schema:"langgraph"});
const config={configurable:{thread_id:threadId}};
const wire=new DeepSeekProvider({apiKey:"not-used",maxAttempts:1,fetchImplementation:async()=>{throw new Error("Transport forbidden");}});
const evidence=Array.from({length:100},(_,i)=>({...candidate.evidence[0],id:`e${i}`,url:`https://fixture.invalid/${i}`,
  title:`Unique evidence ${i}`,excerpt:`Unique current networking fact ${i} with Unicode 界 and \"quotes\".`}));
const source={...candidate,domain:"fixture.invalid",officialWebsiteUrl:"https://fixture.invalid",evidence};
function prepared(items:LeadWorkflowCandidate[],country=plan.countryCode){
  const base={task:"lead-evidence-correction" as const,modelVersion:"deepseek-flash",promptVersion:"compact-recovery-fixture-v1",
    evidenceIds:items.flatMap(item=>item.evidence.map(entry=>entry.id)),input:{instructions:["Preserve all supplied evidence"],
      market:{countryCode:country},candidates:items.map(item=>({candidateId:item.candidateId,evidence:item.evidence.map(entry=>({
        evidenceId:entry.id,sourceType:entry.sourceType,url:entry.url,title:entry.title,excerpt:entry.excerpt}))}))}};
  const padding="p".repeat(Math.max(0,37000-wire.requestBytes(base)));
  return compactLeadSingleton({...base,input:{...base.input,instructions:[...base.input.instructions,padding]}},wire.requestBytes.bind(wire));
}
const request=prepared([source]);
assert.equal(request.preparation?.encoding,"exact-field-table-v1");
assert.ok(request.preparation.originalMaximumWireBytes>36864);
assert.ok(wire.requestBytes(request)<=36864);
const contract=wire.cacheIdentity(request);
assert.notEqual(contract,wire.cacheIdentity(prepared([source],"MX")));
const changed=structuredClone(source);changed.evidence[0].excerpt+=" Changed fact";
assert.notEqual(contract,wire.cacheIdentity(prepared([changed])));
const corrected={...correctedCandidate,...source,correction:{...correctedCandidate.correction,
  reliedEvidenceIds:["e0"],findings:correctedCandidate.correction.findings.map(finding=>({...finding,evidenceIds:["e0"]}))}};
const usage:WorkflowModelUsage={stage:"evidence-correction",requestedModel:"fixture",actualModel:"fixture",promptTokens:0,
  completionTokens:0,reasoningTokens:0,totalTokens:0,latencyMs:0,fallbackUsed:false,requestPreparation:request.preparation};
const counters={correction:0,scoring:0,persisted:0};
const forbidden=async():Promise<never>=>{throw new Error("Completed stage replayed");};
const deps:LeadWorkflowDependencies={retrieveRagContext:forbidden,buildPlaybook:forbidden,discover:forbidden,collectEvidence:forbidden,
  updatePhase:async(_user,_action,phase)=>{if(mode==="seed"&&phase==="scoring")throw new WorkflowPausedError();},
  correctionAgent:{correct:async items=>{
    assert.equal(mode,"seed");counters.correction++;
    assert.deepEqual(items,[source]);
    assert.equal(wire.cacheIdentity(prepared(items)),contract);
    assert.deepEqual(leadRequestBatches(items,prepared,5,100000,wire.requestBytes.bind(wire)),[[source]]);
    return {candidates:[corrected],creditsUsed:0,warnings:[],usage:[usage]};
  }},
  qualificationAgent:{evaluate:async items=>{
    assert.equal(mode,"resume");counters.scoring++;
    assert.deepEqual(items[0].evidence,evidence);
    return [{...assessment,evidenceIds:["e0"]}];
  }},
  assessmentReviewAgent:{review:async(_items,assessments)=>({assessments,reviews:[],warnings:[]})},
  handoffAssembler:{assemble:()=>[]},
  persist:async input=>{
    counters.persisted++;
    assert.deepEqual(input.candidates[0].evidence,evidence);
    const metric=input.stageMetrics.find(item=>item.stage==="correct_candidates");
    assert.deepEqual(metric?.metadata.requestPreparations,[request.preparation]);
    assert.equal(input.creditsUsed,13);
    return {runId:threadId,countryCode:plan.countryCode,countryName:plan.countryName,requested:1,discovered:1,assessed:1,
      qualified:1,accepted:1,creditsUsed:input.creditsUsed,ragCitationCount:0,graphThreadId:threadId,warnings:[]};
  }};
try{
  if(!mode){
    for(const phase of ['seed','resume']){
      const child=spawnSync(process.execPath,['scripts/run-tsx.cjs','scripts/verify-compact-processing-recovery.ts',phase,threadId],
        {encoding:"utf8",windowsHide:true,timeout:60000,env:process.env});
      if(child.status!==0)throw new Error(`Compact ${phase} failed: ${child.stderr}`);
      process.stdout.write(child.stdout);
    }
    console.log(JSON.stringify({postgresTwoProcesses:true,completedCorrectionReplays:0,priorCreditsPreserved:13,
      originalEvidenceItemsPreserved:100,preparationMetadataPersisted:true,ownerActionIsolation:true,
      contractChangesWithCountryAndEvidence:true,realProviderCalls:0,businessPersistence:"synthetic-adapter-only"}));
  }else{
    const graph=buildLeadWorkflowGraph(deps,saver);
    if(mode==="seed"){
      await graph.updateState(config,{userId:"synthetic-owner",actionId:"synthetic-action",graphThreadId:threadId,
        workspaceId:"synthetic-workspace",plan:{...plan,targetCount:1},phase:"collecting-evidence",runId:threadId,
        playbook,ragContext:[],candidates:[source],correctedCandidates:[],assessments:[],assessmentReviews:[],handoffs:[],
        creditsUsed:13,modelUsage:[],stageMetrics:[],warnings:[]},"collect_evidence");
      await assert.rejects(graph.invoke(null,config),WorkflowPausedError);
      assert.deepEqual(counters,{correction:1,scoring:0,persisted:0});
    }else{
      const snapshot=await graph.getState(config);
      assert.equal(checkpointInvocation(snapshot,"synthetic-owner","synthetic-action"),"resume");
      assert.throws(()=>checkpointInvocation(snapshot,"other-owner","synthetic-action"),/ownership/);
      assert.throws(()=>checkpointInvocation(snapshot,"synthetic-owner","other-action"),/ownership/);
      assert.deepEqual(snapshot.next,["score_candidates"]);
      assert.deepEqual(snapshot.values.correctedCandidates[0].evidence,evidence);
      assert.deepEqual(snapshot.values.modelUsage[0].requestPreparation,request.preparation);
      assert.equal(wire.cacheIdentity(prepared(snapshot.values.correctedCandidates)),contract);
      const result=await graph.invoke(null,config);
      assert.equal(result.result?.accepted,1);
      assert.deepEqual(counters,{correction:0,scoring:1,persisted:1});
      assert.equal(checkpointInvocation(await graph.getState(config),"synthetic-owner","synthetic-action"),"complete");
    }
    console.log(JSON.stringify({phase:mode,...counters}));
  }
}finally{
  if(!mode)await saver.deleteThread(threadId);
  await saver.end();
}
