import nextEnv from "@next/env";
import assert from "node:assert/strict";

nextEnv.loadEnvConfig(process.cwd());
const {tenantQuery,getPool}=await import("../src/lib/rag/db");
const {readSpendBudget}=await import("../src/lib/billing/repository");
const {withSpendContext}=await import("../src/lib/billing/context");
const {getConversation}=await import("../src/lib/assistant/repository");
const {confirmAndQueueLeadWorkflow,claimLeadWorkflowByAction,executeClaimedLeadWorkflow}=await import("../src/lib/leads/workflow/jobs");
const userId="cbee9803-3c43-4609-9228-66086b207012";
const title="For isolated S02 product acceptance, find exactly one networking distributor in Colombia. The search queryLanguage must be es (Spanish). Keep only the Distributor role and one target company.".slice(0,38);
const fxVersion="ecb-cny-usd-2026-09-11";
try{
  const identity=await tenantQuery<{safe:boolean}>(userId,`select
    (email='model-acceptance-20260912@fixture.invalid' and status='disabled' and password_hash is null) as safe
    from app_user where id=$1`,[userId]);
  assert.equal(identity[0]?.safe,true);
  const rows=await tenantQuery<{id:string}>(userId,
    "select id from assistant_conversation where user_id=$1 and title=$2 order by created_at desc limit 1",
    [userId,title]);
  assert.ok(rows[0],"Validated two-turn acceptance conversation required");
  const conversation=await getConversation(userId,rows[0].id);
  assert.ok(conversation);
  const action=conversation.actions.at(-1);
  assert.ok(action);
  assert.ok(conversation.messages.length>=2);
  assert.notEqual(action.id,"537155d0-8c04-4ca8-9754-54d658b12027","Do not replay the old S01 v1 HTTP404 action");
  assert.equal(action.payload.countryCode,"CO");
  assert.deepEqual(action.payload.roles,["Distributor"]);
  assert.equal(action.payload.targetCount,1);
  assert.equal(action.payload.queryLanguage,"es");
  const before=await readSpendBudget(userId);
  assert.equal(before.budget?.limit_micros,"50000000");
  const previousPaid=await tenantQuery<{n:number}>(userId,
    "select count(*)::int as n from paid_call_reservation where user_id=$1 and operation_id=$2",
    [userId,action.id]);
  if(!process.argv.includes("--run")||action.status!=="proposed"){
    const jobs=await tenantQuery<{status:string;phase:string;error_message:string|null}>(userId,
      "select status,phase,error_message from lead_workflow_job where user_id=$1 and action_id=$2 order by created_at desc limit 1",
      [userId,action.id]);
    console.log(JSON.stringify({mode:"preview-or-already-started",actionId:action.id,status:action.status,
      errorMessage:action.errorMessage??null,job:jobs[0]??null,
      occupiedUsd:Number(before.budget?.occupied_micros)/1e6,
      remainingUsd:Number(before.budget?.remaining_micros)/1e6,
      stageReservations:before.stages.map(stage=>({stage:stage.stage,calls:stage.calls,
        reservedMicros:stage.reserved_micros,unknownBills:stage.unknown_bills})),newProviderCalls:0}));
  }else{
    assert.equal(previousPaid[0]?.n,0,"Fresh S02 action must have no paid call before confirmation");
    await tenantQuery(userId,`insert into market_workspace(owner_id,slug,name,market,country_code,objective)
      values($1,'global-sales','A26 Isolated Local Acceptance','Global','WW','Local product acceptance only')
      on conflict(owner_id,slug) do nothing`,[userId]);
    const workspaces=await tenantQuery<{id:string}>(userId,
      "select id from market_workspace where owner_id=$1 and slug='global-sales' and status='active'",[userId]);
    assert.equal(workspaces.length,1,"Isolated global workspace required");
    const queued=await confirmAndQueueLeadWorkflow(userId,action.id,"worker");
    assert.ok(queued,"Proposal could not be queued");
    const claim=await claimLeadWorkflowByAction(userId,action.id,"s02-local-isolated-once");
    assert.ok(claim,"Only the named isolated action may be claimed");
    try{
      const result=await withSpendContext({userId,operationId:action.id,stage:"validation",
        fixedFxReferenceVersion:fxVersion},()=>executeClaimedLeadWorkflow(claim));
      const after=await readSpendBudget(userId);
      console.log(JSON.stringify({mode:"real-minimal-workflow",status:"returned",actionId:action.id,
        result:{acceptedCount:result.accepted,targetCount:result.requested,
          stopReason:result.targetCompletionReason},
        occupiedUsd:Number(after.budget?.occupied_micros)/1e6,
        remainingUsd:Number(after.budget?.remaining_micros)/1e6,
        unknownBills:after.stages.reduce((sum,row)=>sum+Number(row.unknown_bills),0)}));
    }catch(error){
      const after=await readSpendBudget(userId);
      console.log(JSON.stringify({mode:"real-minimal-workflow",status:"paused-or-failed",actionId:action.id,
        errorClass:error instanceof Error?error.constructor.name:"UnknownError",
        errorCode:typeof error==="object"&&error!==null&&"code" in error?String(error.code):null,
        occupiedUsd:Number(after.budget?.occupied_micros)/1e6,
        remainingUsd:Number(after.budget?.remaining_micros)/1e6,
        unknownBills:after.stages.reduce((sum,row)=>sum+Number(row.unknown_bills),0),automaticReplay:false}));
      process.exitCode=1;
    }
  }
}finally{await getPool().end();}
