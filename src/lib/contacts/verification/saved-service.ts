import {createHash} from "node:crypto";
import {tenantQuery,tenantTransaction} from "@/lib/rag/db";
import {DeepSeekProvider} from "@/providers/deepseek";
import {ContactVerificationAgent,type ContactEvidenceDocument} from "./agent";
import {planContactPublication,type ContactSourceStatus} from "./publication";
import type {ContactVerificationDecision,ContactVerificationInput} from "./types";

type Candidate={id:string;workspace_id:string;company_id:string;contact_id:string|null;canonical_name:string;domain:string;full_name:string|null;job_title:string|null;email:string;source_status:ContactSourceStatus;derivation:string|null;last_seen_at:string;current_decision_id:string|null};
type Evidence={id:string;provider:string;source_kind:string;url:string;title:string;excerpt:string;captured_at:string};
type Run={id:string;status:string;fresh?:boolean;metadata:{decision?:ContactVerificationDecision;decisionHash?:string;evidenceHash?:string;evidenceIds?:string[];sourceStatus?:ContactSourceStatus;candidateSeenAt?:string;currentDecisionId?:string|null}};
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const sourceKey=(value:string)=>{try{return new URL(value).hostname.toLowerCase().replace(/^www\./,"");}catch{return value;}};
function evidenceDocument(row:Evidence):ContactEvidenceDocument{
  const linkedIn=/(^|\.)linkedin\.com$/i.test(sourceKey(row.url));
  return {evidenceId:row.id,sourceType:row.source_kind==="official-website"?"OfficialWebsite":linkedIn?"LinkedInProfile":"PublicProfessionalSource",
    acquisitionMethod:row.source_kind==="official-website"?"PermittedCrawl":"SearchIndex",acquisitionAuthorized:true,
    sourceKey:sourceKey(row.url),url:row.url,title:row.title,excerpt:row.excerpt,capturedAt:row.captured_at};
}
function derivation(row:Candidate):ContactVerificationInput["candidate"]["derivation"]{
  if(row.source_status==="Pattern-guessed")return "pattern-guessed";
  if(row.source_status==="Public")return "direct-public";
  if(row.derivation?.toLowerCase().includes("source"))return "cross-source";
  return "unknown";
}
const modelVersion=()=>({routine:process.env.DEEPSEEK_MODEL?.trim()||"deepseek-v4-flash",escalation:process.env.DEEPSEEK_ESCALATION_MODEL?.trim()||"deepseek-v4-pro"});
export function contactVerificationConfigured(){return new DeepSeekProvider().isConfigured();}

