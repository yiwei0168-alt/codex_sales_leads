import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

import type { CompanyRecord, Evidence } from "@/lib/domain";
import { tenantQuery, tenantTransaction } from "@/lib/rag/db";

import type {
  CorrectedLeadWorkflowCandidate,
  LeadCandidateAssessment,
  LeadMarketPlaybook,
  LeadRagCitation,
  LeadWorkflowPhase,
  LeadWorkflowResult,
} from "./types";

function externalId(countryCode: string, domain: string): string {
  return `langgraph-${countryCode.toLowerCase()}-${createHash("sha256").update(domain).digest("hex").slice(0, 16)}`;
}

export async function getGlobalWorkspaceId(userId: string): Promise<string> {
  const rows = await tenantQuery<{ id: string }>(userId,
    `select id from market_workspace where owner_id = $1 and slug = 'global-sales' and status = 'active' limit 1`, [userId]);
  if (!rows[0]) throw new Error("Global sales workspace not found");
  return rows[0].id;
}

export async function updateWorkflowPhase(userId: string, actionId: string, phase: LeadWorkflowPhase): Promise<void> {
  await tenantQuery(userId,
    `update lead_workflow_job set phase = $3, updated_at = now() where action_id = $1 and user_id = $2`,
    [actionId, userId, phase]);
}

function companyEvidence(candidate: CorrectedLeadWorkflowCandidate, assessment: LeadCandidateAssessment): Evidence[] {
  const cited = new Set(assessment.evidenceIds);
  const claimsByEvidence = new Map<string, string[]>();
  const confidenceByEvidence = new Map<string, number[]>();
  for (const finding of candidate.correction.findings) {
    if (finding.status !== "supported") continue;
    for (const evidenceId of finding.evidenceIds) {
      claimsByEvidence.set(evidenceId, [...(claimsByEvidence.get(evidenceId) ?? []), finding.statement]);
      confidenceByEvidence.set(evidenceId, [...(confidenceByEvidence.get(evidenceId) ?? []), finding.confidence]);
    }
  }
  for (const rationale of assessment.dimensionRationales) {
    for (const evidenceId of rationale.evidenceIds) {
      claimsByEvidence.set(evidenceId, [...(claimsByEvidence.get(evidenceId) ?? []), rationale.reason]);
      confidenceByEvidence.set(evidenceId, [...(confidenceByEvidence.get(evidenceId) ?? []), rationale.confidence]);
    }
  }
  return candidate.evidence.filter((item) => cited.has(item.id)).slice(0, 8).map((item) => ({
    id: item.id,
    sourceUrl: item.url,
    title: item.title,
    sourceType: item.sourceType === "official-website" ? "Company website" : "Industry publication",
    capturedAt: item.capturedAt.slice(0, 10),
    claim: [...new Set(claimsByEvidence.get(item.id) ?? [])].slice(0, 3).join(" ")
      || "This source was cited by the assessment but has no atomic claim mapping; review before external use.",
    summary: item.excerpt.slice(0, 700),
    status: item.sourceType === "official-website" ? "Corroborated" : "Inferred",
    confidence: Math.round(Math.min(assessment.confidence,
      ...(confidenceByEvidence.get(item.id) ?? [assessment.confidence]))),
  }));
}

