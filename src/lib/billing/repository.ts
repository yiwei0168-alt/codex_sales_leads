import { tenantQuery,tenantTransaction } from "@/lib/rag/db";
import { BudgetDeniedError } from "./policy";

export async function reservePaidCall(userId:string,input:{operationId:string;stage:string;tariffKey:string;tariffVersion:string;maximumChargeMicros:number;requestBytes:number}){
  if(!Number.isSafeInteger(input.maximumChargeMicros)||input.maximumChargeMicros<=0)throw new BudgetDeniedError("missing-tariff");
  return tenantTransaction(userId,async client=>{
    const budget=await client.query<{limit_micros:string;occupied_micros:string;frozen:boolean}>("select limit_micros,occupied_micros,frozen from user_spend_budget where user_id=$1 for update",[userId]);
    const row=budget.rows[0];if(!row)throw new BudgetDeniedError("missing-budget");
    if(row.frozen)throw new BudgetDeniedError("budget-frozen");
    if(BigInt(row.occupied_micros)+BigInt(input.maximumChargeMicros)>BigInt(row.limit_micros))throw new BudgetDeniedError("budget-exhausted");
    const result=await client.query<{id:string}>(`insert into paid_call_reservation(user_id,operation_id,stage,tariff_key,tariff_version,reserved_micros,status,metrics)
      values($1,$2,$3,$4,$5,$6,'reserved',$7) returning id`,[userId,input.operationId,input.stage,input.tariffKey,input.tariffVersion,input.maximumChargeMicros,JSON.stringify({inputItems:1,inputBytes:input.requestBytes,outputBytes:null,validOutputItems:null,downstreamUsedItems:null,inputTokens:null,outputTokens:null,apiCredits:null,retries:0,utilizationEfficiency:null,discardedReasonCounts:{},usageBoundary:"single-http-attempt-reserved-before-network",optimizationOpportunity:"Reuse cached output before reserving another paid attempt"})]);
    await client.query("update user_spend_budget set occupied_micros=occupied_micros+$2,updated_at=now() where user_id=$1",[userId,input.maximumChargeMicros]);
    return result.rows[0].id;
  });
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
    await client.query("insert into user_spend_budget(user_id,limit_micros) values($1,$2) on conflict(user_id) do nothing",[userId,limitMicros]);
    const changed=await client.query(`update user_spend_budget set limit_micros=$2,updated_at=now() where user_id=$1 and occupied_micros<=$2 returning user_id`,[userId,limitMicros]);
    if(!changed.rows[0])throw new Error("预算不能低于累计预留占用；未知账单不自动释放");
  });
}
