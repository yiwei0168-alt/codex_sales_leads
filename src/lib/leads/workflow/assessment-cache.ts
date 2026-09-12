import { createHash } from "node:crypto";

import { tenantQuery, tenantTransaction } from "@/lib/rag/db";
import { scoringPolicyChecksum, ACTIVE_LEAD_SCORING_POLICY } from "@/lib/leads/scoring-policy";

import { LEAD_QUALIFICATION_PROMPT_VERSION } from "./qualification-agent";
import type { CorrectedLeadWorkflowCandidate, LeadCandidateAssessment, LeadMarketPlaybook } from "./types";
import { LEAD_WORKFLOW_RUNTIME_VERSION } from "./workflow-telemetry";
import {isCurrentLeadScoringEvidence} from "@/lib/leads/evidence-snapshot";
import {cachedLeadAssessmentSchema} from "./schemas";
import {candidateValueScore} from "../candidate-value";

export function validCachedAssessment(value:unknown,candidate:CorrectedLeadWorkflowCandidate):value is LeadCandidateAssessment{
  const parsed=cachedLeadAssessmentSchema.safeParse(value);if(!parsed.success)return false;
  const assessment=parsed.data;
  if(assessment.candidateId!==candidate.candidateId||assessment.primaryRole!==candidate.correction.primaryRole
    ||assessment.totalScore!==candidateValueScore(assessment.dimensions)
    ||assessment.eligible!==(assessment.eligibilityStatus==="eligible")
    ||assessment.scoreRange.lower>assessment.totalScore||assessment.scoreRange.upper<assessment.totalScore
    ||new Set(assessment.dimensionRationales.map(item=>item.dimension)).size!==7)return false;
  if(assessment.roles.length!==candidate.correction.resolvedRoles.length
    ||new Set(assessment.roles).size!==assessment.roles.length
    ||assessment.roles.some(role=>!candidate.correction.resolvedRoles.includes(role)))return false;
  const evidence=new Set(candidate.evidence.filter(item=>isCurrentLeadScoringEvidence(item,candidate.evidenceSnapshotRunId)).map(item=>item.id));
  const findings=new Set(candidate.correction.findings.map(item=>item.findingId));
  const references=[...assessment.dimensionRationales,...assessment.cooperationPaths];
  if(assessment.evidenceIds.some(id=>!evidence.has(id))||references.some(item=>item.evidenceIds.some(id=>!evidence.has(id))||item.findingIds.some(id=>!findings.has(id))))return false;
  if(assessment.dimensionRationales.some(item=>item.score!==assessment.dimensions[item.dimension]))return false;
  if(assessment.selectedPathId!==null&&!assessment.cooperationPaths.some(path=>path.pathId===assessment.selectedPathId))return false;
  if(assessment.accountTier==="KA"&&["Distributor","VAD"].includes(assessment.primaryRole))return false;
  return new Set(assessment.cooperationPaths.map(path=>path.pathId)).size===assessment.cooperationPaths.length;
}

interface AssessmentCacheContext {countryCode:string;countryName:string;executionContract:string}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function assessmentDependencyFingerprint(candidate: CorrectedLeadWorkflowCandidate,
  playbook: LeadMarketPlaybook, objective: string,context?:AssessmentCacheContext): string {
  const dependency = {
    cacheDependencyVersion:"assessment-cache-dependencies-v2",context:context??null,
    runtimeVersion: LEAD_WORKFLOW_RUNTIME_VERSION,
    scoringPolicy: { key: ACTIVE_LEAD_SCORING_POLICY.policyKey,
      version: ACTIVE_LEAD_SCORING_POLICY.version, checksum: scoringPolicyChecksum() },
    promptVersion: LEAD_QUALIFICATION_PROMPT_VERSION,
    objective,
    candidate: { candidateId: candidate.candidateId, domain: candidate.domain,companyName:candidate.companyName,officialWebsiteUrl:candidate.officialWebsiteUrl,
      evidence: candidate.evidence.map((item) => ({ id: item.id, contentHash: item.contentHash,
        content: { url: item.url, title: item.title, excerpt: item.excerpt },
        effective:isCurrentLeadScoringEvidence(item,candidate.evidenceSnapshotRunId),
        freshnessStatus: item.freshnessStatus, sourceType: item.sourceType })),
      correction: { reasons:candidate.correction.reasons,confidence:candidate.correction.confidence,resolvedRoles: candidate.correction.resolvedRoles,
        resolvedFamilies: candidate.correction.resolvedFamilies, primaryRole: candidate.correction.primaryRole,
        primaryFamily: candidate.correction.primaryFamily, findings: candidate.correction.findings,
        reliedEvidenceIds: candidate.correction.reliedEvidenceIds } },
    playbook: { marketHypothesis: playbook.marketHypothesis, productAngles: playbook.productAngles,
      preferredCompanyTraits: playbook.preferredCompanyTraits,
      cooperationPathMemory: playbook.cooperationPathMemory ?? [] },
  };
  return createHash("sha256").update(stable(dependency)).digest("hex");
}