function companyRecord(
  candidate: CorrectedLeadWorkflowCandidate,
  assessment: LeadCandidateAssessment,
  countryCode: string,
  countryName: string,
  runId: string,
): CompanyRecord {
  const roles = assessment.roles.length ? assessment.roles : candidate.queryRoles;
  const primary = assessment.primaryRole ?? roles[0];
  const isDistribution = primary === "Distributor" || primary === "VAD";
  const evidence = companyEvidence(candidate, assessment);
  return {
    id: externalId(countryCode, candidate.domain),
    legalName: candidate.companyName,
    displayName: candidate.companyName,
    domain: candidate.domain,
    city: countryName,
    country: countryName,
    layer: isDistribution ? "Tier-1 Distributor" : "Downstream Channel",
    roles,
    accountTier: assessment.accountTier,
    supplyModel: assessment.supplyModel,
    brandInvolvement: assessment.brandInvolvement,
    fitScore: assessment.totalScore,
    accountValue: assessment.totalScore,
    reachability: 50,
    evidenceConfidence: assessment.confidence,
    summary: assessment.summary,
    opportunityStage: assessment.totalScore >= 80 ? "Priority" : "Qualified",
    priority: assessment.totalScore >= 80 ? "High" : assessment.totalScore >= 65 ? "Medium" : "Low",
    owner: "Workspace Owner",
    nextAction: "Review the evidence and decide whether to initiate the optional contact-enrichment workflow.",
    risks: assessment.risks,
    unknowns: assessment.unknowns,
    evidence: evidence.length ? evidence : [{
      id: candidate.evidence[0]?.id ?? `evidence-${candidate.candidateId}`,
      sourceUrl: candidate.evidence[0]?.url ?? candidate.officialWebsiteUrl,
      title: candidate.evidence[0]?.title ?? candidate.companyName,
      sourceType: "Company website",
      capturedAt: new Date().toISOString().slice(0, 10),
      claim: "Candidate identity requires additional evidence review.",
      summary: candidate.evidence[0]?.excerpt ?? "Public candidate website.",
      status: "Inferred",
      confidence: assessment.confidence,
    }],
    leadType: "Channel",
    searchRunId: runId,
  };
}

async function saveCompany(client: PoolClient, workspaceId: string, record: CompanyRecord, countryCode: string, runId: string): Promise<void> {
  let company = await client.query<{ id: string }>(`select id from sales_company where lower(domain) = lower($1) limit 1`, [record.domain]);
  if (!company.rows[0]) {
    company = await client.query<{ id: string }>(
      `insert into sales_company (external_id, canonical_name, domain, country_code, city, source_kind, record)
       values ($1, $2, $3, $4, $5, 'langgraph-qualified', $6) returning id`,
      [record.id, record.displayName, record.domain, countryCode, record.city, JSON.stringify(record)],
    );
  } else {
    await client.query(
      `update sales_company set canonical_name = $2, country_code = $3, city = $4,
         source_kind = 'langgraph-qualified', record = $5, updated_at = now() where id = $1`,
      [company.rows[0].id, record.displayName, countryCode, record.city, JSON.stringify(record)],
    );
  }
  await client.query(
    `insert into workspace_company (workspace_id, company_id, account_tier, supply_model, brand_involvement,
       opportunity_stage, priority, owner_name, next_action, manually_edited, market_country_code, search_run_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, $10, $11)
     on conflict (workspace_id, company_id) do update set account_tier = excluded.account_tier,
       supply_model = excluded.supply_model, brand_involvement = excluded.brand_involvement,
       opportunity_stage = excluded.opportunity_stage, priority = excluded.priority,
       next_action = excluded.next_action, market_country_code = excluded.market_country_code,
       search_run_id = excluded.search_run_id, updated_at = now()
     where workspace_company.manually_edited = false`,
    [workspaceId, company.rows[0].id, record.accountTier, record.supplyModel, record.brandInvolvement,
      record.opportunityStage, record.priority, record.owner, record.nextAction, countryCode, runId],
  );
}

