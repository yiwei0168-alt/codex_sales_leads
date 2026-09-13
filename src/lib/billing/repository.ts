import { tenantQuery,tenantTransaction } from "@/lib/rag/db";
import { BudgetDeniedError } from "./policy";
import type { ProviderUsageObservation } from "./provider-usage";
import {readProviderUsageSummary} from "./usage-summary";
import {createHash} from "node:crypto";
import {planCostReconciliation,type CostObservationKind} from "./reconciliation-policy";
import {COST_SUMMARY_SQL} from "./cost-summary";
import type {ForeignCostBound} from "./fx-policy";
import {allocateCompanyCost,costAttributionSchema,type CostAttribution} from "./cost-allocation";
import {observationCostAllocation} from "./observation-allocation";
import {readCompanyCosts} from "./company-cost-repository";
import {readRecoveryTaskLimits} from "./recovery-task-budget";

/** Check the whole operation so changing a repair batch cannot bypass an unknown request fingerprint. */
export async function assertProcessingRecoveryCostsKnown(userId: string, operationId: string): Promise<void> {
  const rows = await tenantQuery<{ id: string }>(userId,
    `select id from paid_call_reservation where user_id=$1 and operation_id=$2
      and (status in ('reserved','bound-exceeded') or (status='unknown' and settled_micros is null)) limit 1`, [userId, operationId]);
  if (rows.length) throw new BudgetDeniedError("paid-request-already-recorded");
}

/** A paid score returned after the last durable graph checkpoint must not be silently bought again. */
export async function assertUncheckpointedQualificationResponsesAbsent(
  userId: string, operationId: string, checkpointAt: string, companyKeys: string[],
): Promise<void> {
  if (!companyKeys.length) return;
  if (!Number.isFinite(Date.parse(checkpointAt)) || companyKeys.some(key => !/^[a-f0-9]{64}$/.test(key)))
    throw new BudgetDeniedError("paid-request-already-recorded");
  const rows = await tenantQuery<{ id: string }>(userId,
    `select id from paid_call_reservation where user_id=$1 and operation_id=$2
      and created_at >= $3::timestamptz
      and (metrics->'modelAttempt'->>'task'='lead-qualification'
        or (stage='scoring' and metrics->'modelAttempt'->>'task' is null))
      and (metrics->>'validOutputItems'='1' or metrics->>'outputIncomplete'='true')
      and (metrics->'costAttribution'->'companyKeys' ?| $4::text[]
        or metrics->'costAttribution'->>'kind' is distinct from 'company-inputs') limit 1`,
    [userId, operationId, checkpointAt, companyKeys]);
  if (rows.length) throw new BudgetDeniedError("paid-request-already-recorded");
}

