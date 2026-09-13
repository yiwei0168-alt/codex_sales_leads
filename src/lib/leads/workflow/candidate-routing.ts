import { createHash } from "node:crypto";
import type { LeadSearchPlan } from "@/lib/assistant/types";
import { tenantQuery } from "@/lib/rag/db";
import { normalizedCompanyDomain } from "./candidate-registry";
import { correctionCompletion } from "./correction-completion";
import type { CorrectedLeadWorkflowCandidate, LeadCandidateAssessment } from "./types";

export interface CandidateRoute {
  candidateId: string;
  companyKey: string;
  countryCode: string;
  sourceFamily: string;
  targetFamily: string | null;
  targetRole: string;
  transferKey: string;
  status: "queued" | "transferred" | "out-of-scope" | "pending-role" | "duplicate";
  canonicalCandidateId?: string;
}

export function routeCorrectedCandidates(candidates: CorrectedLeadWorkflowCandidate[], plan: LeadSearchPlan,
  assessments: LeadCandidateAssessment[] = []) {
  const completed = new Set(assessments.filter(item => item.scoringStatus === "completed").map(item => item.candidateId));
  const domains = new Map<string, CorrectedLeadWorkflowCandidate[]>();
  for (const candidate of candidates) {
    const domain = normalizedCompanyDomain(candidate.domain) ?? candidate.domain.trim().toLowerCase().replace(/^www\./, "");
    domains.set(domain, [...(domains.get(domain) ?? []), candidate]);
  }
  const routes: CandidateRoute[] = [];
  const queued: CorrectedLeadWorkflowCandidate[] = [];
  for (const [domain, group] of domains) {
    const usable = group.filter(candidate => correctionCompletion(candidate.correction) === "completed");
    const conflicting = new Set(usable.map(candidate => candidate.correction.primaryRole)).size > 1;
    const ordered = [...group].sort((a, b) => Number(completed.has(b.candidateId)) - Number(completed.has(a.candidateId)));
    let canonical: string | undefined;
    for (const candidate of ordered) {
      const role = candidate.correction.primaryRole;
      const family = candidate.correction.primaryFamily;
      const companyKey = createHash("sha256").update(domain).digest("hex");
      const target = `${plan.countryCode.toUpperCase()}|${companyKey}|${family ?? role}`;
      const pending = conflicting || correctionCompletion(candidate.correction) !== "completed"
        || role === "Hybrid" || role === "Unresolved";
      const inScope = !pending && plan.roles.includes(role as typeof plan.roles[number]);
      const status = pending ? "pending-role" : !inScope ? "out-of-scope" : canonical ? "duplicate"
        : family !== candidate.queryFamily ? "transferred" : "queued";
      routes.push({ candidateId: candidate.candidateId, companyKey, countryCode: plan.countryCode,
        sourceFamily: candidate.queryFamily, targetFamily: family, targetRole: role,
        transferKey: createHash("sha256").update(target).digest("hex"), status,
        ...(status === "duplicate" ? { canonicalCandidateId: canonical } : {}) });
      if (status === "queued" || status === "transferred") {
        canonical = candidate.candidateId; queued.push(candidate);
      }
    }
  }
  return { routes, queued };
}

/** Run metadata also retains candidates that never receive an assessment. No history is rewritten. */
export async function persistCandidateRoutes(input: { userId: string; workspaceId: string; runId: string;
  countryCode: string; routes: CandidateRoute[] }): Promise<void> {
  const rows = await tenantQuery<{ id: string }>(input.userId,
    `update lead_search_run set metadata=metadata || jsonb_build_object('candidateRouting', $5::jsonb)
      where id=$1 and workspace_id=$2 and country_code=$3
        and exists(select 1 from market_workspace where id=$2 and owner_id=$4) returning id`,
    [input.runId, input.workspaceId, input.countryCode, input.userId, JSON.stringify(input.routes)]);
  if (rows.length !== 1) throw new Error("Candidate routing run ownership or country mismatch");
}