export async function persistLeadWorkflowResult(input: {
  userId: string;
  actionId: string;
  workspaceId: string;
  graphThreadId: string;
  runId: string;
  countryCode: string;
  countryName: string;
  requested: number;
  creditsUsed: number;
  ragContext: LeadRagCitation[];
  playbook: LeadMarketPlaybook;
  candidates: CorrectedLeadWorkflowCandidate[];
  assessments: LeadCandidateAssessment[];
  warnings: string[];
}): Promise<LeadWorkflowResult> {
  const candidateById = new Map(input.candidates.map((item) => [item.candidateId, item]));
  const selected = input.assessments
    .filter((item) => item.scoringStatus === "completed" && item.eligible && item.totalScore >= 50
      && candidateById.has(item.candidateId))
    .sort((left, right) => right.totalScore - left.totalScore || right.confidence - left.confidence)
    .slice(0, input.requested);
  const selectedIds = new Map(selected.map((item, index) => [item.candidateId, index + 1]));
  await tenantTransaction(input.userId, async (client) => {
    for (const assessment of input.assessments) {
      const candidate = candidateById.get(assessment.candidateId);
      if (!candidate) continue;
      const rank = selectedIds.get(assessment.candidateId);
      await client.query(
        `insert into lead_candidate_assessment (
           user_id, run_id, candidate_id, company_name, domain, official_website_url, roles, primary_role,
           eligible, total_score, confidence, gates, dimensions, account_tier, supply_model,
           brand_involvement, summary, reasons, risks, unknowns, evidence, correction, evidence_ids,
           fact_ledger, dimension_rationales, scoring_status, model, prompt_version, escalated, warnings, selected, selected_rank
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)
         on conflict (run_id, candidate_id) do update set roles=excluded.roles, primary_role=excluded.primary_role,
           eligible=excluded.eligible, total_score=excluded.total_score, confidence=excluded.confidence,
           gates=excluded.gates, dimensions=excluded.dimensions, account_tier=excluded.account_tier,
           supply_model=excluded.supply_model, brand_involvement=excluded.brand_involvement,
           summary=excluded.summary, reasons=excluded.reasons, risks=excluded.risks, unknowns=excluded.unknowns,
           evidence=excluded.evidence, correction=excluded.correction, evidence_ids=excluded.evidence_ids, model=excluded.model,
           fact_ledger=excluded.fact_ledger, dimension_rationales=excluded.dimension_rationales,
           scoring_status=excluded.scoring_status,
           prompt_version=excluded.prompt_version, escalated=excluded.escalated, warnings=excluded.warnings,
           selected=excluded.selected, selected_rank=excluded.selected_rank, updated_at=now()`,
        [input.userId, input.runId, assessment.candidateId, candidate.companyName, candidate.domain,
          candidate.officialWebsiteUrl, assessment.roles, assessment.primaryRole, assessment.eligible,
          assessment.totalScore, assessment.confidence, JSON.stringify(assessment.gates), JSON.stringify(assessment.dimensions),
          assessment.accountTier, assessment.supplyModel, assessment.brandInvolvement, assessment.summary,
          assessment.reasons, assessment.risks, assessment.unknowns, JSON.stringify(candidate.evidence), JSON.stringify(candidate.correction), assessment.evidenceIds,
          JSON.stringify(candidate.correction.findings), JSON.stringify(assessment.dimensionRationales), assessment.scoringStatus,
          assessment.model, assessment.promptVersion, assessment.escalated, assessment.warnings, Boolean(rank), rank ?? null],
      );
      if (rank) await saveCompany(client, input.workspaceId,
        companyRecord(candidate, assessment, input.countryCode, input.countryName, input.runId), input.countryCode, input.runId);
    }
    const selectedDomains = selected.map((item) => candidateById.get(item.candidateId)!.domain);
    await client.query(`update lead_search_result set accepted = domain = any($2::text[]) where run_id = $1`, [input.runId, selectedDomains]);
    await client.query(
      `update lead_search_run set status='completed', accepted_count=$2, credits_used=$3,
         graph_thread_id=$4, workflow_phase='completed', rag_chunk_ids=$5::uuid[],
         metadata=metadata || $6::jsonb, finished_at=now() where id=$1`,
      [input.runId, selected.length, input.creditsUsed, input.graphThreadId, input.ragContext.map((item) => item.chunkId),
        JSON.stringify({ playbook: input.playbook, assessmentCount: input.assessments.length, workflowWarnings: input.warnings })],
    );
  });
  return {
    runId: input.runId,
    countryCode: input.countryCode,
    countryName: input.countryName,
    requested: input.requested,
    discovered: input.candidates.length,
    assessed: input.assessments.length,
    qualified: input.assessments.filter((item) => item.scoringStatus === "completed"
      && item.eligible && item.totalScore >= 50).length,
    accepted: selected.length,
    creditsUsed: input.creditsUsed,
    ragCitationCount: input.ragContext.length,
    graphThreadId: input.graphThreadId,
    warnings: input.warnings,
  };
}