export async function evaluateSavedContact(userId:string,emailCandidateId:string,expectedEmail:string,agentCallId:string){
  const [candidate]=await tenantQuery<Candidate>(userId,`select em.id,em.workspace_id,em.company_id,em.contact_id,c.canonical_name,lower(c.domain) as domain,
    ct.full_name,ct.job_title,lower(em.email) as email,em.source_status,em.derivation,em.last_seen_at::text,
    em.verification_decision_id as current_decision_id
    from company_email_candidate em join sales_company c on c.id=em.company_id
    join market_workspace w on w.id=em.workspace_id and w.owner_id=$1 and w.slug='global-sales'
    left join company_contact ct on ct.id=em.contact_id and ct.company_id=em.company_id and ct.workspace_id=em.workspace_id
    where em.id=$2 and em.source_status<>'Invalid'`,[userId,emailCandidateId]);
  if(!candidate)return {status:"missing_input" as const,missing:["Owned active email candidate in the current workspace"]};
  if(candidate.email!==expectedEmail.trim().toLowerCase())return {status:"missing_input" as const,missing:["Current candidate email; reread before approving model disclosure"]};
  const provider=new DeepSeekProvider();if(!provider.isConfigured())return {status:"unavailable" as const,missing:["Configured DeepSeek contact-verification connection"]};
  const evidence=await tenantQuery<Evidence>(userId,`select id,provider,source_kind,url,title,excerpt,captured_at::text from company_web_evidence
    where workspace_id=$1 and company_id=$2 order by captured_at desc,id desc limit 10`,[candidate.workspace_id,candidate.company_id]);
  if(!evidence.length)return {status:"missing_input" as const,missing:["Saved public contact evidence for this company"]};
  const versions=modelVersion();
  const reserved=await tenantTransaction(userId,async client=>{
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[`${userId}:contact-verify:${agentCallId}`]);
    const prior=await client.query<Run>("select id,status,metadata from contact_verification_run where workspace_id=$1 and agent_call_id=$2 for update",[candidate.workspace_id,agentCallId]);
    if(prior.rows[0])return {...prior.rows[0],fresh:false};
    const created=await client.query<Run>(`insert into contact_verification_run(workspace_id,mode,routine_model,escalation_model,prompt_version,target_count,timeout_ms,agent_call_id,metadata)
      values($1,'shadow',$2,$3,'contact-evidence-v1',1,30000,$4,$5) returning id,status,metadata`,[candidate.workspace_id,versions.routine,versions.escalation,agentCallId,
      JSON.stringify({emailCandidateId:candidate.id,sourceStatus:candidate.source_status,candidateSeenAt:candidate.last_seen_at,
        currentDecisionId:candidate.current_decision_id,evidenceIds:evidence.map(row=>row.id),evidenceHash:digest(evidence)})]);
    return {...created.rows[0],fresh:true};
  });
  if(reserved.status==="completed"&&reserved.metadata.decisionHash){
    const [saved]=await tenantQuery<{id:string}>(userId,"select id from contact_verification_decision where run_id=$1 and email_candidate_id=$2",[reserved.id,candidate.id]);
    return {status:"evaluated" as const,decisionId:saved?.id,decision:reserved.metadata.decision,decisionHash:reserved.metadata.decisionHash,
      email:candidate.email,currentDecisionId:reserved.metadata.currentDecisionId??null,reused:true};
  }
  if(!reserved.fresh||reserved.status!=="running"||reserved.metadata.decisionHash)return {status:"unavailable" as const,missing:["Existing verification attempt requires reconciliation"]};
  const domain=candidate.email.split("@").at(-1)??"";
  const result=await new ContactVerificationAgent(provider).runShadow({
    company:{id:candidate.company_id,canonicalName:candidate.canonical_name,officialDomains:[candidate.domain]},
    candidate:{fullName:candidate.full_name??undefined,jobTitle:candidate.job_title??undefined,email:candidate.email,derivation:derivation(candidate)},
    evidence:evidence.map(evidenceDocument),emailTechnical:{syntaxValid:/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate.email),
      companyDomainMatches:domain===candidate.domain||domain.endsWith(`.${candidate.domain}`),mailRouting:"Unknown",disposable:false,deliveryStatus:"NotTested"},
    requestedAt:new Date().toISOString(),
  },AbortSignal.timeout(30_000));
  const decisionHash=digest(result.decision);
  const decisionId=await tenantTransaction(userId,async client=>{
    for(const [index,trace] of result.modelTraces.entries())await client.query(`insert into contact_model_assessment
      (run_id,company_id,email_candidate_id,sequence_number,provider,model_version,prompt_version,provider_request_id,latency_ms,prompt_tokens,completion_tokens,reasoning_tokens,total_tokens,output,warnings)
      values($1,$2,$3,$4,'deepseek',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) on conflict do nothing`,[reserved.id,candidate.company_id,candidate.id,index+1,trace.modelVersion,trace.promptVersion,
      trace.providerRequestId??null,trace.latencyMs,trace.usage?.promptTokens??0,trace.usage?.completionTokens??0,trace.usage?.reasoningTokens??0,trace.usage?.totalTokens??0,JSON.stringify(trace.output),trace.warnings]);
    const saved=await client.query<{id:string}>(`insert into contact_verification_decision
      (run_id,company_id,contact_id,email_candidate_id,shadow,current,category,lifecycle_status,contact_type,confidence_score,role_relevance_score,reachability_score,development_priority,employment_status,email_evidence_status,delivery_status,matched_rule_ids,evidence_ids,reasons,review_flags,decided_at)
      values($1,$2,$3,$4,true,false,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::uuid[],$17,$18,$19) returning id`,[reserved.id,candidate.company_id,candidate.contact_id,candidate.id,
      result.decision.category,result.decision.lifecycleStatus,result.decision.contactType,result.decision.confidenceScore,result.decision.roleRelevanceScore,result.decision.reachabilityScore,result.decision.developmentPriority,
      result.decision.employmentStatus,result.decision.emailEvidenceStatus,result.decision.deliveryStatus,result.decision.matchedRuleIds,result.decision.evidenceIds,result.decision.reasons,result.decision.reviewFlags,result.decision.decidedAt]);
    await client.query(`update contact_verification_run set status='completed',processed_count=1,model_call_count=$2,total_tokens=$3,
      metadata=metadata||$4::jsonb,finished_at=now() where id=$1`,[reserved.id,result.modelTraces.length,result.totalTokens,JSON.stringify({decision:result.decision,decisionHash})]);
    return saved.rows[0].id;
  });
  return {status:"evaluated" as const,decisionId,decision:result.decision,decisionHash,email:candidate.email,currentDecisionId:candidate.current_decision_id,reused:false};
}

