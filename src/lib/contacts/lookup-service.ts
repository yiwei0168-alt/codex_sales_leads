import {withProductSpend} from "@/lib/billing/context";
import { tenantTransaction } from "@/lib/rag/db";
import type { ContactLookupProvider,ContactLookupRequest,ContactLookupResult } from "@/providers/contact-lookup";

// A failed/ambiguous call is not automatically repeated: it may have consumed credits.
export async function lookupAndStoreContacts(userId:string,workspaceId:string,input:ContactLookupRequest,provider:ContactLookupProvider,refresh=false){
  const started=Date.now();
  const reservation=await tenantTransaction(userId,async client=>{
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[`${userId}:${input.companyId}:${provider.id}`]);
    const prior=await client.query<{status:string;result:ContactLookupResult|null;run_id:string;updated_at:string}>(
      "select status,result,run_id,updated_at::text from user_contact_lookup_cache where user_id=$1 and company_id=$2 and provider=$3 for update",[userId,input.companyId,provider.id]);
    const old=prior.rows[0];
    if(old?.status==="completed"&&!refresh)return {runId:old.run_id,cached:old.result!,capturedAt:old.updated_at};
    if(old?.status==="running")throw new Error("此公司的联系人查询尚未完成，请勿重复付费查询；如持续未结束请检查任务记录。");
    if(old?.status==="unknown"&&!refresh)throw new Error("上次查询结果不确定，未自动重试；请核对服务额度后主动重新核实。");
    const run=await client.query<{id:string}>(`insert into company_enrichment_run(workspace_id,provider_mix,target_count,metadata)
      values($1,$2,1,$3) returning id`,[workspaceId,[provider.id],JSON.stringify({source:"company-detail",countryCode:input.countryCode})]);
    await client.query("insert into company_enrichment_run_item(run_id,company_id,status,phase,attempts,started_at) values($1,$2,'running','contact-search',1,now())",[run.rows[0].id,input.companyId]);
    await client.query(`insert into user_contact_lookup_cache(user_id,company_id,provider,status,run_id) values($1,$2,$3,'running',$4)
      on conflict(user_id,company_id,provider) do update set status='running',result=null,run_id=excluded.run_id,updated_at=now()`,[userId,input.companyId,provider.id,run.rows[0].id]);
    return {runId:run.rows[0].id,cached:null,capturedAt:null};
  });
  if(reservation.cached)return {result:reservation.cached,cached:true,capturedAt:reservation.capturedAt};
  try{
    const result=await withProductSpend(userId,"contact-lookup",()=>provider.lookupCompany(input,AbortSignal.timeout(90_000)),reservation.runId);
    const persisted=await tenantTransaction(userId,async client=>{
      const fence=await client.query<{run_id:string;status:string}>("select run_id,status from user_contact_lookup_cache where user_id=$1 and company_id=$2 and provider=$3 for update",[userId,input.companyId,provider.id]);
      if(fence.rows[0]?.run_id!==reservation.runId||fence.rows[0]?.status!=='running'){
        await client.query(`update company_enrichment_run set metadata=metadata || $2::jsonb where id=$1 and workspace_id=$3`,[reservation.runId,JSON.stringify({lateResult:{
          outputItems:result.contacts.length,downstreamUsedItems:0,apiCredits:result.creditsUsed??null,costUsd:null,latencyMs:Date.now()-started,discardedReason:'reservation-reconciled-or-replaced',optimizationOpportunity:'Retain charge evidence without applying stale worker output'}}),workspaceId]);
        return false;
      }
      let contacts=0,emails=0;
      for(const item of result.contacts){
        let contactId:string|null=null;
        const name=item.fullName?.trim()||[item.firstName,item.lastName].filter(Boolean).join(" ").trim();
        const source=item.sourceUrl||item.publicProfileUrl||`https://${input.domain}/`;
        if(name){const saved=await client.query<{id:string}>(`insert into company_contact(workspace_id,company_id,full_name,job_title,public_profile_url,source_url,source_provider,status,confidence)
          values($1,$2,$3,$4,$5,$6,$7,'Inferred',50) on conflict(workspace_id,company_id,full_name,source_url)
          do update set job_title=coalesce(excluded.job_title,company_contact.job_title),last_seen_at=now() returning id`,
          [workspaceId,input.companyId,name,item.jobTitle??null,item.publicProfileUrl??null,source,provider.id]);contactId=saved.rows[0].id;contacts++;}
        if(item.email){await client.query(`insert into company_email_candidate(workspace_id,company_id,contact_id,email,status,source_status,source_url,source_provider,confidence)
          values($1,$2,$3,$4,$5,$5,$6,$7,50) on conflict(workspace_id,company_id,email) do update set
          contact_id=coalesce(company_email_candidate.contact_id,excluded.contact_id),last_seen_at=now()`,
          [workspaceId,input.companyId,contactId,item.email.toLowerCase(),item.emailStatus??"Unknown",source,provider.id]);emails++;}
      }
      // Platform attribution is retained; this is not labelled an official website verification.
      await client.query(`insert into company_web_evidence(workspace_id,run_id,company_id,provider,source_kind,url,title,excerpt)
        values($1,$2,$3,$4,'contact-platform',$5,'Contact platform lookup',$6)`,
        [workspaceId,reservation.runId,input.companyId,provider.id,`https://${input.domain}/`,`${contacts} contact records; ${emails} email candidates; provider-supplied, not independently verified`]);
      const efficiency={version:"contact-lookup-cache-v1",inputItems:1,validOutputItems:contacts+emails,downstreamUsedItems:contacts+emails,
        inputTokens:0,outputTokens:0,apiCredits:result.creditsUsed??null,costUsd:null,costState:"provider-credits-not-priced",latencyMs:Date.now()-started,
        retries:0,discardedReasonCounts:{},utilizationEfficiency:result.contacts.length?1:0,optimizationOpportunity:"Reuse tenant-owned lookup cache; requery only after explicit refresh"};
      await client.query("update company_enrichment_run set status='completed',processed_count=1,finished_at=now(),metadata=metadata||$2::jsonb where id=$1",[reservation.runId,JSON.stringify({efficiency})]);
      await client.query("update company_enrichment_run_item set status='completed',phase='completed',named_contact_count=$3,email_count=$4,finished_at=now(),updated_at=now() where run_id=$1 and company_id=$2",[reservation.runId,input.companyId,contacts,emails]);
      await client.query("update user_contact_lookup_cache set status='completed',result=$4,updated_at=now() where user_id=$1 and company_id=$2 and provider=$3 and run_id=$5 and status='running'",[userId,input.companyId,provider.id,JSON.stringify(result),reservation.runId]);
      return true;
    });
    if(!persisted)throw new Error('此查询已结束或由新任务替代；迟到结果未覆盖当前联系人，请查看任务费用记录。');
    return {result,cached:false,capturedAt:new Date().toISOString()};
  }catch(error){
    await tenantTransaction(userId,async client=>{
      await client.query("update user_contact_lookup_cache set status='unknown',updated_at=now() where user_id=$1 and company_id=$2 and provider=$3 and run_id=$4 and status='running'",[userId,input.companyId,provider.id,reservation.runId]);
      await client.query("update company_enrichment_run set status='failed',error_message='Contact provider or persistence failed; charge unknown; no automatic retry',finished_at=now() where id=$1 and status='running'",[reservation.runId]);
      await client.query("update company_enrichment_run_item set status='failed',phase='failed',error_message='Lookup incomplete; check provider usage before retry',finished_at=now(),updated_at=now() where run_id=$1 and company_id=$2 and status='running'",[reservation.runId,input.companyId]);
    });throw error;
  }
}
