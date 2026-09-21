import {tenantQuery,tenantTransaction} from "@/lib/rag/db";
import {ACTIVE_LEAD_SCORING_POLICY,scoringPolicyChecksum} from "@/lib/leads/scoring-policy";
import {isCurrentLeadScoringEvidence} from "@/lib/leads/evidence-snapshot";
import {saveCompanyMarketAssessment} from "@/lib/sales/company-market-state";
import {companyRecord,saveEvidenceSnapshots} from "./persistence";
import {hasCompletedAssessmentReview} from "./review-acceptance";
import type {CorrectedLeadWorkflowCandidate,LeadCandidateAssessment,LeadAssessmentReview} from "./types";
import type {LeadSearchPlan} from "@/lib/assistant/types";
import type {ToolResult} from "@/lib/assistant/main/contracts";

type ReviewedResearch={candidate:CorrectedLeadWorkflowCandidate;plan:LeadSearchPlan;assessment:LeadCandidateAssessment;reviews:LeadAssessmentReview[];scoringPolicyVersion:string;scoringPolicyChecksum:string;publication:"research-only"};
type Company={workspace_id:string;company_id:string;revision:string;domain:string};
export async function publishReviewedStandaloneScore(userId:string,input:{sourceCallId:string;companyExternalId:string;expectedRevision:number;expectedDomain:string;expectedTotalScore:number;expectedPolicyVersion:string}){
  const [source]=await tenantQuery<{output:ToolResult;run_id:string}>(userId,`select output,run_id from agent_tool_call
    where id=$1 and user_id=$2 and tool_id='score_review' and status='completed' and output->>'status' in('success','partial')`,[input.sourceCallId,userId]);
  const data=source?.output.data as ReviewedResearch|undefined;
  if(!data||data.publication!=="research-only"||!data.assessment||!data.candidate?.correction||!Array.isArray(data.reviews))
    return {status:"missing_input" as const,missing:["Saved completed score_review tool result with corrected evidence and assessment"]};
  const {candidate,assessment,plan}=data;
  const review=data.reviews.find(item=>item.candidateId===candidate.candidateId);
  if(assessment.candidateId!==candidate.candidateId||assessment.scoringStatus!=="completed"||assessment.eligibilityStatus!=="eligible"||!assessment.eligible||!hasCompletedAssessmentReview(review))
    return {status:"missing_input" as const,missing:["Eligible completed assessment and completed independent review"]};
  if(candidate.domain.toLowerCase()!==input.expectedDomain.toLowerCase()||assessment.totalScore!==input.expectedTotalScore||input.expectedPolicyVersion!==ACTIVE_LEAD_SCORING_POLICY.version||
    data.scoringPolicyVersion!==ACTIVE_LEAD_SCORING_POLICY.version||data.scoringPolicyChecksum!==scoringPolicyChecksum())
    return {status:"missing_input" as const,missing:["Current company domain, score and scoring-policy version for exact approval"]};
  const [prior]=await tenantQuery<{id:string}>(userId,`select r.id from lead_search_run r join market_workspace w on w.id=r.workspace_id and w.owner_id=$1
    where r.metadata->>'standaloneScoreSourceCallId'=$2 and r.metadata->>'companyExternalId'=$3 and r.country_code=$4`,[userId,input.sourceCallId,input.companyExternalId,plan.countryCode]);
  if(prior)return {status:"published" as const,runId:prior.id,reused:true,companyExternalId:input.companyExternalId,score:assessment.totalScore,policyVersion:ACTIVE_LEAD_SCORING_POLICY.version};
  const cited=new Set(assessment.evidenceIds);
  const eligible=candidate.evidence.filter(item=>cited.has(item.id)&&isCurrentLeadScoringEvidence(item,candidate.evidenceSnapshotRunId));
  if(!cited.size||eligible.length!==cited.size||eligible.some(item=>!Number.isFinite(Date.parse(item.capturedAt))||Date.now()-Date.parse(item.capturedAt)>30*86400_000||Date.parse(item.capturedAt)>Date.now()+300_000))
    return {status:"missing_input" as const,missing:["Current cited evidence captured or revalidated within 30 days"]};
  const [company]=await tenantQuery<Company>(userId,`select wc.workspace_id,wc.company_id,locked.revision,c.domain
    from user_company_market wc join workspace_company_market locked on locked.workspace_id=wc.workspace_id and locked.candidate_id=wc.candidate_id
    join market_workspace w on w.id=wc.workspace_id and w.owner_id=$1 and w.slug='global-sales'
    join sales_company c on c.id=wc.company_id
    where wc.candidate_id=$2 and wc.market_country_code=$3 and lower(c.domain)=lower($4)`,[userId,input.companyExternalId,plan.countryCode,candidate.domain]);
  if(!company)return {status:"missing_input" as const,missing:["Owned company in the same market and official domain"]};
  if(Number(company.revision)!==input.expectedRevision)return {status:"missing_input" as const,missing:["Current company market revision; reread before publishing"]};
  const policyChecksum=scoringPolicyChecksum();
  const published=await tenantTransaction(userId,async client=>{
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[`standalone-score:${input.sourceCallId}`]);
    const existing=await client.query<{id:string}>("select id from lead_search_run where metadata->>'standaloneScoreSourceCallId'=$1 and workspace_id=$2",[input.sourceCallId,company.workspace_id]);
    if(existing.rows[0])return {runId:existing.rows[0].id,reused:true};
    const current=await client.query<{revision:string}>("select revision from workspace_company_market where workspace_id=$1 and company_id=$2 and country_code=$3 for update",[company.workspace_id,company.company_id,plan.countryCode]);
    if(Number(current.rows[0]?.revision)!==input.expectedRevision)throw new Error("Company revision changed; reread before publishing formal score");
    const policy=await client.query<{id:string}>("select id from lead_scoring_policy where policy_key=$1 and version=$2 limit 1",[ACTIVE_LEAD_SCORING_POLICY.policyKey,ACTIVE_LEAD_SCORING_POLICY.version]);
    if(!policy.rows[0])throw new Error("Formal scoring policy version is not published");
    const run=await client.query<{id:string}>(`insert into lead_search_run(workspace_id,provider,status,target_count,accepted_count,country_code,market_name,objective,
      scoring_policy_id,scoring_policy_version,scoring_policy_checksum,scoring_policy_snapshot,metadata,finished_at)
      values($1,'main-agent-standalone-score','completed',1,1,$2,$3,$4,$5,$6,$7,$8,$9,now()) returning id`,[company.workspace_id,plan.countryCode,plan.countryName,plan.objective,
      policy.rows[0].id,ACTIVE_LEAD_SCORING_POLICY.version,policyChecksum,JSON.stringify(ACTIVE_LEAD_SCORING_POLICY),
      JSON.stringify({standaloneScoreSourceCallId:input.sourceCallId,companyExternalId:input.companyExternalId,agentRunId:source.run_id,sourceEvidenceRunId:candidate.evidenceSnapshotRunId,reviewStatus:review?.status})]);
    await saveEvidenceSnapshots(client,userId,run.rows[0].id,candidate);
    await client.query(`insert into lead_candidate_assessment
      (user_id,run_id,candidate_id,company_name,domain,official_website_url,roles,primary_role,eligible,total_score,confidence,gates,dimensions,account_tier,supply_model,
       brand_involvement,summary,reasons,risks,unknowns,evidence,correction,evidence_ids,fact_ledger,dimension_rationales,scoring_status,assessment_review,
       eligibility_status,score_lower,score_upper,research_depth,primary_business_role,company_scale_class,recommendation_priority,model,prompt_version,escalated,warnings,selected,selected_rank)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,true,1)`,
      [userId,run.rows[0].id,candidate.candidateId,candidate.companyName,candidate.domain,candidate.officialWebsiteUrl,assessment.roles,assessment.primaryRole,assessment.eligible,
        assessment.totalScore,assessment.confidence,JSON.stringify(assessment.gates),JSON.stringify(assessment.dimensions),assessment.accountTier,assessment.supplyModel,
        assessment.brandInvolvement,assessment.summary,assessment.reasons,assessment.risks,assessment.unknowns,JSON.stringify(candidate.evidence),JSON.stringify(candidate.correction),
        assessment.evidenceIds,JSON.stringify(candidate.correction.findings),JSON.stringify(assessment.dimensionRationales),assessment.scoringStatus,JSON.stringify(review),
        assessment.eligibilityStatus,assessment.scoreRange.lower,assessment.scoreRange.upper,assessment.researchDepth,assessment.primaryRole,assessment.companyScaleClass,
        assessment.recommendationPriority,assessment.model,assessment.promptVersion,assessment.escalated,assessment.warnings]);
    await saveCompanyMarketAssessment(client,{workspaceId:company.workspace_id,companyId:company.company_id,country:plan.countryCode,
      record:companyRecord(candidate,assessment,plan.countryCode,plan.countryName,run.rows[0].id),runId:run.rows[0].id});
    return {runId:run.rows[0].id,reused:false};
  });
  return {status:"published" as const,...published,companyExternalId:input.companyExternalId,score:assessment.totalScore,policyVersion:ACTIVE_LEAD_SCORING_POLICY.version};
}
