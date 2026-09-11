import { tenantTransaction } from '@/lib/rag/db';

export async function reconcileRelationshipAnalysis(userId:string,id:string){
  const started=Date.now();
  return tenantTransaction(userId,async client=>{
    const rows=await client.query<{workspace_id:string;fingerprint:string}>(`select a.workspace_id,a.fingerprint from user_relationship_analysis a
      join market_workspace w on w.id=a.workspace_id where a.id=$1 and a.user_id=$2 and w.owner_id=$2
      and (a.status='failed' or (a.status='running' and a.updated_at<now()-interval '10 minutes'))
      and not (a.metrics ? 'userReconciled') for update of a`,[id,userId]);
    const row=rows.rows[0];if(!row)throw new Error('仅可核实未结束超过十分钟或已失败的分析；已完成/已核实记录不可重置。');
    // Archive the cache key, not the record: future explicit analysis gets a new
    // ID; old workers can only address this failed ID and cannot overwrite it.
    await client.query(`update user_relationship_analysis set status='failed',fingerprint=$3,
      metrics=metrics || $4::jsonb,updated_at=now() where id=$1 and user_id=$2`,[id,userId,`closed:${id}:${row.fingerprint}`,
      JSON.stringify({userReconciled:true,originalFingerprint:row.fingerprint,costState:'external-usage-not-refunded'})]);
    await client.query(`insert into workspace_audit_event(workspace_id,actor_user_id,entity_type,entity_id,action,changes)
      values($1,$2,'relationship-analysis',$3,'relationship.analysis-reconciled',$4)`,[row.workspace_id,userId,id,JSON.stringify({
      efficiency:{inputItems:1,validOutputItems:1,downstreamUsedItems:1,inputTokens:0,outputTokens:0,costUsd:0,apiCredits:0,retries:0,latencyMs:Date.now()-started,discardedReasonCounts:{},utilizationEfficiency:1,usageBoundary:'local-cache-closure-not-refund',optimizationOpportunity:'Preserve failed attempt; only a separate explicit action may pay for a new analysis'}})]);
    return {reconciled:true,message:'异常分析已保留并解除缓存占用；未退款或重试。需要时请回关系图单独发起新分析。'};
  });
}
