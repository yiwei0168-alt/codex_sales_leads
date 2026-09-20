import { z } from "zod";
import { randomUUID } from "node:crypto";
import { defineTool } from "./tool-definition";
import { result, type ExecutionContext, type ToolResult } from "./contracts";
import { tenantQuery } from "@/lib/rag/db";
import { ALL_CHANNEL_ROLES, type LeadWorkflowCandidate, type CorrectedLeadWorkflowCandidate, type LeadCandidateAssessment } from "@/lib/leads/workflow/types";
import type { LeadSearchPlan } from "../types";
import { findReusablePublicEvidence } from "@/lib/leads/workflow/public-evidence-repository";
import { collectLeadEvidence } from "@/lib/leads/workflow/discovery";
import { LeadEvidenceCorrectionAgent } from "@/lib/leads/workflow/evidence-correction-agent";
import { LeadQualificationAgent } from "@/lib/leads/workflow/qualification-agent";
import { LeadAssessmentReviewAgent } from "@/lib/leads/workflow/assessment-review-agent";
import { buildStandardLeadMarketPlaybook } from "@/lib/leads/workflow/playbook";
import { validCompanyDomainIdentity } from "@/lib/leads/workflow/candidate-registry";
import { isCurrentLeadScoringEvidence } from "@/lib/leads/evidence-snapshot";