type ReservationInput={operationId:string;stage:string;tariffKey:string;tariffVersion:string;maximumChargeMicros:number;requestBytes:number;requestFingerprint?:string;foreignCostBound?:ForeignCostBound;costAttribution?:CostAttribution;modelAttempt?:{invocationId:string|null;provider:string|null;task:string|null;promptVersion:string|null;attempt:number|null;requestedModel:string|null;gatewayHost:string|null;endpointKind:string}|null};
export async function reservePaidCall(userId:string,input:ReservationInput){
  return tenantTransaction(userId,client=>reservePaidCallInTransaction(client,userId,input));
}
export async function reservePaidCallInTransaction(client:import("pg").PoolClient,userId:string,input:ReservationInput){
  if(!Number.isSafeInteger(input.maximumChargeMicros)||input.maximumChargeMicros<=0)throw new BudgetDeniedError("missing-tariff");
  const costAttribution=input.costAttribution?costAttributionSchema.parse(input.costAttribution):null;
  const reservationAllocation=allocateCompanyCost({basis:"reservation",amountMicros:input.maximumChargeMicros,attribution:costAttribution});
    const budget=await client.query<{limit_micros:string;occupied_micros:string;frozen:boolean;rule_held?:boolean;rate_review_held?:boolean}>(`select limit_micros,occupied_micros,frozen,
      exists(select 1 from paid_rule_hold where user_id=$1 and tariff_key=$2 and tariff_version=$3) as rule_held,
      exists(select 1 from billing_tariff_refresh_state where tariff_key=$2 and hold) as rate_review_held
      from user_spend_budget where user_id=$1 for update`,[userId,input.tariffKey,input.tariffVersion]);
    const row=budget.rows[0];if(!row)throw new BudgetDeniedError("missing-budget");
    if(row.frozen)throw new BudgetDeniedError("budget-frozen");
    if(row.rule_held||row.rate_review_held)throw new BudgetDeniedError("tariff-suspended");
    if(input.requestFingerprint){
      if(!/^[a-f0-9]{64}$/.test(input.requestFingerprint))throw new BudgetDeniedError("request-out-of-bounds");
      // Same owner lock serializes different workers before either reserves or sends.
      // Known charged failures may use existing bounded retry; unknown work and HTTP success must not replay.
      const previous=await client.query(`select id from paid_call_reservation where user_id=$1 and operation_id=$2
        and stage=$3 and request_fingerprint=$4 and (status in ('reserved','bound-exceeded')
          or (status='unknown' and settled_micros is null)
          or metrics->>'validOutputItems'='1') limit 1`,[userId,input.operationId,input.stage,input.requestFingerprint]);
      if(previous.rows.length)throw new BudgetDeniedError("paid-request-already-recorded");
    }
    if(BigInt(row.occupied_micros)+BigInt(input.maximumChargeMicros)>BigInt(row.limit_micros))throw new BudgetDeniedError("budget-exhausted");
    // The owner lock also serializes task edits and all reservations for this action.
    const taskLimits=await readRecoveryTaskLimits(client,userId,input.operationId);
    if(taskLimits.some(task=>task.blocking_prior_request))throw new BudgetDeniedError("paid-request-already-recorded");
    if(taskLimits.some(task=>task.limit_micros!==null&&BigInt(task.occupied_micros)+BigInt(input.maximumChargeMicros)>BigInt(task.limit_micros)))throw new BudgetDeniedError("task-budget-exhausted");
    const result=await client.query<{id:string}>(`insert into paid_call_reservation(user_id,operation_id,stage,tariff_key,tariff_version,reserved_micros,status,metrics,request_fingerprint)
      values($1,$2,$3,$4,$5,$6,'reserved',$7,$8) returning id`,[userId,input.operationId,input.stage,input.tariffKey,input.tariffVersion,input.maximumChargeMicros,JSON.stringify({inputItems:1,inputBytes:input.requestBytes,modelAttempt:input.modelAttempt??null,foreignCostBound:input.foreignCostBound??null,fxReservationBufferPercent:input.foreignCostBound?5:0,costAttribution,reservationAllocation,outputBytes:null,validOutputItems:null,downstreamUsedItems:null,inputTokens:null,outputTokens:null,apiCredits:null,retries:0,utilizationEfficiency:null,discardedReasonCounts:{},usageBoundary:"single-http-attempt-reserved-before-network",optimizationOpportunity:"Reuse cached output before reserving another paid attempt"}),input.requestFingerprint??null]);
    await client.query("update user_spend_budget set occupied_micros=occupied_micros+$2,updated_at=now() where user_id=$1",[userId,input.maximumChargeMicros]);
    return result.rows[0].id;
}
export async function settlePaidCall(userId:string,id:string,input:{reportedMicros:number|null;latencyMs:number;responseBytes:number|null;inputTokens:number|null;outputTokens:number|null;succeeded:boolean;outputIncomplete?:boolean;providerUsage?:ProviderUsageObservation}){
  // Raw HTTP usage is not a uniquely matched all-inclusive bill. No automatic release here.
  const cost=input.reportedMicros!==null&&Number.isSafeInteger(input.reportedMicros)&&input.reportedMicros>=0?input.reportedMicros:null;
  await tenantTransaction(userId,async client=>{
    await client.query("select user_id from user_spend_budget where user_id=$1 for update",[userId]);
    const result=await client.query<{reserved_micros:string;occupied_micros:string|null;settled_micros:string|null;settled_source:CostObservationKind|null;tariff_key:string;tariff_version:string;metrics:unknown}>(`update paid_call_reservation set reported_micros=$3,
      status=case when $3::bigint>reserved_micros then 'bound-exceeded' when $3::bigint is null then 'unknown' else 'reported' end,
      provider_request_hash=coalesce($5,provider_request_hash),metrics=metrics || $4::jsonb,updated_at=now()
      where user_id=$1 and id=$2 and status='reserved' returning reserved_micros,occupied_micros,settled_micros,settled_source,tariff_key,tariff_version,metrics`,
      [userId,id,cost,JSON.stringify({latencyMs:input.latencyMs,outputBytes:input.responseBytes,inputTokens:input.inputTokens,outputTokens:input.outputTokens,providerUsage:input.providerUsage??null,validOutputItems:input.succeeded?1:0,outputIncomplete:input.outputIncomplete??false,discardedReasonCounts:input.succeeded?{}:input.outputIncomplete?{incompleteModelOutput:1}:{requestFailed:1},usageBoundary:"response-returned-not-downstream-adopted",optimizationOpportunity:"Reconcile invoices before releasing conservative reservations"}),input.providerUsage?.providerRequestHash??null]);
    const row=result.rows[0];if(!row)return;
    const plan=planCostReconciliation({reservedMicros:Number(row.reserved_micros),occupiedMicros:row.occupied_micros==null?undefined:Number(row.occupied_micros),settledMicros:row.settled_micros==null?null:Number(row.settled_micros),settledSource:row.settled_source??null},{kind:"provider-report",amountMicros:cost,complete:false,uniquelyMatched:false});
    await client.query(`insert into paid_cost_observation(user_id,reservation_id,kind,amount_micros,source_reference_hash,source_version,complete,uniquely_matched,provider_request_hash,occupied_before,occupied_after,metrics)
      values($1,$2,'provider-report',$3,$4,'http-response-usage-v1',false,false,$5,$6,$7,$8) on conflict do nothing`,
      [userId,id,cost,createHash("sha256").update(`${id}:http-response-v1`).digest("hex"),input.providerUsage?.providerRequestHash??null,plan.occupiedBefore,plan.occupiedAfter,JSON.stringify({inputItems:1,validOutputItems:1,downstreamUsedItems:plan.suspendRule?1:0,inputTokens:0,outputTokens:0,apiCredits:0,retries:0,costAllocation:observationCostAllocation({kind:"provider-report",amountMicros:cost,reservationMetrics:row.metrics,occupiedBefore:plan.occupiedBefore,occupiedAfter:plan.occupiedAfter}),usageBoundary:"cost-observation-not-additional-spend",optimizationOpportunity:"Verify completeness and unique matching before release"})]);
    if(plan.occupiedDelta!==0){
      await client.query("update paid_call_reservation set occupied_micros=$3 where user_id=$1 and id=$2",[userId,id,plan.occupiedAfter]);
      await client.query("update user_spend_budget set occupied_micros=occupied_micros+$2,updated_at=now() where user_id=$1",[userId,plan.occupiedDelta]);
    }
    if(plan.suspendRule)await client.query("insert into paid_rule_hold(user_id,tariff_key,tariff_version,reason) values($1,$2,$3,'reported-charge-above-bound') on conflict do nothing",[userId,row.tariff_key,row.tariff_version]);
  });
}
export async function readSpendBudget(userId:string){
  const rows=await tenantQuery(userId,`select limit_micros::text,occupied_micros::text,greatest(0,limit_micros-occupied_micros)::text as remaining_micros,frozen,updated_at,
    (select count(*)::int from paid_rule_hold where user_id=$1) as suspended_rules
    from user_spend_budget where user_id=$1`,[userId]);
  const usage=await tenantQuery(userId,`select stage,count(*)::int as calls,sum(reserved_micros)::text as reserved_micros,
    ${COST_SUMMARY_SQL},
    sum(reported_micros)::text as reported_micros,count(*) filter(where reported_micros is null)::int as unknown_bills,
    count(*) filter(where status='reserved')::int as unsettled_calls from paid_call_reservation where user_id=$1 group by stage order by stage`,[userId]);
  return {budget:rows[0]??null,stages:usage,modelUsage:await readProviderUsageSummary(userId)};
}
export async function setSpendBudget(userId:string,limitMicros:number){
  if(!Number.isSafeInteger(limitMicros)||limitMicros<0||limitMicros>1000000000000)throw new Error("预算金额无效");
  await tenantTransaction(userId,async client=>{
    const started=Date.now();
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[`budget-edit:${userId}`]);
    const previous=await client.query<{limit_micros:string}>("select limit_micros from user_spend_budget where user_id=$1 for update",[userId]);
    await client.query("insert into user_spend_budget(user_id,limit_micros) values($1,$2) on conflict(user_id) do nothing",[userId,limitMicros]);
    const changed=await client.query(`update user_spend_budget set limit_micros=$2,updated_at=now() where user_id=$1 and occupied_micros<=$2 returning user_id`,[userId,limitMicros]);
    if(!changed.rows[0])throw new Error("预算不能低于累计预留占用；未知账单不自动释放");
    await auditBudgetChange(client,userId,null,previous.rows[0]?.limit_micros??null,limitMicros,Date.now()-started);
  });
}

