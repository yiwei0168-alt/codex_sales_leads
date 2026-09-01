import { createHash } from "node:crypto";

import { query } from "@/lib/rag/db";
import type { LeadSearchPlan } from "@/lib/assistant/types";
import { TavilySearchProvider } from "@/providers/tavily";
import { ACTIVE_LEAD_SCORING_POLICY, scoringPolicyChecksum } from "@/lib/leads/scoring-policy";
import { leadEvidenceContentHash } from "@/lib/leads/evidence-snapshot";

import type {
  LeadEvidenceItem,
  LeadMarketPlaybook,
  LeadWorkflowCandidate,
  WorkflowModelUsage,
} from "./types";
import { findReusablePublicEvidence, persistPublicEvidence } from "./public-evidence-repository";
import { executeHybridDiscovery, type HybridSearchCallTelemetry } from "./hybrid-discovery-executor";
import { ACTIVE_HYBRID_SEARCH_POLICY, hybridSearchPolicyChecksum } from "./hybrid-search-policy";

export interface DiscoveryResult {
  runId: string;
  candidates: LeadWorkflowCandidate[];
  creditsUsed: number;
  warnings: string[];
  modelUsage?: WorkflowModelUsage[];
  callMetrics?: HybridSearchCallTelemetry[];
}

function stableId(prefix: string, value: string): string {
  return `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

function occurrenceKey(call: HybridSearchCallTelemetry, item: HybridSearchCallTelemetry["items"][number]): string {
  return stableId("occurrence", [call.route.provider, call.query, item.item.url ?? "",
    item.item.externalId ?? "", item.item.rank].join("|"));
}

async function persistHybridSearchCall(runId: string, plan: LeadSearchPlan,
  call: HybridSearchCallTelemetry): Promise<void> {
  const leadType = call.route.category === "brand-owner" || call.route.category === "oem-odm-opportunity"
    ? "strategic-customer" : "channel";
  const [searchQuery] = await query<{ id: string }>(
    `insert into lead_search_query (run_id, query_text, role_hint, lead_type, language, region,
       result_count, credits_used) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [runId, call.query, call.route.category, leadType, plan.queryLanguage, plan.countryName,
      call.rawResults, Math.ceil(call.paidSearchCredits)],
  );
  const [providerCall] = await query<{ id: string }>(
    `insert into lead_search_provider_call (run_id, query_id, provider, engine, mechanism,
       search_category, search_track, trigger_kind, invocation_reason, status, input_query_count,
       input_characters, raw_result_count, normalized_company_count, new_unique_company_count,
       existing_company_hit_count, rejected_result_count, paid_search_credits, model_input_tokens,
       model_output_tokens, latency_ms, retry_count, fallback_used, discarded_reason_counts,
       error_message, finished_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,now())
     returning id`,
    [runId, searchQuery.id, call.route.provider, call.route.engine, call.route.mechanism,
      call.route.category, call.route.track, call.route.trigger, call.route.invocationReason, call.status,
      call.status === "skipped" ? 0 : 1, call.query.length, call.rawResults, call.normalizedCompanies,
      call.newUniqueCompanies, call.existingCompanyHits, call.rejectedResults, call.paidSearchCredits,
      call.inputTokens, call.outputTokens, call.latencyMs, call.retryCount, call.fallbackUsed,
      JSON.stringify(call.discardedReasonCounts), call.errorMessage ?? null],
  );
  for (const result of call.items) {
    const url = result.item.url ?? `place:${result.item.externalId ?? stableId("result", result.item.title)}`;
    await query(
      `insert into lead_search_result (run_id, query_id, url, domain, title, snippet, provider_score,
         rejection_reason) values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (run_id, url) do nothing`,
      [runId, searchQuery.id, url, result.domain ?? "unresolved", result.item.title,
        result.item.snippet.slice(0, 4_000), null, result.rejectionReason ?? null],
    );
    await query(
      `insert into lead_search_provider_occurrence (occurrence_key, run_id, provider_call_id,
         candidate_key, url, domain, external_id, rank, source_kind, normalized, first_discovery,
         rejection_reason, metadata) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       on conflict (occurrence_key) do nothing`,
      [occurrenceKey(call, result), runId, providerCall.id, result.candidateKey, result.item.url,
        result.domain, result.item.externalId ?? null, result.item.rank, result.item.sourceKind,
        Boolean(result.candidateKey), result.firstDiscovery, result.rejectionReason ?? null,
        JSON.stringify({ title: result.item.title.slice(0, 300) })],
    );
  }
}

