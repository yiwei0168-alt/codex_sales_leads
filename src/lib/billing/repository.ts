import { tenantQuery,tenantTransaction } from "@/lib/rag/db";
import { BudgetDeniedError } from "./policy";

type ReservationInput={operationId:string;stage:string;tariffKey:string;tariffVersion:string;maximumChargeMicros:number;requestBytes:number};
export async function reservePaidCall(userId:string,input:ReservationInput){
  return tenantTransaction(userId,client=>reservePaidCallInTransaction(client,userId,input));
}
export async function reservePaidCallInTransaction(client:import("pg").PoolClient,userId:string,input:ReservationInput){
  if(!Number.isSafeInteger(input.maximumChargeMicros)||input.maximumChargeMicros<=0)throw new BudgetDeniedError("missing-tariff");
    const budget=await client.query<{limit_micros:string;occupied_micros:string;frozen:boolean}>("select limit_micros,occupied_micros,frozen from user_spend_budget where user_id=$1 for update",[userId]);
    const row=budget.rows[0];if(!row)throw new BudgetDeniedError("missing-budget");
    if(row.frozen)throw new BudgetDeniedError("budget-frozen");
    if(BigInt(row.occupied_micros)+BigInt(input.maximumChargeMicros)>BigInt(row.limit_micros))throw new BudgetDeniedError("budget-exhausted");
    // The owner lock also serializes task edits and all reservations for this action.
    const task=await client.query<{limit_micros:string;occupied_micros:string}>(`select t.limit_micros,
      coalesce((select sum(r.reserved_micros) from paid_call_reservation r where r.user_id=$1 and r.operation_id=$2),0)::text as occupied_micros
      from task_spend_limit t where t.user_id=$1 and t.action_id::text=$2`,[userId,input.operationId]);
    if(task.rows[0]&&BigInt(task.rows[0].occupied_micros)+BigInt(input.maximumChargeMicros)>BigInt(task.rows[0].limit_micros))throw new BudgetDeniedError("task-budget-exhausted");
    const result=await client.query<{id:string}>(`insert into paid_call_reservation(user_id,operation_id,stage,tariff_key,tariff_version,reserved_micros,status,metrics)
      values($1,$2,$3,$4,$5,$6,'reserved',$7) returning id`,[userId,input.operationId,input.stage,input.tariffKey,input.tariffVersion,input.maximumChargeMicros,JSON.stringify({inputItems:1,inputBytes:input.requestBytes,outputBytes:null,validOutputItems:null,downstreamUsedItems:null,inputTokens:null,outputTokens:null,apiCredits:null,retries:0,utilizationEfficiency:null,discardedReasonCounts:{},usageBoundary:"single-http-attempt-reserved-before-network",optimizationOpportunity:"Reuse cached output before reserving another paid attempt"})]);
    await client.query("update user_spend_budget set occupied_micros=occupied_micros+$2,updated_at=now() where user_id=$1",[userId,input.maximumChargeMicros]);
    return result.rows[0].id;
}
export async function settlePaidCall(userId:string,id:string,input:{reportedMicros:number|null;latencyMs:number;responseBytes:number|null;inputTokens:number|null;outputTokens:number|null;succeeded:boolean}){
  // Reported provider cost is not an audited invoice. Never automatically release a reservation.
  const cost=input.reportedMicros!==null&&Number.isSafeInteger(input.reportedMicros)&&input.reportedMicros>=0?input.reportedMicros:null;
  await tenantTransaction(userId,async client=>{
    const result=await client.query<{reserved_micros:string}>(`update paid_call_reservation set reported_micros=$3,
      status=case when $3::bigint>reserved_micros then 'bound-exceeded' when $3::bigint is null then 'unknown' else 'reported' end,
      metrics=metrics || $4::jsonb,updated_at=now() where user_id=$1 and id=$2 and status='reserved' returning reserved_micros`,
      [userId,id,cost,JSON.stringify({latencyMs:input.latencyMs,outputBytes:input.responseBytes,inputTokens:input.inputTokens,outputTokens:input.outputTokens,validOutputItems:input.succeeded?1:0,discardedReasonCounts:input.succeeded?{}:{requestFailed:1},usageBoundary:"response-returned-not-downstream-adopted",optimizationOpportunity:"Reconcile invoices before releasing conservative reservations"})]);
    if(cost!==null&&result.rows[0]&&BigInt(cost)>BigInt(result.rows[0].reserved_micros))await client.query("update user_spend_budget set frozen=true,updated_at=now() where user_id=$1",[userId]);
  });
}
export async function readSpendBudget(userId:string){
  const rows=await tenantQuery(userId,`select limit_micros::text,occupied_micros::text,greatest(0,limit_micros-occupied_micros)::text as remaining_micros,frozen,updated_at
    from user_spend_budget where user_id=$1`,[userId]);
  const usage=await tenantQuery(userId,`select stage,count(*)::int as calls,sum(reserved_micros)::text as reserved_micros,
    sum(reported_micros)::text as reported_micros,count(*) filter(where reported_micros is null)::int as unknown_bills,
    count(*) filter(where status='reserved')::int as unsettled_calls from paid_call_reservation where user_id=$1 group by stage order by stage`,[userId]);
  return {budget:rows[0]??null,stages:usage};
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
  const rows=await tenantQuery(userId,`select t.limit_micros::text,
    (select coalesce(sum(reserved_micros),0)::text from paid_call_reservation where user_id=$1 and operation_id=$2::text) as occupied_micros
    from task_spend_limit t where t.user_id=$1 and t.action_id=$2::uuid`,[userId,actionId]);
  const stages=await tenantQuery(userId,`select stage,count(*)::int as calls,sum(reserved_micros)::text as reserved_micros,
    sum(reported_micros)::text as reported_micros,count(*) filter(where reported_micros is null)::int as unknown_bills,
    sum((metrics->>'latencyMs')::bigint)::text as summed_latency_ms
    from paid_call_reservation where user_id=$1 and operation_id=$2 group by stage order by stage`,[userId,actionId]);
  return {taskLimit:rows[0]??null,stages};
}

export async function setTaskSpendBudget(userId:string,actionId:string,limitMicros:number){
  if(!Number.isSafeInteger(limitMicros)||limitMicros<0||limitMicros>1000000000000)throw new Error("预算金额无效");
  return tenantTransaction(userId,async client=>{
    const started=Date.now();
    const owner=await client.query("select id from assistant_action where user_id=$1 and id=$2 and action_type='lead-search'",[userId,actionId]);
    if(!owner.rowCount)throw new Error("任务不存在或不属于当前用户");
    const budget=await client.query("select user_id from user_spend_budget where user_id=$1 for update",[userId]);
    if(!budget.rowCount)throw new Error("请先在任务中心设置用户累计预算");
    const used=await client.query<{occupied:string}>("select coalesce(sum(reserved_micros),0)::text as occupied from paid_call_reservation where user_id=$1 and operation_id=$2",[userId,actionId]);
    if(BigInt(used.rows[0].occupied)>BigInt(limitMicros))throw new Error("任务预算不能低于已占用预留");
    const old=await client.query<{limit_micros:string}>("select limit_micros from task_spend_limit where user_id=$1 and action_id=$2",[userId,actionId]);
    await client.query("insert into task_spend_limit(user_id,action_id,limit_micros) values($1,$2,$3) on conflict(user_id,action_id) do update set limit_micros=excluded.limit_micros,updated_at=now()",[userId,actionId,limitMicros]);
    await auditBudgetChange(client,userId,actionId,old.rows[0]?.limit_micros??null,limitMicros,Date.now()-started);
  });
}
