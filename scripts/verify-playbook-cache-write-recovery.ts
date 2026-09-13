import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {spawnSync} from "node:child_process";
import {PostgresSaver} from "@langchain/langgraph-checkpoint-postgres";
import {getPool} from "../src/lib/rag/db";
import {buildLeadWorkflowGraph,type LeadWorkflowDependencies} from "../src/lib/leads/workflow/graph";
import {WorkflowPausedError} from "../src/lib/leads/workflow/pause";
import {plan,playbook,ragContext} from "./workflow-recovery-fixtures";

// Synthetic adapters only. The generated checkpoint thread is deleted after verification.
const mode=process.argv[2];
const threadId=process.argv[3]??`verify-playbook-cache:${randomUUID()}`;
if(!/^verify-playbook-cache:[a-f0-9-]{36}$/.test(threadId))throw new Error("Invalid isolated verification thread");
const saver=new PostgresSaver(getPool(),undefined,{schema:"langgraph"});
const config={configurable:{thread_id:threadId}};
let generated=0,cacheWrites=0,discoveries=0;
const forbidden=async():Promise<never>=>{throw new Error("Unexpected completed-stage replay");};
const deps:LeadWorkflowDependencies={
  retrieveRagContext:mode==="seed"?async()=>ragContext:forbidden,
  buildPlaybook:mode==="seed"?async()=>{generated++;return playbook;}:forbidden,
  loadPlaybookCache:async()=>null,
  savePlaybookCache:async()=>{cacheWrites++;throw new Error("Synthetic optional cache unavailable");},
  discover:async()=>{discoveries++;throw new Error("Synthetic discovery boundary reached");},
  collectEvidence:forbidden,
  correctionAgent:{correct:forbidden},qualificationAgent:{evaluate:forbidden},
  assessmentReviewAgent:{review:forbidden},handoffAssembler:{assemble:()=>{throw new Error("Unexpected handoff");}},
  persist:forbidden,
  updatePhase:async(_user,_action,phase)=>{
    if(mode==="seed"&&phase==="discovering")throw new WorkflowPausedError();
  },
};
try{
  if(!mode){
    for(const phase of ["seed","resume"]){
      const child=spawnSync(process.execPath,["scripts/run-tsx.cjs","scripts/verify-playbook-cache-write-recovery.ts",phase,threadId],
        {encoding:"utf8",windowsHide:true,timeout:60000,env:process.env});
      if(child.status!==0)throw new Error(`Playbook ${phase} verification failed: ${child.stderr}`);
      process.stdout.write(child.stdout);
    }
    console.log(JSON.stringify({postgresCrossProcessCheckpoint:true,generatedPlaybooks:1,
      optionalCacheWrites:1,replayedPlaybooks:0,realProviderCalls:0,businessPersistence:"synthetic-adapters-only"}));
  }else{
    const graph=buildLeadWorkflowGraph(deps,saver);
    if(mode==="seed"){
      await assert.rejects(graph.invoke({userId:"synthetic-owner",actionId:"synthetic-action",graphThreadId:threadId,
        workspaceId:"synthetic-workspace",plan,phase:"queued",ragContext:[],candidates:[],assessments:[],
        assessmentReviews:[],handoffs:[],creditsUsed:13,warnings:[]},config),WorkflowPausedError);
      const snapshot=await graph.getState(config);
      assert.deepEqual(snapshot.next,["discover_candidates"]);
      assert.equal(snapshot.values.playbook?.marketHypothesis,playbook.marketHypothesis);
      assert.equal(snapshot.values.creditsUsed,13);
      assert.equal(snapshot.values.stageMetrics?.at(-1)?.metadata?.cacheWriteFailed,true);
      assert.deepEqual({generated,cacheWrites,discoveries},{generated:1,cacheWrites:1,discoveries:0});
    }else if(mode==="resume"){
      const before=await graph.getState(config);
      assert.deepEqual(before.next,["discover_candidates"]);
      await assert.rejects(graph.invoke(null,config),/Synthetic discovery boundary reached/);
      assert.deepEqual({generated,cacheWrites,discoveries},{generated:0,cacheWrites:0,discoveries:1});
      assert.equal((await graph.getState(config)).values.creditsUsed,13);
    }else throw new Error("Unknown verification phase");
    console.log(JSON.stringify({phase:mode,generated,cacheWrites,discoveries}));
  }
}finally{
  if(!mode)await saver.deleteThread(threadId);
  await saver.end();
}