async function auditBudgetChange(client:import("pg").PoolClient,userId:string,operationId:string|null,previous:string|null,next:number,latencyMs:number){
  await client.query("insert into spend_budget_change(user_id,operation_id,previous_limit_micros,new_limit_micros,metrics) values($1,$2,$3,$4,$5)",
    [userId,operationId,previous,next,JSON.stringify({inputItems:1,validOutputItems:1,downstreamUsedItems:1,inputTokens:0,outputTokens:0,apiCredits:0,costUsd:0,latencyMs,retries:0,discardedReasonCounts:{},utilizationEfficiency:1,usageBoundary:"user-confirmed-budget-change-no-task-start",optimizationOpportunity:"Edit limits without recreating tasks or releasing unknown bills"})]);
}

export async function readTaskSpendBudget(userId:string,actionId:string){
  const owner=await tenantQuery(userId,"select id from assistant_action where user_id=$1 and id=$2 and action_type='lead-search'",[userId,actionId]);
  if(!owner.length)throw new Error("任务不存在或不属于当前用户");
  const rows=await tenantTransaction(userId,client=>readRecoveryTaskLimits(client,userId,actionId));
  const ownLimit=rows.find(row=>row.action_id===actionId&&row.limit_micros!==null);
  const inheritedTaskLimits=rows.filter(row=>row.action_id!==actionId&&row.limit_micros!==null);
  const stages=await tenantQuery(userId,`select stage,count(*)::int as calls,sum(reserved_micros)::text as reserved_micros,
    ${COST_SUMMARY_SQL},
    sum(reported_micros)::text as reported_micros,count(*) filter(where reported_micros is null)::int as unknown_bills,
    sum((metrics->>'latencyMs')::bigint)::text as summed_latency_ms
    from paid_call_reservation where user_id=$1 and operation_id=$2 group by stage order by stage`,[userId,actionId]);
  return {taskLimit:ownLimit??null,inheritedTaskLimits,stages,companyCosts:await readCompanyCosts(userId,actionId),modelUsage:await readProviderUsageSummary(userId,actionId)};
}