type Research = { candidate: LeadWorkflowCandidate | CorrectedLeadWorkflowCandidate; plan: LeadSearchPlan; assessment?: LeadCandidateAssessment; publication: "research-only" };
const references = ["company_research", "evidence_collect", "role_correct", "company_score", "score_review"];
const referenceSchema = z.object({ sourceCallId: z.uuid() }).strict();
/** Read server-produced artifacts. Model-supplied scores/corrections are never accepted as receipts. */
export async function loadResearch(c: ExecutionContext, id: string): Promise<Research | null> {
  const rows = await tenantQuery<{ output: ToolResult }>(c.userId,"select output from agent_tool_call where user_id=$1 and id=$2 and tool_id=any($3::text[]) and status='completed' and output->>'status' in('success','partial')",[c.userId,id,references]);
  const data=rows[0]?.output.data as Research | undefined;
  return data?.candidate && data.plan && data.publication==="research-only" ? data : null;
}
function missingReference() { return result(null,{status:"missing_input",missing:["An accessible saved research callId; main-model text is not a tool receipt"]}); }
function corrected(value: LeadWorkflowCandidate): value is CorrectedLeadWorkflowCandidate { return "correction" in value; }
export const researchTools = [
  defineTool({id:"company_research",description:"Start or revisit one nominated company using existing public evidence, without market discovery or a model call. Returns a reusable research artifact; supplied names/domains remain user nominations, not verified identity.",input:z.object({companyName:z.string().min(2).max(300),domain:z.string().max(253).refine(validCompanyDomainIdentity),countryCode:z.string().regex(/^[A-Z]{2}$/),countryName:z.string().min(1).max(120),objective:z.enum(["new-market","existing-distributor-growth"]).default("new-market"),roles:z.array(z.enum(ALL_CHANNEL_ROLES)).min(1).max(13).default(ALL_CHANNEL_ROLES)}).strict(),execute:async(i,c)=>{
    const saved=await findReusablePublicEvidence({domain:i.domain,countryCode:i.countryCode,evidenceRunId:c.runId,includeStale:true,maximumChunks:20});
    const candidate:LeadWorkflowCandidate={candidateId:randomUUID(),evidenceSnapshotRunId:c.runId,companyName:i.companyName,domain:i.domain,officialWebsiteUrl:`https://${i.domain}/`,queryRoles:i.roles,queryFamily:"distribution",providerScore:0,userNominated:true,evidence:saved.evidence,evidenceWarnings:saved.stale?["Some stored evidence is stale"]:[]};
    const plan:LeadSearchPlan={countryCode:i.countryCode,countryName:i.countryName,objective:i.objective,roles:i.roles,targetCount:1,queryLanguage:"en",userRequest:`Assess nominated company ${i.companyName}`};
    return result({candidate,plan,publication:"research-only"},{sources:saved.evidence.map(e=>({title:e.title,url:e.url})),missing:saved.evidence.length?[]:["No saved public evidence; collect only if needed"]});
  }}),
  defineTool({id:"evidence_collect",description:"Collect targeted public evidence for one saved research company, reusing existing evidence. No market planning/discovery/score prerequisite. Stored research remains available on provider failure.",input:referenceSchema,cost:"unknown",effect:"reversible",connections:["tavily"],execute:async(i,c)=>{
    const data=await loadResearch(c,i.sourceCallId);if(!data)return missingReference();
    const collected=await collectLeadEvidence([data.candidate],data.plan,{allowReusableEvidence:true,persistEvidence:true,maximumAttempts:2,concurrency:1});
    // Updated evidence invalidates a prior role/score interpretation rather than silently reusing it.
    const candidate={...collected.candidates[0]} as LeadWorkflowCandidate & {correction?:unknown}; delete candidate.correction;
    return result({candidate,plan:data.plan,publication:"research-only",warnings:collected.warnings,providerMetrics:collected.providerMetrics},{status:collected.warnings.length?"partial":"success",sources:candidate.evidence.map(e=>({title:e.title,url:e.url}))});
  }}),
  defineTool({id:"role_correct",description:"Independently interpret company identity/role using saved public evidence. Does not automatically supplement evidence or run scoring. Missing evidence remains unresolved; provider failure is not business disqualification.",input:referenceSchema,cost:"unknown",connections:["lead-specialist"],execute:async(i,c)=>{
    const data=await loadResearch(c,i.sourceCallId);if(!data)return missingReference();
    if(!data.candidate.evidence.some(e=>isCurrentLeadScoringEvidence(e,data.candidate.evidenceSnapshotRunId)))return result(data,{status:"missing_input",missing:["Current evidenced source text, not discovery snippets"]});
    const response=await new LeadEvidenceCorrectionAgent(undefined,undefined,{supplementEvidence:false,concurrency:1}).correct([data.candidate],data.plan);
    return result({candidate:response.candidates[0],plan:data.plan,publication:"research-only",usage:response.usage,warnings:response.warnings},{status:response.candidates[0]?.correction.completionStatus==="completed"?"success":"partial"});
  }}),
  defineTool({id:"company_score",description:"Score an existing corrected evidence artifact using the unchanged official rubric/arithmetic/citation contracts. No discovery, extra research or independent review is forced. Saves a research result; official company publication is a separate operation.",input:referenceSchema,cost:"unknown",connections:["lead-specialist"],execute:async(i,c)=>{
    const data=await loadResearch(c,i.sourceCallId);if(!data)return missingReference();
    if(!corrected(data.candidate))return result(data,{status:"missing_input",missing:["Evidence-backed role interpretation; use an existing corrected artifact or role_correct"]});
    const response=await new LeadQualificationAgent(undefined,{includeCooperationPaths:false,concurrency:1}).evaluateWithUsage([data.candidate],buildStandardLeadMarketPlaybook(data.plan,[]),data.plan.countryCode,data.plan.countryName,data.plan.objective);
    return result({...data,assessment:response.assessments[0],usage:response.usage},{status:response.assessments[0]?.scoringStatus==="completed"?"success":"partial"});
  }}),
  defineTool({id:"score_review",description:"Independently review a saved scored research artifact on explicit selection. Uses the existing review/judge contracts and preserves unresolved disagreements. Does not rediscover or publish the company.",input:referenceSchema,cost:"unknown",connections:["lead-review-models"],execute:async(i,c)=>{
    const data=await loadResearch(c,i.sourceCallId);if(!data)return missingReference();
    if(!corrected(data.candidate)||!data.assessment)return result(data,{status:"missing_input",missing:["Saved corrected evidence and assessment"]});
    const review=await new LeadAssessmentReviewAgent(undefined,{randomAuditPercent:100,concurrency:1}).review([data.candidate],[data.assessment],buildStandardLeadMarketPlaybook(data.plan,[]),data.plan);
    return result({...data,assessment:review.assessments[0],reviews:review.reviews,usage:review.usage},{status:review.reviews.some(r=>r.status==="review-failed"||r.status==="targeted-research-required")?"partial":"success"});
  }}),
];