export async function loadCachedLeadAssessments(options: { userId: string; workspaceId: string;
  candidates: CorrectedLeadWorkflowCandidate[]; playbook: LeadMarketPlaybook; objective: string;
  countryCode?:string;countryName?:string;contracts?:Map<string,string> }) {
  if(!options.countryCode||!options.countryName||!options.contracts?.size)return new Map<string,LeadCandidateAssessment>();
  if (options.candidates.length === 0) return new Map<string, LeadCandidateAssessment>();
  const fingerprints = new Map(options.candidates.map((candidate) => [candidate.candidateId,
    assessmentDependencyFingerprint(candidate, options.playbook, options.objective,{countryCode:options.countryCode!,countryName:options.countryName!,executionContract:options.contracts!.get(candidate.candidateId)??""})]));
  const rows = await tenantQuery<{ candidate_id: string; dependency_fingerprint: string;
    assessment: unknown }>(options.userId,
    `select candidate_id, dependency_fingerprint, assessment
       from lead_assessment_cache
      where workspace_id=$1 and candidate_id = any($2::text[])`,
    [options.workspaceId, options.candidates.map((candidate) => candidate.candidateId)]);
  const candidates=new Map(options.candidates.map(candidate=>[candidate.candidateId,candidate]));
  const hits=new Map<string,LeadCandidateAssessment>();
  for(const row of rows){
    const candidate=candidates.get(row.candidate_id);
    if(candidate&&/^[a-f0-9]{64}$/.test(options.contracts!.get(row.candidate_id)??"")
      &&fingerprints.get(row.candidate_id)===row.dependency_fingerprint&&validCachedAssessment(row.assessment,candidate))hits.set(row.candidate_id,row.assessment);
  }
  if (hits.size > 0) await tenantQuery(options.userId,
    `with hits(candidate_id, dependency_fingerprint) as (
       select * from unnest($2::text[], $3::text[])
     )
     update lead_assessment_cache cache set hit_count=cache.hit_count+1, last_hit_at=now(), updated_at=now()
       from hits where cache.workspace_id=$1 and cache.candidate_id=hits.candidate_id
         and cache.dependency_fingerprint=hits.dependency_fingerprint`,
    [options.workspaceId, [...hits.keys()], [...hits.keys()].map((candidateId) => fingerprints.get(candidateId)!)])
    .catch(() => undefined);
  return hits;
}

export async function saveCachedLeadAssessments(options: { userId: string; workspaceId: string;
  runId?: string; candidates: CorrectedLeadWorkflowCandidate[]; playbook: LeadMarketPlaybook;
  objective: string; assessments: LeadCandidateAssessment[];countryCode?:string;countryName?:string;contracts?:Map<string,string> }): Promise<void> {
  if(!options.countryCode||!options.countryName||!options.contracts?.size)return;
  const candidateById = new Map(options.candidates.map((candidate) => [candidate.candidateId, candidate]));
  await tenantTransaction(options.userId, async (client) => {
    for (const assessment of options.assessments) {
      if (assessment.scoringStatus !== "completed") continue;
      const candidate = candidateById.get(assessment.candidateId);
      if (!candidate||!validCachedAssessment(assessment,candidate)) continue;
      const executionContract=options.contracts!.get(candidate.candidateId);
      if(!executionContract||!/^[a-f0-9]{64}$/.test(executionContract))continue;
      const fingerprint = assessmentDependencyFingerprint(candidate, options.playbook, options.objective,{countryCode:options.countryCode!,countryName:options.countryName!,executionContract});
      await client.query(
        `insert into lead_assessment_cache (
           user_id, workspace_id, candidate_id, canonical_domain, dependency_fingerprint,
           scoring_policy_key, scoring_policy_version, prompt_version, assessment, source_run_id
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
         on conflict (user_id, workspace_id, candidate_id, dependency_fingerprint) do update set
           assessment=excluded.assessment, source_run_id=excluded.source_run_id, updated_at=now()`,
        [options.userId, options.workspaceId, assessment.candidateId, candidate.domain, fingerprint,
          ACTIVE_LEAD_SCORING_POLICY.policyKey, ACTIVE_LEAD_SCORING_POLICY.version,
          LEAD_QUALIFICATION_PROMPT_VERSION, JSON.stringify(assessment), options.runId ?? null],
      );
    }
  });
}
