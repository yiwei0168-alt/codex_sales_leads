import { createHash } from "node:crypto";

import type { LeadSearchPlan } from "@/lib/assistant/types";
import { tenantQuery } from "@/lib/rag/db";

import type { LeadMarketPlaybook, LeadRagCitation } from "./types";
import { LEAD_PLAYBOOK_PROMPT_VERSION } from "./playbook";
import { LEAD_WORKFLOW_RUNTIME_VERSION } from "./workflow-telemetry";

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function playbookDependencyFingerprint(plan: LeadSearchPlan, citations: LeadRagCitation[]): string {
  return createHash("sha256").update(stable({ runtime: LEAD_WORKFLOW_RUNTIME_VERSION,
    promptVersion: LEAD_PLAYBOOK_PROMPT_VERSION,
    plan: { countryCode: plan.countryCode, objective: plan.objective, roles: [...plan.roles].sort(),
      queryLanguage: plan.queryLanguage, userRequest: plan.userRequest.trim() },
    citations: [...citations].sort((left, right) => left.chunkId.localeCompare(right.chunkId))
      .map((citation) => ({ chunkId: citation.chunkId, collection: citation.collection, title: citation.title,
        content: citation.content, structuredFacts: citation.structuredFacts, corroborated: citation.corroborated })) }))
    .digest("hex");
}

export async function loadCachedLeadPlaybook(userId: string, workspaceId: string, plan: LeadSearchPlan,
  citations: LeadRagCitation[]): Promise<LeadMarketPlaybook | null> {
  const fingerprint = playbookDependencyFingerprint(plan, citations);
  const rows = await tenantQuery<{ playbook: LeadMarketPlaybook }>(userId,
    `update lead_playbook_cache set hit_count=hit_count+1, last_hit_at=now(), updated_at=now()
      where workspace_id=$1 and dependency_fingerprint=$2 returning playbook`, [workspaceId, fingerprint]);
  return rows[0]?.playbook ?? null;
}

export async function saveCachedLeadPlaybook(userId: string, workspaceId: string, plan: LeadSearchPlan,
  citations: LeadRagCitation[], playbook: LeadMarketPlaybook): Promise<void> {
  const fingerprint = playbookDependencyFingerprint(plan, citations);
  await tenantQuery(userId,
    `insert into lead_playbook_cache (user_id, workspace_id, dependency_fingerprint, playbook)
     values ($1,$2,$3,$4::jsonb)
     on conflict (user_id, workspace_id, dependency_fingerprint) do update set playbook=excluded.playbook, updated_at=now()`,
    [userId, workspaceId, fingerprint, JSON.stringify(playbook)]);
}
