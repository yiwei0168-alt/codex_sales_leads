import type {PoolClient} from "pg";

const ancestry=`with recursive ancestors(action_id) as (
  select id from assistant_action where user_id=$1 and id::text=$2
  union select r.parent_action_id from lead_processing_recovery r join ancestors a on r.child_action_id=a.action_id where r.user_id=$1
), family(ancestor_id,action_id) as (
  select action_id,action_id from ancestors
  union select f.ancestor_id,r.child_action_id from family f join lead_processing_recovery r on r.parent_action_id=f.action_id where r.user_id=$1
)`;

export interface RecoveryTaskLimit {action_id:string;limit_micros:string|null;occupied_micros:string;blocking_prior_request:boolean}
/** Caller holds user_spend_budget FOR UPDATE when enforcing or editing limits. No reset at a child ID. */
export async function readRecoveryTaskLimits(client:PoolClient,userId:string,operationId:string){
  const rows=await client.query<RecoveryTaskLimit>(`${ancestry}
    select a.action_id::text,t.limit_micros::text,
      coalesce((select sum(coalesce(r.occupied_micros,r.reserved_micros)) from paid_call_reservation r
        join family f on f.action_id::text=r.operation_id and f.ancestor_id=a.action_id where r.user_id=$1),0)::text as occupied_micros,
      (a.action_id::text<>$2 and exists(select 1 from paid_call_reservation r where r.user_id=$1 and r.operation_id=a.action_id::text
        and (r.status in ('reserved','bound-exceeded') or (r.status='unknown' and r.settled_micros is null)))) as blocking_prior_request
    from ancestors a left join task_spend_limit t on t.user_id=$1 and t.action_id=a.action_id`,[userId,operationId]);
  return rows.rows;
}
