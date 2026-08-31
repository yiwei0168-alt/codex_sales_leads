import { createHash } from "node:crypto";

import { query } from "@/lib/rag/db";
import type { LeadSearchPlan } from "@/lib/assistant/types";
import {
  classifyGlobalLeadSearchResult,
  globalLeadDisplayName,
} from "@/lib/leads/global-search";
import { ProviderUnavailableError } from "@/providers/contracts";
import { TavilySearchProvider, type TavilySearchResult } from "@/providers/tavily";
import { ACTIVE_LEAD_SCORING_POLICY, scoringPolicyChecksum } from "@/lib/leads/scoring-policy";
import { leadEvidenceContentHash } from "@/lib/leads/evidence-snapshot";

import type {
  LeadEvidenceItem,
  LeadMarketPlaybook,
  LeadWorkflowCandidate,
} from "./types";
import { findReusablePublicEvidence, persistPublicEvidence } from "./public-evidence-repository";

export interface DiscoveryResult {
  runId: string;
  candidates: LeadWorkflowCandidate[];
  creditsUsed: number;
  warnings: string[];
}

function stableId(prefix: string, value: string): string {
  return `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

function discoveryEvidence(result: TavilySearchResult, runId: string): LeadEvidenceItem {
  const excerpt = result.content.replace(/\s+/g, " ").trim().slice(0, 2_000);
  return {
    id: stableId("evidence", result.url),
    url: result.url,
    title: result.title,
    excerpt,
    sourceType: "discovery",
    provider: "tavily",
    capturedAt: new Date().toISOString(),
    evidenceRunId: runId,
    contentHash: leadEvidenceContentHash(excerpt),
    freshnessStatus: "fresh",
  };
}

function roleWeight(playbook: LeadMarketPlaybook, family: string): number {
  return playbook.rolePriorities.find((item) => item.family === family)?.weight ?? 1;
}

export async function discoverLeadCandidates(
  actionId: string,
  workspaceId: string,
  plan: LeadSearchPlan,
  playbook: LeadMarketPlaybook,
  graphThreadId: string,
): Promise<DiscoveryResult> {
  const [run] = await query<{ id: string }>(
    `insert into lead_search_run (workspace_id, provider, target_count, country_code, market_name, objective,
       scoring_policy_id, scoring_policy_version, scoring_policy_checksum, scoring_policy_snapshot, metadata)
     values ($1, 'langgraph+tavily', $2, $3, $4, $5,
       (select id from lead_scoring_policy where policy_key=$7 and version=$8 limit 1), $8, $9, $10, $6)
     returning id`,
    [workspaceId, plan.targetCount, plan.countryCode, plan.countryName, plan.objective,
      JSON.stringify({ source: "assistant-confirmed-langgraph", assistantActionId: actionId, graphThreadId,
        workflowVersion: "lead-discovery-v2-fresh-evidence", playbook,
        evidencePolicy: "current-run-fresh-or-revalidated-only" }),
      ACTIVE_LEAD_SCORING_POLICY.policyKey, ACTIVE_LEAD_SCORING_POLICY.version,
      scoringPolicyChecksum(), JSON.stringify(ACTIVE_LEAD_SCORING_POLICY)],
  );
  const tavily = new TavilySearchProvider({ maxAttempts: 3 });
  const providerCountry = new Intl.DisplayNames(["en"], { type: "region" }).of(plan.countryCode)?.toLowerCase();
  const candidates: LeadWorkflowCandidate[] = [];
  const warnings: string[] = [];
  let rawResults = 0;
  let creditsUsed = 0;

  for (const spec of [...playbook.searchQueries].sort((left, right) => left.priority - right.priority)) {
    const [searchQuery] = await query<{ id: string }>(
      `insert into lead_search_query (run_id, query_text, role_hint, lead_type, language, region)
       values ($1, $2, $3, 'channel', $4, $5) returning id`,
      [run.id, spec.query, spec.roles.join(","), plan.queryLanguage, plan.countryName],
    );
    try {
      let response;
      try {
        response = await tavily.search({ query: spec.query, country: providerCountry, searchDepth: "basic", maxResults: 20 }, AbortSignal.timeout(45_000));
      } catch (error) {
        const invalidCountry = error instanceof ProviderUnavailableError
          && error.cause instanceof Error && error.cause.message.startsWith("HTTP 400:");
        if (!invalidCountry) throw error;
        response = await tavily.search({ query: spec.query, searchDepth: "basic", maxResults: 20 }, AbortSignal.timeout(45_000));
      }
      creditsUsed += response.creditsUsed;
      rawResults += response.results.length;
      await query(`update lead_search_query set result_count = $2, credits_used = $3 where id = $1`,
        [searchQuery.id, response.results.length, response.creditsUsed]);
      for (const result of response.results) {
        const classified = classifyGlobalLeadSearchResult(result);
        await query(
          `insert into lead_search_result (run_id, query_id, url, domain, title, snippet, provider_score, rejection_reason)
           values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (run_id, url) do nothing`,
          [run.id, searchQuery.id, result.url, classified.domain ?? "invalid", result.title, result.content,
            result.score, classified.rejectionReason],
        );
        if (classified.rejectionReason || !classified.domain) continue;
        candidates.push({
          candidateId: stableId("lead", classified.domain),
          evidenceSnapshotRunId: run.id,
          companyName: globalLeadDisplayName(result, classified.domain),
          domain: classified.domain,
          officialWebsiteUrl: `https://${classified.domain}/`,
          queryRoles: [...spec.roles],
          queryFamily: spec.family,
          providerScore: Math.max(0, Math.min(1, result.score * roleWeight(playbook, spec.family))),
          evidence: [discoveryEvidence(result, run.id)],
          evidenceWarnings: [],
        });
      }
    } catch (error) {
      warnings.push(`Discovery query failed (${spec.family}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const poolLimit = Math.min(100, Math.max(30, Math.ceil(plan.targetCount * 1.75)));
  const selected = [...new Map(
    candidates.sort((left, right) => right.providerScore - left.providerScore)
      .map((candidate) => [candidate.domain, candidate]),
  ).values()].slice(0, poolLimit);
  await query(
    `update lead_search_run set query_count = $2, raw_result_count = $3, unique_candidate_count = $4,
       credits_used = $5, metadata = metadata || $6::jsonb where id = $1`,
    [run.id, playbook.searchQueries.length, rawResults, new Set(candidates.map((item) => item.domain)).size,
      creditsUsed, JSON.stringify({ discoveryWarnings: warnings, candidatePoolSize: selected.length })],
  );
  if (selected.length === 0) throw new Error(`No usable public-company candidates were discovered. ${warnings.join(" ")}`.trim());
  return { runId: run.id, candidates: selected, creditsUsed, warnings };
}

function sameDomain(value: string, domain: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    return host === domain || host.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}

async function enrichOne(
  candidate: LeadWorkflowCandidate,
  plan: LeadSearchPlan,
  tavily: TavilySearchProvider,
): Promise<{ candidate: LeadWorkflowCandidate; credits: number; warning?: string }> {
  let credits = 0;
  try {
    const reusable = await findReusablePublicEvidence({
      domain: candidate.domain,
      countryCode: plan.countryCode,
      evidenceRunId: candidate.evidenceSnapshotRunId,
    }).catch(() => ({ evidence: [], stale: false }));
    if (reusable.evidence.length > 0) {
      const evidence = [...new Map([...candidate.evidence, ...reusable.evidence]
        .map((item) => [item.id, item])).values()];
      const onlyStale = reusable.evidence.every((item) => item.freshnessStatus === "stale");
      const warning = onlyStale
        ? `Reusable evidence for ${candidate.domain} is stale; retained without automatic Web Search. User reverification is required.`
        : undefined;
      return { candidate: { ...candidate, evidence, evidenceWarnings: warning
        ? [...candidate.evidenceWarnings, warning] : candidate.evidenceWarnings }, credits, warning };
    }
    const official = await tavily.search({
      query: `site:${candidate.domain} company products solutions customers locations networking ${plan.countryName}`,
      country: new Intl.DisplayNames(["en"], { type: "region" }).of(plan.countryCode)?.toLowerCase(),
      searchDepth: "basic",
      maxResults: 6,
      includeRawContent: false,
      includeDomains: [candidate.domain],
    }, AbortSignal.timeout(45_000));
    credits += official.creditsUsed;
    const officialResults = official.results.filter((item) => sameDomain(item.url, candidate.domain)).slice(0, 4);
    let extracted = { results: [] as Array<{ url: string; rawContent: string }>, creditsUsed: 0 };
    if (officialResults.length > 0) {
      const response = await tavily.extract(officialResults.map((item) => item.url), AbortSignal.timeout(45_000));
      extracted = { results: response.results, creditsUsed: response.creditsUsed };
      credits += response.creditsUsed;
    }
    const rawByUrl = new Map(extracted.results.map((item) => [item.url, item.rawContent]));
    const added: LeadEvidenceItem[] = officialResults.map((result) => ({
      id: stableId("evidence", result.url),
      url: result.url,
      title: result.title,
      excerpt: (rawByUrl.get(result.url) || result.content).replace(/\s+/g, " ").trim().slice(0, 4_000),
      sourceType: "official-website",
      provider: "tavily",
      capturedAt: new Date().toISOString(),
      evidenceRunId: candidate.evidenceSnapshotRunId,
      freshnessStatus: "fresh",
      contentHash: leadEvidenceContentHash(
        (rawByUrl.get(result.url) || result.content).replace(/\s+/g, " ").trim().slice(0, 4_000),
      ),
    }));
    await persistPublicEvidence({
      companyName: candidate.companyName,
      domain: candidate.domain,
      countryCode: plan.countryCode,
      evidence: added,
    }).catch((error) => {
      candidate.evidenceWarnings.push(`Public evidence persistence failed for ${candidate.domain}: ${error instanceof Error ? error.message : String(error)}`);
    });
    return {
      candidate: { ...candidate, evidence: [...new Map([...candidate.evidence, ...added].map((item) => [item.url, item])).values()] },
      credits,
      warning: added.length === 0 ? `No official-domain evidence was extracted for ${candidate.domain}.` : undefined,
    };
  } catch (error) {
    const warning = `Evidence collection failed for ${candidate.domain}: ${error instanceof Error ? error.message : String(error)}`;
    return { candidate: { ...candidate, evidenceWarnings: [...candidate.evidenceWarnings, warning] }, credits, warning };
  }
}

export async function collectLeadEvidence(
  candidates: LeadWorkflowCandidate[],
  plan: LeadSearchPlan,
): Promise<{ candidates: LeadWorkflowCandidate[]; creditsUsed: number; warnings: string[] }> {
  const tavily = new TavilySearchProvider({ maxAttempts: 3 });
  const results = new Array<Awaited<ReturnType<typeof enrichOne>>>(candidates.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= candidates.length) return;
      results[index] = await enrichOne(candidates[index], plan, tavily);
    }
  }
  const configuredConcurrency = Number.parseInt(process.env.LEAD_EVIDENCE_CONCURRENCY ?? "8", 10);
  const concurrency = Math.max(1, Math.min(16, Number.isFinite(configuredConcurrency) ? configuredConcurrency : 8));
  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, () => worker()));
  return {
    candidates: results.map((item) => item.candidate),
    creditsUsed: results.reduce((sum, item) => sum + item.credits, 0),
    warnings: results.flatMap((item) => item.warning ? [item.warning] : []),
  };
}
