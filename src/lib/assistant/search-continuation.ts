import type { PoolClient } from 'pg';
import type { LeadSearchPlan } from './types';
import { tenantQuery,tenantTransaction } from '@/lib/rag/db';

export function continuationGap(target:number,accepted:unknown,depth:number,previousAccepted:unknown,reason:unknown){
  if(!Number.isSafeInteger(target)||target<1||target>500||typeof accepted!=='number'||!Number.isSafeInteger(accepted)||accepted<0||accepted>=target)throw new Error('没有可确认的续搜缺口；目标已满足或历史计数不完整。');
  if(depth>=3)throw new Error('已达到三次续搜上限，请在助手中调整搜索目标，避免重复搜索。');
  if(reason==='confirmed-exhaustion'||(depth>0&&accepted===0&&previousAccepted===0))throw new Error('已达到停滞结束条件，请修改地区、类别或要求后重新规划。');
  return target-accepted;
}

export async function proposeSearchContinuation(userId:string,parentId:string){
  return tenantTransaction(userId,client=>proposeSearchContinuationInTransaction(client,userId,parentId));
}

export async function proposeSearchContinuationInTransaction(client:PoolClient,userId:string,parentId:string){
  const started=Date.now();
  const parents=await client.query<{conversation_id:string;payload:LeadSearchPlan;result:Record<string,unknown>}>(`select conversation_id,payload,result from assistant_action
    where id=$1 and user_id=$2 and action_type='lead-search' and status='completed' for update`,[parentId,userId]);
  const parent=parents.rows[0];if(!parent)throw new Error('仅可为当前用户已完成的搜索建立续搜计划。');
  const existing=await client.query<{child_action_id:string}>('select child_action_id from lead_search_continuation where parent_action_id=$1 and user_id=$2',[parentId,userId]);
  if(existing.rows[0]){
    await client.query(`insert into workspace_audit_event(workspace_id,actor_user_id,entity_type,entity_id,action,changes)
      select id,$1,'search-continuation',$2,'search.continuation-reused',$3::jsonb from market_workspace where owner_id=$1 and slug='global-sales'`,[userId,existing.rows[0].child_action_id,
      JSON.stringify({efficiency:{inputItems:1,validOutputItems:1,downstreamUsedItems:1,inputTokens:0,outputTokens:0,costUsd:0,apiCredits:0,retries:0,latencyMs:Date.now()-started,cacheHit:true,discardedReasonCounts:{duplicateProposalAvoided:1},utilizationEfficiency:1,usageBoundary:'existing-proposal-returned-not-executed',optimizationOpportunity:'Reuse the same child across repeated clicks'}})]);
    return {actionId:existing.rows[0].child_action_id,reused:true};
  }
  const lineage=await client.query<{root_action_id:string;depth:number;excluded_domains:string[];previous_result:Record<string,unknown>}>(`select l.root_action_id,l.depth,l.excluded_domains,a.result as previous_result
    from lead_search_continuation l join assistant_action a on a.id=l.parent_action_id and a.user_id=$2
    where l.child_action_id=$1 and l.user_id=$2`,[parentId,userId]);
  const prior=lineage.rows[0];
  const gap=continuationGap(parent.payload.targetCount,parent.result.accepted,prior?.depth??0,prior?.previous_result.accepted,parent.result.targetCompletionReason);
  const runs=await client.query<{id:string;workspace_id:string}>(`select r.id,r.workspace_id from lead_workflow_job j join lead_search_run r on r.graph_thread_id=j.graph_thread_id
    join market_workspace w on w.id=r.workspace_id where j.action_id=$1 and j.user_id=$2 and w.owner_id=$2
      and r.status='completed' and r.id::text=$3 and r.country_code=$4`,[parentId,userId,String(parent.result.runId??''),parent.payload.countryCode]);
  const run=runs.rows[0];if(!run||runs.rows.length!==1)throw new Error('缺少唯一的原搜索证据关联，不能安全生成续搜排除列表。');
  const domains=await client.query<{domain:string}>('select distinct lower(domain) as domain from lead_candidate_assessment where run_id=$1 and user_id=$2',[run.id,userId]);
  const excluded=[...new Set([...(prior?.excluded_domains??[]),...domains.rows.map(row=>row.domain.trim().replace(/^www\./,''))].filter(Boolean))].sort();
  if(!excluded.length||excluded.length>5000)throw new Error('历史处理公司列表为空或过大，请通过助手重新规划，不能静默丢弃去重信息。');
  const payload={...parent.payload,targetCount:gap};
  const child=await client.query<{id:string}>(`insert into assistant_action(user_id,conversation_id,action_type,payload)
    values($1,$2,'lead-search',$3) returning id`,[userId,parent.conversation_id,JSON.stringify(payload)]);
  const childId=child.rows[0].id;
  await client.query(`insert into lead_search_continuation(user_id,parent_action_id,child_action_id,root_action_id,depth,excluded_domains)
    values($1,$2,$3,$4,$5,$6)`,[userId,parentId,childId,prior?.root_action_id??parentId,(prior?.depth??0)+1,excluded]);
  await client.query(`insert into assistant_message(user_id,conversation_id,role,intent,content,metadata)
    values($1,$2,'assistant','lead-search',$3,$4)`,[userId,parent.conversation_id,
      `已建立剩余 ${gap} 家的续搜计划，排除前序已评估的 ${excluded.length} 家公司。原任务结果及费用保留；此计划尚未执行，请审阅后确认费用。`,JSON.stringify({actionIds:[childId]})]);
  await client.query('update assistant_conversation set updated_at=now() where id=$1 and user_id=$2',[parent.conversation_id,userId]);
  await client.query(`insert into workspace_audit_event(workspace_id,actor_user_id,entity_type,entity_id,action,changes)
    values($1,$2,'search-continuation',$3,'search.continuation-proposed',$4)`,[run.workspace_id,userId,childId,JSON.stringify({parentActionId:parentId,gap,excludedCount:excluded.length,
      efficiency:{inputItems:1,validOutputItems:1,downstreamUsedItems:1,inputTokens:0,outputTokens:0,costUsd:0,apiCredits:0,retries:0,latencyMs:Date.now()-started,discardedReasonCounts:{},utilizationEfficiency:1,usageBoundary:'proposal-created-not-executed',optimizationOpportunity:'Reuse prior processing exclusions; do not replay completed checkpoints'}})]);
  return {actionId:childId,reused:false,gap,excludedCount:excluded.length};
}

export async function continuationExclusions(userId:string,actionId:string):Promise<string[]>{
  const rows=await tenantQuery<{excluded_domains:string[]}>(userId,'select excluded_domains from lead_search_continuation where child_action_id=$1 and user_id=$2',[actionId,userId]);
  return rows[0]?.excluded_domains??[];
}
