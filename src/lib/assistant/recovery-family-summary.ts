import {createHash} from "node:crypto";
import {tenantTransaction} from "@/lib/rag/db";
import {normalizedCompanyDomain} from "@/lib/leads/workflow/candidate-registry";

export interface RecoveryFamilyRow {
  action_id:string;root_action_id:string;status:string;country_code:string|null;target_count:string|null;
  accepted_count:string|null;result_run_id:string|null;run_id:string|null;run_status:string|null;
  selected_domains:string[];
}
export type RecoveryFamilySummary={rootActionId:string;target:number|null;verifiedUniqueSaved:number|null;
  savedSlots:number|null;duplicateSavedSlots:number|null;remaining:number|null;pendingTasks:number;
  status:"verified"|"in-progress"|"unverifiable"};

function nonnegativeInteger(value:string|null){
  if(value===null||!/^\d+$/.test(value))return null;
  const number=Number(value);return Number.isSafeInteger(number)?number:null;
}

/** Slot totals are evidence, not unique companies. Any missing completed run makes the aggregate unknown. */
export function summarizeRecoveryFamilyRows(rows:RecoveryFamilyRow[]):RecoveryFamilySummary|null {
  if(rows.length<2)return null;
  const rootId=rows[0].root_action_id;
  const root=rows.find(row=>row.action_id===rootId);
  if(!root)return null;
  const target=nonnegativeInteger(root.target_count);
  const pendingTasks=rows.filter(row=>row.status!=="completed").length;
  const unknown=():RecoveryFamilySummary=>({rootActionId:rootId,target,verifiedUniqueSaved:null,savedSlots:null,
    duplicateSavedSlots:null,remaining:null,pendingTasks,status:"unverifiable"});
  if(target===null||target<1||target>500||rows.some(row=>row.root_action_id!==rootId||row.country_code!==root.country_code))return unknown();
  const unique=new Set<string>();let savedSlots=0;
  for(const row of rows){
    if(row.status!=="completed"){
      if(row.selected_domains.length)return unknown();
      continue;
    }
    const accepted=nonnegativeInteger(row.accepted_count);
    if(accepted===null||accepted>target||!row.result_run_id||row.result_run_id!==row.run_id
      ||row.run_status!=="completed"||row.selected_domains.length!==accepted)return unknown();
    for(const value of row.selected_domains){
      const domain=normalizedCompanyDomain(value.includes("://")?value:`https://${value}/`);
      if(!domain)return unknown();unique.add(domain);
    }
    savedSlots+=accepted;
  }
  if(unique.size>target)return unknown();
  return {rootActionId:rootId,target,verifiedUniqueSaved:unique.size,savedSlots,
    duplicateSavedSlots:savedSlots-unique.size,remaining:target-unique.size,pendingTasks,
    status:pendingTasks?"in-progress":"verified"};
}

/** One MVCC statement ties owned actions, persisted runs and selected assessments together. */
export async function readRecoveryFamilySummary(userId:string,actionId:string){
  return tenantTransaction(userId,async client=>{
    const started=Date.now();
    const rows=(await client.query<RecoveryFamilyRow>(`with recursive ancestors(id) as (
      select id from assistant_action where id=$2::uuid and user_id=$1
      union select r.parent_action_id from lead_processing_recovery r join ancestors a on r.child_action_id=a.id where r.user_id=$1
    ), root(id) as (
      select a.id from ancestors a where not exists(select 1 from lead_processing_recovery r where r.child_action_id=a.id and r.user_id=$1)
    ), family(id) as (
      select id from root union select r.child_action_id from lead_processing_recovery r join family f on r.parent_action_id=f.id where r.user_id=$1
    )
    select a.id::text as action_id,root.id::text as root_action_id,a.status,
      a.payload->>'countryCode' as country_code,a.payload->>'targetCount' as target_count,
      a.result->>'accepted' as accepted_count,a.result->>'runId' as result_run_id,
      run.id::text as run_id,run.status as run_status,coalesce(chosen.domains,'{}'::text[]) as selected_domains
    from family f join assistant_action a on a.id=f.id and a.user_id=$1 cross join root
    left join lead_search_run run on run.id::text=a.result->>'runId' and run.country_code=a.payload->>'countryCode'
      and run.graph_thread_id=a.result->>'graphThreadId'
      and run.metadata->>'assistantActionId'=a.id::text
      and exists(select 1 from market_workspace w where w.id=run.workspace_id and w.owner_id=$1)
    left join lateral (select array_agg(s.domain order by s.selected_rank,s.id) as domains
      from lead_candidate_assessment s where s.run_id=run.id and s.user_id=$1 and s.selected=true) chosen on true
    order by a.created_at,a.id`,[userId,actionId])).rows;
    const summary=summarizeRecoveryFamilyRows(rows);
    if(!summary)return null;
    // A refresh of the same source snapshot does not create another utilization event.
    const digest=createHash("sha256").update(JSON.stringify({userId,rootActionId:summary.rootActionId,rows})).digest("hex");
    const metricId=[digest.slice(0,8),digest.slice(8,12),digest.slice(12,16),digest.slice(16,20),digest.slice(20,32)].join("-");
    const valid=summary.status!=="unverifiable";
    await client.query(`insert into product_operation_metric(id,user_id,stage,status,metrics)
      values($1,$2,'processing-recovery-family-reconciliation',$3,$4)
      on conflict(id) do nothing`,[metricId,userId,valid?"completed":"failed",JSON.stringify({
      inputItems:rows.length,generatedOutputItems:1,validOutputItems:valid?1:0,downstreamUsedItems:valid?1:0,
      savedOutputItems:0,userAdoptedItems:null,inputTokens:0,outputTokens:0,apiCredits:0,costUsd:0,
      latencyMs:Date.now()-started,retries:0,discardedReasonCounts:valid?{}:{incompleteOrInconsistentSource:1},
      utilizationEfficiency:valid?1:null,usageBoundary:"read-only-verified-family-summary-not-user-adoption",
      optimizationOpportunity:"Preserve domain identity across recovery runs; investigate duplicate saved slots before another paid attempt",
      rootActionId:summary.rootActionId,verifiedUniqueSaved:summary.verifiedUniqueSaved,
      duplicateSavedSlots:summary.duplicateSavedSlots,pendingTasks:summary.pendingTasks})]);
    return summary;
  });
}