export async function setTaskSpendBudget(userId:string,actionId:string,limitMicros:number){
  if(!Number.isSafeInteger(limitMicros)||limitMicros<0||limitMicros>1000000000000)throw new Error("预算金额无效");
  return tenantTransaction(userId,async client=>{
    const started=Date.now();
    const owner=await client.query("select id from assistant_action where user_id=$1 and id=$2 and action_type='lead-search'",[userId,actionId]);
    if(!owner.rowCount)throw new Error("任务不存在或不属于当前用户");
    const budget=await client.query("select user_id from user_spend_budget where user_id=$1 for update",[userId]);
    if(!budget.rowCount)throw new Error("请先在任务中心设置用户累计预算");
    const family=await readRecoveryTaskLimits(client,userId,actionId);
    const own=family.find(row=>row.action_id===actionId);
    if(!own)throw new Error("任务不存在或不属于当前用户");
    if(BigInt(own.occupied_micros)>BigInt(limitMicros))throw new Error("任务预算不能低于已占用预留");
    const old=await client.query<{limit_micros:string}>("select limit_micros from task_spend_limit where user_id=$1 and action_id=$2",[userId,actionId]);
    await client.query("insert into task_spend_limit(user_id,action_id,limit_micros) values($1,$2,$3) on conflict(user_id,action_id) do update set limit_micros=excluded.limit_micros,updated_at=now()",[userId,actionId,limitMicros]);
    await auditBudgetChange(client,userId,actionId,old.rows[0]?.limit_micros??null,limitMicros,Date.now()-started);
  });
}
