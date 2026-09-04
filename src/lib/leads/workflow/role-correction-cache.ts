import { createHash } from "node:crypto";

import type { LeadSearchPlan } from "@/lib/assistant/types";
import { query, transaction } from "@/lib/rag/db";
import { isCurrentLeadScoringEvidence } from "@/lib/leads/evidence-snapshot";
import { PRIMARY_CHANNEL_POLICY } from "@/lib/leads/primary-channel";

import type { CorrectedLeadWorkflowCandidate, LeadCandidateCorrection,
  LeadWorkflowCandidate } from "./types";

interface CorrectionCacheRow {
  dependency_fingerprint: string;
  correction: LeadCandidateCorrection;
  evidence_bindings: Record<string, { url: string; contentHash: string; sourceType: string }>;
  missing_evidence: string[];
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function roleCorrectionDependency(candidate: LeadWorkflowCandidate, plan: LeadSearchPlan,
  promptVersion: string): { fingerprint: string; evidenceSnapshotHash: string } {
  const evidence = candidate.evidence.filter((item) =>
    isCurrentLeadScoringEvidence(item, candidate.evidenceSnapshotRunId))
    .map((item) => ({ url: item.url, contentHash: item.contentHash, sourceType: item.sourceType }))
    .sort((left, right) => `${left.url}|${left.contentHash}`.localeCompare(`${right.url}|${right.contentHash}`));
  const evidenceSnapshotHash = createHash("sha256").update(stable(evidence)).digest("hex");
  const fingerprint = createHash("sha256").update(stable({ domain: candidate.domain,
    marketCountryCode: plan.countryCode, evidenceSnapshotHash, promptVersion,
    roleTaxonomyVersion: PRIMARY_CHANNEL_POLICY.version })).digest("hex");
  return { fingerprint, evidenceSnapshotHash };
}

function evidenceKey(item: { url: string; contentHash?: string; sourceType: string }): string {
  return `${item.url}|${item.contentHash ?? ""}|${item.sourceType}`;
}

export function rebindCachedCorrection(candidate: LeadWorkflowCandidate, correction: LeadCandidateCorrection,
  bindings: CorrectionCacheRow["evidence_bindings"]): LeadCandidateCorrection | null {
  const currentByKey = new Map(candidate.evidence.filter((item) =>
    isCurrentLeadScoringEvidence(item, candidate.evidenceSnapshotRunId))
    .map((item) => [evidenceKey(item), item.id]));
  const remap = new Map<string, string>();
  for (const [oldId, binding] of Object.entries(bindings)) {
    const currentId = currentByKey.get(evidenceKey(binding));
    if (currentId) remap.set(oldId, currentId);
  }
  const citedIds = new Set([...correction.reliedEvidenceIds,
    ...correction.findings.flatMap((finding) => finding.evidenceIds)]);
  if ([...citedIds].some((id) => !remap.has(id))) return null;
  return {
    ...correction,
    reliedEvidenceIds: [...new Set(correction.reliedEvidenceIds.map((id) => remap.get(id)!))],
    supplementalEvidenceIds: [...new Set(correction.supplementalEvidenceIds
      .flatMap((id) => remap.get(id) ? [remap.get(id)!] : []))],
    findings: correction.findings.map((finding) => ({ ...finding,
      evidenceIds: [...new Set(finding.evidenceIds.map((id) => remap.get(id)!))] })),
  };
}

export async function loadPublicRoleCorrection(candidate: LeadWorkflowCandidate, plan: LeadSearchPlan,
  promptVersion: string): Promise<CorrectedLeadWorkflowCandidate | null> {
  const dependency = roleCorrectionDependency(candidate, plan, promptVersion);
  const rows = await query<CorrectionCacheRow>(
    `select snapshot.dependency_fingerprint, snapshot.correction, snapshot.evidence_bindings,
            snapshot.missing_evidence
       from public_evidence.role_correction_snapshot snapshot
       join public_evidence.company_entity entity on entity.id=snapshot.company_entity_id
      where lower(entity.canonical_domain)=lower($1) and snapshot.market_country_code=$2
        and snapshot.dependency_fingerprint=$3
      order by snapshot.updated_at desc limit 1`,
    [candidate.domain, plan.countryCode, dependency.fingerprint],
  );
  const row = rows[0];
  if (!row) return null;
  const rebound = rebindCachedCorrection(candidate, row.correction, row.evidence_bindings);
  if (!rebound) return null;
  await query(
    `update public_evidence.role_correction_snapshot snapshot
        set hit_count=hit_count+1, last_hit_at=now(), updated_at=now()
       from public_evidence.company_entity entity
      where snapshot.company_entity_id=entity.id and lower(entity.canonical_domain)=lower($1)
        and snapshot.market_country_code=$2 and snapshot.dependency_fingerprint=$3`,
    [candidate.domain, plan.countryCode, dependency.fingerprint],
  ).catch(() => undefined);
  return { ...candidate,
    discoveryGate: candidate.discoveryGate ? { ...candidate.discoveryGate,
      missingEvidence: [...new Set([...candidate.discoveryGate.missingEvidence, ...row.missing_evidence])] }
      : candidate.discoveryGate,
    correction: { ...rebound,
      warnings: [...rebound.warnings, "Reused exact public-evidence role-correction cache entry."] } };
}

export async function savePublicRoleCorrection(candidate: CorrectedLeadWorkflowCandidate,
  plan: LeadSearchPlan, promptVersion: string, sourceRunId?: string): Promise<void> {
  const relied = new Set(candidate.correction.reliedEvidenceIds);
  const cited = candidate.evidence.filter((item) => relied.has(item.id));
  if (cited.length === 0 || cited.some((item) => item.sourceType !== "official-website"
    && item.sourceType !== "independent-public")) return;
  const dependency = roleCorrectionDependency(candidate, plan, promptVersion);
  const missingEvidence = [...new Set([
    ...(candidate.discoveryGate?.missingEvidence ?? []),
    ...candidate.correction.findings.filter((finding) => finding.status === "unknown")
      .map((finding) => finding.statement),
  ])];
  const citedIds = new Set([...candidate.correction.reliedEvidenceIds,
    ...candidate.correction.findings.flatMap((finding) => finding.evidenceIds),
    ...candidate.correction.supplementalEvidenceIds]);
  const evidenceBindings = Object.fromEntries(candidate.evidence.filter((item) => citedIds.has(item.id))
    .map((item) => [item.id, { url: item.url, contentHash: item.contentHash ?? "", sourceType: item.sourceType }]));
  await transaction(async (client) => {
    const entity = await client.query<{ id: string }>(
      `insert into public_evidence.company_entity (canonical_name, canonical_domain, headquarters_country_code)
       values ($1,$2,$3)
       on conflict (canonical_domain) do update set canonical_name=excluded.canonical_name, updated_at=now()
       returning id`, [candidate.companyName, candidate.domain, plan.countryCode],
    );
    await client.query(
      `insert into public_evidence.role_correction_snapshot (
         company_entity_id, market_country_code, dependency_fingerprint, evidence_snapshot_hash,
         correction_model, prompt_version, role_taxonomy_version, correction, evidence_bindings,
         missing_evidence, source_run_id
       ) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11)
       on conflict (company_entity_id, market_country_code, dependency_fingerprint) do update set
         correction=excluded.correction, evidence_bindings=excluded.evidence_bindings,
         missing_evidence=excluded.missing_evidence,
         source_run_id=excluded.source_run_id, updated_at=now()`,
      [entity.rows[0].id, plan.countryCode, dependency.fingerprint, dependency.evidenceSnapshotHash,
        candidate.correction.model, promptVersion, PRIMARY_CHANNEL_POLICY.version,
        JSON.stringify(candidate.correction), JSON.stringify(evidenceBindings), missingEvidence, sourceRunId ?? null],
    );
  });
}
