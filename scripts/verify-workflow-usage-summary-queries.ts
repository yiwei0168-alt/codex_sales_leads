import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import nextEnv from "@next/env";
import {WORKFLOW_MODEL_USAGE_SQL,WORKFLOW_STAGE_USAGE_SQL} from "../src/lib/billing/workflow-usage-summary";

nextEnv.loadEnvConfig(process.cwd());
const {tenantQuery,tenantTransaction,getPool}=await import("../src/lib/rag/db");
const userId="cbee9803-3c43-4609-9228-66086b207012";
try{
  const identity=await tenantQuery<{safe:boolean}>(userId,
    "select (email='model-acceptance-20260912@fixture.invalid' and status='disabled') as safe from app_user where id=$1",[userId]);
  assert.equal(identity[0]?.safe,true);
  const foreignUserId=randomUUID();
  const [stages,models,otherStages,otherModels]=await Promise.all([
    tenantQuery(userId,WORKFLOW_STAGE_USAGE_SQL,[userId]),
    tenantQuery(userId,WORKFLOW_MODEL_USAGE_SQL,[userId]),
    tenantQuery(foreignUserId,WORKFLOW_STAGE_USAGE_SQL,[foreignUserId]),
    tenantQuery(foreignUserId,WORKFLOW_MODEL_USAGE_SQL,[foreignUserId]),
  ]);
  assert.deepEqual(otherStages,[]);assert.deepEqual(otherModels,[]);
  const rollback=Error("Expected verification rollback");
  let fixtureVerified=false;
  try{
    await tenantTransaction(userId,async client=>{
      const existing=await client.query<{id:string}>(
        "select id from market_workspace where owner_id=$1 order by created_at limit 1",[userId]);
      const workspaceId=existing.rows[0]?.id??(await client.query<{id:string}>(
        "insert into market_workspace(owner_id,slug,name,market,country_code,objective) values($1,$2,'Usage fixture','Global','WW','Synthetic') returning id",
        [userId,`verify-usage-${randomUUID()}`])).rows[0].id;
      const stage=`verify-usage-${randomUUID()}`;
      for(const [input,generated,valid,used] of [[2,2,1,1],[1,1,1,1]])
        await client.query(`insert into workflow_stage_metric(user_id,workspace_id,graph_thread_id,workflow_key,
          workflow_version,stage,status,started_at,completed_at,input_items,output_items,
          generated_artifacts,valid_artifacts,downstream_used_artifacts,dependency_fingerprint)
          values($1,$2,'verify-usage','verify-usage','1',$3,'completed',now(),now(),$4,$5,$5,$6,$7,'fixture')`,
        [userId,workspaceId,stage,input,generated,valid,used]);
      await client.query(`insert into workflow_model_usage(user_id,workspace_id,graph_thread_id,stage,
        requested_model,actual_model,prompt_tokens,completion_tokens,total_tokens,latency_ms)
        values($1,$2,'verify-usage',$3,'fixture','fixture',10,5,15,20)`,[userId,workspaceId,stage]);
      const own=(await client.query(WORKFLOW_STAGE_USAGE_SQL,[userId])).rows.find(row=>row.stage===stage);
      assert.equal(own?.input_items,"3");assert.equal(own?.generated_artifacts,"3");
      assert.equal(own?.valid_artifacts,"2");assert.equal(own?.downstream_used_artifacts,"2");
      assert.equal(own?.invalid_count_records,0);
      assert.ok(Math.abs(Number(own?.downstream_utilization)-2/3)<1e-12);
      assert.equal(own?.tavily_credit_coverage_records,0);
      assert.equal(own?.tavily_reported_credits,null);
      const creditStage=`${stage}-tavily`;
      await client.query(`insert into workflow_stage_metric(user_id,workspace_id,graph_thread_id,workflow_key,
        workflow_version,stage,status,started_at,completed_at,paid_search_credits,
        generated_artifacts,valid_artifacts,downstream_used_artifacts,dependency_fingerprint,metadata)
        values($1,$2,'verify-usage','verify-usage','1',$3,'completed',now(),now(),3,1,1,1,'fixture',$4::jsonb)`,
      [userId,workspaceId,creditStage,JSON.stringify({reportedCreditCalls:1,estimatedCreditCalls:1,
        reportedCredits:2,estimatedCredits:1,unknownCreditAttempts:1})]);
      await client.query(`insert into workflow_stage_metric(user_id,workspace_id,graph_thread_id,workflow_key,
        workflow_version,stage,status,started_at,completed_at,paid_search_credits,
        generated_artifacts,valid_artifacts,downstream_used_artifacts,dependency_fingerprint)
        values($1,$2,'verify-usage','verify-usage','1',$3,'completed',now(),now(),1,1,1,1,'legacy-fixture')`,
      [userId,workspaceId,creditStage]);
      const credit=(await client.query(WORKFLOW_STAGE_USAGE_SQL,[userId])).rows.find(row=>row.stage===creditStage);
      assert.equal(Number(credit?.recorded_search_credits),4);
      assert.equal(credit?.tavily_credit_coverage_records,1);
      assert.equal(credit?.tavily_reported_credit_calls,"1");
      assert.equal(credit?.tavily_estimated_credit_calls,"1");
      assert.equal(credit?.tavily_reported_credits,"2");
      assert.equal(credit?.tavily_estimated_credits,"1");
      assert.equal(credit?.tavily_unknown_credit_attempts,"1");
      const model=(await client.query(WORKFLOW_MODEL_USAGE_SQL,[userId])).rows.find(row=>row.stage===stage);
      assert.equal(model?.recorded_total_tokens,"15");assert.equal(model?.fallback_records,0);
      const invalidStage=`${stage}-invalid`;
      await client.query(`insert into workflow_stage_metric(user_id,workspace_id,graph_thread_id,workflow_key,
        workflow_version,stage,status,started_at,completed_at,generated_artifacts,valid_artifacts,
        downstream_used_artifacts,dependency_fingerprint)
        values($1,$2,'verify-usage','verify-usage','1',$3,'completed',now(),now(),1,0,1,'fixture')`,
      [userId,workspaceId,invalidStage]);
      const invalid=(await client.query(WORKFLOW_STAGE_USAGE_SQL,[userId])).rows.find(row=>row.stage===invalidStage);
      assert.equal(invalid?.invalid_count_records,1);
      assert.equal(invalid?.downstream_utilization,null);
      await client.query("select set_config('app.current_user_id',$1,true)",[foreignUserId]);
      assert.equal((await client.query(WORKFLOW_STAGE_USAGE_SQL,[userId])).rows.some(row=>row.stage===stage),false);
      assert.equal((await client.query(WORKFLOW_STAGE_USAGE_SQL,[userId])).rows.some(row=>row.stage===creditStage),false);
      assert.equal((await client.query(WORKFLOW_STAGE_USAGE_SQL,[userId])).rows.some(row=>row.stage===invalidStage),false);
      assert.equal((await client.query(WORKFLOW_MODEL_USAGE_SQL,[userId])).rows.some(row=>row.stage===stage),false);
      fixtureVerified=true;
      throw rollback;
    });
  }catch(error){if(error!==rollback)throw error;}
  assert.equal(fixtureVerified,true);
  console.log(JSON.stringify({persistentWrites:false,workflowStageGroups:stages.length,
    workflowModelGroups:models.length,foreignScopeEmpty:true,syntheticAggregateVerified:true,
    fixtureRolledBack:true,paidCalls:0}));
}finally{await getPool().end();}