export async function publishSavedContactDecision(userId:string,input:{decisionId:string;decisionHash:string;email:string;category:ContactVerificationDecision["category"];activeStatus:ContactSourceStatus;expectedCurrentDecisionId:string|null}){
  return tenantTransaction(userId,async client=>{
    const found=await client.query<{run_id:string;email_candidate_id:string;company_id:string;contact_id:string|null;current:boolean;metadata:Run["metadata"];email:string;source_status:ContactSourceStatus;last_seen_at:string;verification_decision_id:string|null}>(`select d.run_id,d.email_candidate_id,d.company_id,d.contact_id,d.current,r.metadata,lower(em.email) as email,em.source_status,em.last_seen_at::text,em.verification_decision_id
      from contact_verification_decision d join contact_verification_run r on r.id=d.run_id
      join market_workspace w on w.id=r.workspace_id and w.owner_id=$1
      join company_email_candidate em on em.id=d.email_candidate_id and em.workspace_id=r.workspace_id
      where d.id=$2 for update of d,em`,[userId,input.decisionId]);
    const row=found.rows[0];if(!row||!row.metadata.decision||!row.metadata.decisionHash)throw new Error("Owned evaluated contact decision is missing");
    const decision=row.metadata.decision;
    const publication=planContactPublication(decision,row.metadata.sourceStatus??row.source_status);
    if(row.metadata.decisionHash!==input.decisionHash||row.email!==input.email.toLowerCase()||decision.category!==input.category||publication.activeStatus!==input.activeStatus)
      throw new Error("Contact decision changed; review the exact result again");
    if(row.current&&row.verification_decision_id===input.decisionId)return {published:true,reused:true,decisionId:input.decisionId,activeStatus:publication.activeStatus};
    if(row.verification_decision_id!==input.expectedCurrentDecisionId||row.metadata.currentDecisionId!==input.expectedCurrentDecisionId||row.source_status!==row.metadata.sourceStatus||row.last_seen_at!==row.metadata.candidateSeenAt)
      throw new Error("Contact source or current verification changed; reevaluate before publication");
    const evidence=await client.query<Evidence>("select id,provider,source_kind,url,title,excerpt,captured_at::text from company_web_evidence where id=any($1::uuid[]) and company_id=$2 order by captured_at desc,id desc",[row.metadata.evidenceIds??[],row.company_id]);
    if(digest(evidence.rows)!==row.metadata.evidenceHash)throw new Error("Contact evidence changed; reevaluate before publication");
    await client.query("update contact_verification_decision set current=false,superseded_at=now() where email_candidate_id=$1 and current",[row.email_candidate_id]);
    await client.query("update contact_verification_decision set current=true,shadow=false,published_at=now() where id=$1",[input.decisionId]);
    await client.query("update company_email_candidate set status=$2,verification_decision_id=$3 where id=$1",[row.email_candidate_id,publication.activeStatus,input.decisionId]);
    if(publication.accepted&&row.contact_id)await client.query("update company_contact set status='Verified' where id=$1 and company_id=$2",[row.contact_id,row.company_id]);
    if(publication.needsReview)await client.query("insert into contact_review_queue(decision_id,priority,review_flags) values($1,$2,$3) on conflict(decision_id) do nothing",[input.decisionId,decision.developmentPriority,decision.reviewFlags]);
    await client.query(`update contact_verification_run set published_count=1,accepted_count=$2,review_count=$3,invalidated_count=$4 where id=$1`,[row.run_id,Number(publication.accepted),Number(publication.needsReview),Number(publication.invalidated)]);
    return {published:true,reused:false,decisionId:input.decisionId,activeStatus:publication.activeStatus,needsReview:publication.needsReview};
  });
}
