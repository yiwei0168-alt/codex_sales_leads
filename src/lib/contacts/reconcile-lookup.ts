import { tenantTransaction } from '@/lib/rag/db';

// This closes local processing only. It does not cancel/refund an external job,
// create a replacement run, clear a monetary reservation or call the provider.
export async function reconcileContactLookup(userId:string,runId:string){
  const started=Date.now();
  return tenantTransaction(userId,async client=>{
    const rows=await client.query<{company_id:string;provider:string;workspace_id:string}>(`select c.company_id,c.provider,r.workspace_id
      from user_contact_lookup_cache c join company_enrichment_run r on r.id=c.run_id
      join market_workspace w on w.id=r.workspace_id
      where c.user_id=$1 and w.owner_id=$1 and c.run_id=$2 and c.status='running' and r.status='running'
        and c.updated_at<now()-interval '10 minutes' and r.metadata->>'source'='company-detail'
      for update of c`,[userId,runId]);
    const row=rows.rows[0];if(!row)throw new Error('查询仍在运行、已经结束或不属于当前用户；仅可核实超过十分钟的单公司异常查询。');
    await client.query("update user_contact_lookup_cache set status='unknown',updated_at=now() where user_id=$1 and company_id=$2 and provider=$3 and run_id=$4 and status='running'",[userId,row.company_id,row.provider,runId]);
    await client.query(`update company_enrichment_run set status='failed',finished_at=now(),error_message='User closed uncertain local lookup; external usage remains unknown',
      metadata=metadata || '{"userReconciled":true,"costState":"unknown-not-refunded"}'::jsonb where id=$1 and workspace_id=$2`,[runId,row.workspace_id]);
    await client.query("update company_enrichment_run_item set status='failed',phase='failed',error_message='User closed local processing; no automatic retry',finished_at=now(),updated_at=now() where run_id=$1 and company_id=$2 and status='running'",[runId,row.company_id]);
    await client.query(`insert into workspace_audit_event(workspace_id,actor_user_id,entity_type,entity_id,action,changes)
      values($1,$2,'contact-lookup',$3,'contact.lookup-reconciled',$4)`,[row.workspace_id,userId,runId,JSON.stringify({source:'user-confirmed',provider:row.provider,
      efficiency:{inputItems:1,validOutputItems:1,downstreamUsedItems:1,inputTokens:0,outputTokens:0,costUsd:0,apiCredits:0,retries:0,latencyMs:Date.now()-started,discardedReasonCounts:{},utilizationEfficiency:1,usageBoundary:'local-reconciliation-only-not-external-refund',optimizationOpportunity:'Fence late results; require separate explicit refresh for any new paid lookup'}})]);
    return {reconciled:true,message:'本地异常查询已结束，外部费用仍需核实；未调用服务商、未退款或自动重试。'};
  });
}
