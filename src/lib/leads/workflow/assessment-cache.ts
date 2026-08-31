import { createHash } from "node:crypto";

import { tenantQuery, tenantTransaction } from "@/lib/rag/db";
import { scoringPolicyChecksum, ACTIVE_LEAD_SCORING_POLICY } from "@/lib/leads/scoring-policy";

import { LEAD_QUALIFICATION_PROMPT_VERSION } from "./qualification-agent";
import type { CorrectedLeadWorkflowCandidate, LeadCandidateAssessment, LeadMarketPlaybook } from "./types";
import { LEAD_WORKFLOW_RUNTIME_VERSION } from "./workflow-telemetry";

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function assessmentDependencyFingerprint(candidate: CorrectedLeadWorkflowCandidate,
  playbook: LeadMarketPlaybook, objective: string): string {
  const dependency = {
    runtimeVersion: LEAD_WORKFLOW_RUNTIME_VERSION,
    scoringPolicy: { key: ACTIVE_LEAD_SCORING_POLICY.policyKey,
      version: ACTIVE_LEAD_SCORING_POLICY.version, checksum: scoringPolicyChecksum() },
    promptVersion: LEAD_QUALIFICATION_PROMPT_VERSION,
    objective,
    candidate: { candidateId: candidate.candidateId, domain: candidate.domain,
      evidence: candidate.evidence.map((item) => ({ id: item.id, contentHash: item.contentHash,
        content: item.contentHash ? undefined : { url: item.url, title: item.title, excerpt: item.excerpt },
        freshnessStatus: item.freshnessStatus, sourceType: item.sourceType })),
      correction: { resolvedRoles: candidate.correction.resolvedRoles,
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
  candidates: CorrectedLeadWorkflowCandidate[]; playbook: LeadMarketPlaybook; objective: string }) {
  if (options.candidates.length === 0) return new Map<string, LeadCandidateAssessment>();
  const fingerprints = new Map(options.candidates.map((candidate) => [candidate.candidateId,
    assessmentDependencyFingerprint(candidate, options.playbook, options.objective)]));
  const rows = await tenantQuery<{ candidate_id: string; dependency_fingerprint: string;
    assessment: LeadCandidateAssessment }>(options.userId,
    `select candidate_id, dependency_fingerprint, assessment
       from lead_assessment_cache
      where workspace_id=$1 and candidate_id = any($2::text[])`,
    [options.workspaceId, options.candidates.map((candidate) => candidate.candidateId)]);
  const hits = new Map(rows.filter((row) => fingerprints.get(row.candidate_id) === row.dependency_fingerprint)
    .map((row) => [row.candidate_id, row.assessment]));
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
  objective: string; assessments: LeadCandidateAssessment[] }): Promise<void> {
  const candidateById = new Map(options.candidates.map((candidate) => [candidate.candidateId, candidate]));
  await tenantTransaction(options.userId, async (client) => {
    for (const assessment of options.assessments) {
      if (assessment.scoringStatus !== "completed") continue;
      const candidate = candidateById.get(assessment.candidateId);
      if (!candidate) continue;
      const fingerprint = assessmentDependencyFingerprint(candidate, options.playbook, options.objective);
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