async function writeDiscoveryGateOutcomes(candidates: LeadWorkflowCandidate[]): Promise<void> {
  for (const candidate of candidates) {
    for (const occurrence of candidate.discoveryOccurrences ?? []) {
      await query(
        `update lead_search_provider_occurrence set gate_status=$2 where occurrence_key=$1`,
        [occurrence.occurrenceId, candidate.discoveryGate?.status ?? null],
      );
    }
  }
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
     values ($1, 'langgraph+hybrid-search', $2, $3, $4, $5,
       (select id from lead_scoring_policy where policy_key=$7 and version=$8 limit 1), $8, $9, $10, $6)
     returning id`,
    [workspaceId, plan.targetCount, plan.countryCode, plan.countryName, plan.objective,
      JSON.stringify({ source: "assistant-confirmed-langgraph", assistantActionId: actionId, graphThreadId,
        workflowVersion: "lead-discovery-v3-hybrid-search", playbook,
        hybridSearchPolicyKey: ACTIVE_HYBRID_SEARCH_POLICY.policyKey,
        hybridSearchPolicyVersion: ACTIVE_HYBRID_SEARCH_POLICY.version,
        hybridSearchPolicyChecksum: hybridSearchPolicyChecksum(),
        evidencePolicy: "current-run-fresh-or-revalidated-only",
        discoveryEvidencePolicy: "search-snippets-for-light-gate-only-not-final-scoring" }),
      ACTIVE_LEAD_SCORING_POLICY.policyKey, ACTIVE_LEAD_SCORING_POLICY.version,
      scoringPolicyChecksum(), JSON.stringify(ACTIVE_LEAD_SCORING_POLICY)],
  );
  try {
    const execution = await executeHybridDiscovery(run.id, plan, playbook, {
      onCall: (call) => persistHybridSearchCall(run.id, plan, call),
    });
    await writeDiscoveryGateOutcomes([...execution.candidates, ...execution.rejectedCandidates]);
    for (const candidate of execution.candidates) {
      const officialEvidence = candidate.evidence.filter((item) => item.sourceType === "official-website");
      if (officialEvidence.length > 0) await persistPublicEvidence({ companyName: candidate.companyName,
        domain: candidate.domain, countryCode: plan.countryCode, evidence: officialEvidence }).catch((error) => {
        execution.warnings.push(`Lightweight official evidence persistence failed for ${candidate.domain}: ${
          error instanceof Error ? error.message : String(error)}`);
      });
    }
    const creditsUsed = execution.calls.reduce((sum, call) => sum + call.paidSearchCredits, 0);
    const rawResults = execution.calls.reduce((sum, call) => sum + call.rawResults, 0);
    const uniqueCandidates = execution.calls.reduce((sum, call) => sum + call.newUniqueCompanies, 0);
    const gateCounts = [...execution.candidates, ...execution.rejectedCandidates].reduce<Record<string, number>>(
      (counts, candidate) => { const status = candidate.discoveryGate?.status ?? "unknown";
        counts[status] = (counts[status] ?? 0) + 1; return counts; }, {});
    await query(
      `update lead_search_run set query_count = $2, raw_result_count = $3, unique_candidate_count = $4,
       credits_used = $5, metadata = metadata || $6::jsonb where id = $1`,
      [run.id, execution.calls.filter((call) => call.status !== "skipped").length, rawResults, uniqueCandidates,
        Math.ceil(creditsUsed), JSON.stringify({ discoveryWarnings: execution.warnings,
          candidatePoolSize: execution.candidates.length, rejectedCandidateCount: execution.rejectedCandidates.length,
          targetPool: execution.targetPool, stopReason: execution.stopReason, gateCounts,
          providerCallCount: execution.calls.length,
          providerCallStatuses: execution.calls.reduce<Record<string, number>>((counts, call) => {
            counts[call.status] = (counts[call.status] ?? 0) + 1; return counts;
          }, {}) })],
    );
    if (execution.candidates.length === 0) throw new Error(
      `No usable public-company candidates were discovered. ${execution.warnings.join(" ")}`.trim());
    return { runId: run.id, candidates: execution.candidates, creditsUsed,
      warnings: execution.warnings, modelUsage: execution.modelUsage, callMetrics: execution.calls };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await query(`update lead_search_run set status='failed', error_message=$2, finished_at=now() where id=$1`,
      [run.id, message.slice(0, 4_000)]).catch(() => undefined);
    throw error;
  }
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
