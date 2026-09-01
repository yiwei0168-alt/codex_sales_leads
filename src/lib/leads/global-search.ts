import { createHash } from "node:crypto";
import type { ChannelRole, CompanyRecord } from "@/lib/domain";
import { query, transaction } from "@/lib/rag/db";
import { TavilySearchProvider, type TavilySearchResult } from "@/providers/tavily";
import { ProviderUnavailableError } from "@/providers/contracts";
import type { LeadSearchPlan } from "@/lib/assistant/types";

const allowedRoles = new Set<ChannelRole>(["Distributor", "VAD", "VAR", "Dealer", "Reseller", "Retailer", "E-tailer", "SI", "Installer", "MSP", "ISP", "Agent", "Brand Owner"]);
const blockedDomains = [
  "linkedin.com", "facebook.com", "instagram.com", "youtube.com", "tiktok.com", "x.com", "twitter.com",
  "wikipedia.org", "reddit.com", "pinterest.com", "medium.com", "google.com", "bing.com", "yahoo.com",
  "clutch.co", "sortlist.com", "goodfirms.co", "ensun.io", "amazon.com", "alibaba.com",
];
const nonCompanyPattern = /(\.pdf(?:$|\?)|\/download(?:\/|$)|\/blogs?(?:\/|$)|\/articles?(?:\/|$)|\/news(?:\/|$))/i;
const directoryPattern = /\b(top\s*\d+|best companies|company list|directory|ranking)\b/i;
const relevancePattern = /\b(network(?:ing)?|wi-?fi|router|switch|telecom|internet|fiber|fibre|cabling|integrator|connectivity|infrastructure|ict|it solutions?|cctv|poe|redes?|fibra|integrador|réseau|netzwerk)\b|网络|通信|光纤|系统集成/i;

export interface GlobalLeadSearchCandidate {
  role: ChannelRole;
  result: TavilySearchResult;
  domain: string;
  queryId: string;
}

function domainFromUrl(value: string): string | null {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
}

function isBlocked(domain: string): boolean {
  return blockedDomains.some((item) => domain === item || domain.endsWith(`.${item}`));
}

function rejectionReason(result: TavilySearchResult, domain: string | null): string | null {
  if (!domain || isBlocked(domain)) return "blocked-domain";
  if (nonCompanyPattern.test(result.url)) return "non-company-content-page";
  if (directoryPattern.test(result.title)) return "directory-or-list-page";
  if (!relevancePattern.test(`${result.title} ${result.content}`)) return "insufficient-networking-relevance";
  return null;
}

function uniqueId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function globalLeadDisplayName(result: TavilySearchResult, domain: string): string {
  const first = result.title.split(/\s+[|–—]\s+|\s+-\s+/)[0]?.trim();
  const fallback = domain.split(".")[0].replace(/[-_]+/g, " ");
  return first && first.length >= 2 && first.length <= 100 ? first.replace(/^home\s*[|:-]?\s*/i, "").trim() : fallback;
}

export function buildGlobalLeadSearchQueries(plan: LeadSearchPlan): Array<{ role: ChannelRole; query: string }> {
  const roles = plan.roles.filter((role): role is ChannelRole => allowedRoles.has(role as ChannelRole));
  const selected: ChannelRole[] = roles.length
    ? roles
    : ["Distributor", "VAD", "VAR", "Retailer", "SI", "MSP", "ISP"];
  const labels: Record<ChannelRole, string> = {
    Distributor: "networking equipment distributor wholesaler", VAD: "value-added networking distributor",
    VAR: "networking value-added reseller", Dealer: "network equipment dealer", Reseller: "IT networking reseller",
    Retailer: "network equipment retailer", "E-tailer": "online network equipment retailer",
    SI: "enterprise network system integrator", Installer: "business Wi-Fi network installer",
    MSP: "managed network service provider", ISP: "internet service provider WISP fiber operator",
    Agent: "networking manufacturer sales representative Handelsvertretung",
    "Brand Owner": "own brand networking product company",
  };
  const queryCountry = new Intl.DisplayNames(["en"], { type: "region" }).of(plan.countryCode) ?? plan.countryName;
  return selected.slice(0, 12).map((role) => ({ role, query: `${labels[role]} ${queryCountry} official company` }));
}

export function classifyGlobalLeadSearchResult(result: TavilySearchResult): { domain: string | null; rejectionReason: string | null } {
  const domain = domainFromUrl(result.url);
  return { domain, rejectionReason: rejectionReason(result, domain) };
}

export function selectGlobalLeadSearchCandidates(
  candidates: GlobalLeadSearchCandidate[],
  targetCount: number,
): GlobalLeadSearchCandidate[] {
  return [...new Map(
    candidates
      .sort((a, b) => b.result.score - a.result.score)
      .map((item) => [item.domain, item]),
  ).values()].slice(0, targetCount);
}

function toRecord(candidate: GlobalLeadSearchCandidate, plan: LeadSearchPlan, runId: string): CompanyRecord {
  const score = Math.max(0, Math.min(candidate.result.score, 1));
  const confidence = Math.round(45 + score * 38);
  const fit = Math.round(55 + score * 35);
  const name = globalLeadDisplayName(candidate.result, candidate.domain);
  const isDistribution = candidate.role === "Distributor" || candidate.role === "VAD";
  const isStrategicPartner = candidate.role === "Agent" || candidate.role === "Brand Owner";
  const isLargeIsp = candidate.role === "ISP" && score >= 0.72;
  return {
    id: `tavily-${plan.countryCode.toLowerCase()}-${uniqueId(candidate.domain)}`, legalName: name, displayName: name, domain: candidate.domain,
    city: plan.countryName, country: plan.countryName,
    layer: isDistribution ? "Tier-1 Distributor" : isStrategicPartner ? "Strategic Partner" : "Downstream Channel", roles: [candidate.role],
    accountTier: isLargeIsp ? "KA" : score >= 0.72 ? "Priority" : "Standard",
    supplyModel: isLargeIsp ? "Co-sell/Co-supply" : "TBD", brandInvolvement: isLargeIsp ? "Deep" : "Standard",
    fitScore: fit, accountValue: isLargeIsp ? 85 : 50, reachability: 50, evidenceConfidence: confidence,
    summary: candidate.result.content.replace(/\s+/g, " ").trim().slice(0, 700), opportunityStage: "Discovered",
    priority: score >= 0.72 ? "High" : score >= 0.48 ? "Medium" : "Low", owner: "Workspace Owner",
    nextAction: "Review the official source, confirm company identity, role, and product fit before outreach.",
    risks: ["Public-search candidate requires human identity and role review."],
    unknowns: ["Legal entity", "Purchasing authority", "Cudy product fit", "Public business contact"],
    evidence: [{ id: `ev-live-${uniqueId(candidate.result.url)}`, sourceUrl: candidate.result.url,
      title: candidate.result.title, sourceType: "Company website", capturedAt: new Date().toISOString().slice(0, 10),
      claim: `Public search returned this company for ${candidate.role} in ${plan.countryName}.`,
      summary: candidate.result.content.replace(/\s+/g, " ").trim().slice(0, 700), status: "Inferred", confidence }],
    leadType: "Channel", searchRunId: runId,
  };
}

export async function executeGlobalLeadSearch(userId: string, actionId: string, plan: LeadSearchPlan): Promise<{
  runId: string; countryCode: string; countryName: string; accepted: number; requested: number; creditsUsed: number;
}> {
  const workspaces = await query<{ id: string }>(
    `select id from market_workspace where owner_id = $1 and slug = 'global-sales' and status = 'active' limit 1`, [userId],
  );
  if (!workspaces[0]) throw new Error("Global sales workspace not found");
  const workspaceId = workspaces[0].id;
  const [run] = await query<{ id: string }>(
    `insert into lead_search_run (workspace_id, provider, target_count, country_code, market_name, objective, metadata)
     values ($1, 'tavily', $2, $3, $4, $5, $6) returning id`,
    [workspaceId, plan.targetCount, plan.countryCode, plan.countryName, plan.objective,
      JSON.stringify({ source: "assistant-confirmed", assistantActionId: actionId, userRequest: plan.userRequest })],
  );
  const provider = new TavilySearchProvider();
  const providerCountry = new Intl.DisplayNames(["en"], { type: "region" }).of(plan.countryCode)?.toLowerCase()
    ?? plan.countryName.toLowerCase();
  const queries = buildGlobalLeadSearchQueries(plan);
  const candidates: GlobalLeadSearchCandidate[] = [];
  let rawResults = 0;
  let creditsUsed = 0;
  try {
    for (const spec of queries) {
      const [searchQuery] = await query<{ id: string }>(
        `insert into lead_search_query (run_id, query_text, role_hint, lead_type, language, region)
         values ($1, $2, $3, 'channel', $4, $5) returning id`,
        [run.id, spec.query, spec.role, plan.queryLanguage, plan.countryName],
      );
      let response;
      try {
        response = await provider.search({ query: spec.query, country: providerCountry, searchDepth: "basic", maxResults: 20 }, AbortSignal.timeout(45_000));
      } catch (error) {
        const invalidCountry = error instanceof ProviderUnavailableError
          && error.cause instanceof Error
          && error.cause.message.startsWith("HTTP 400:");
        if (!invalidCountry) throw error;
        response = await provider.search({ query: spec.query, searchDepth: "basic", maxResults: 20 }, AbortSignal.timeout(45_000));
      }
      creditsUsed += response.creditsUsed;
      rawResults += response.results.length;
      await query(`update lead_search_query set result_count = $2, credits_used = $3 where id = $1`, [searchQuery.id, response.results.length, response.creditsUsed]);
      for (const result of response.results) {
        const { domain, rejectionReason: rejected } = classifyGlobalLeadSearchResult(result);
        const inserted = await query<{ id: string }>(
          `insert into lead_search_result (run_id, query_id, url, domain, title, snippet, provider_score, rejection_reason)
           values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (run_id, url) do nothing returning id`,
          [run.id, searchQuery.id, result.url, domain ?? "invalid", result.title, result.content, result.score, rejected],
        );
        if (!rejected && inserted[0] && domain) candidates.push({ role: spec.role, result, domain, queryId: searchQuery.id });
      }
    }
    const selected = selectGlobalLeadSearchCandidates(candidates, plan.targetCount);
    await transaction(async (client) => {
      for (const candidate of selected) {
        const record = toRecord(candidate, plan, run.id);
        const company = await client.query<{ id: string }>(
          `insert into sales_company (external_id, canonical_name, domain, country_code, city, source_kind, record)
           values ($1, $2, $3, $4, $5, 'tavily-live', $6)
           on conflict (external_id) do update set canonical_name = excluded.canonical_name, country_code = excluded.country_code,
             city = excluded.city, source_kind = excluded.source_kind, record = excluded.record, updated_at = now() returning id`,
          [record.id, record.displayName, record.domain, plan.countryCode, record.city, JSON.stringify(record)],
        );
        await client.query(
          `insert into workspace_company (workspace_id, company_id, account_tier, supply_model, brand_involvement,
             opportunity_stage, priority, owner_name, next_action, manually_edited, market_country_code, search_run_id)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, $10, $11)
           on conflict (workspace_id, company_id) do update set market_country_code = excluded.market_country_code,
             search_run_id = excluded.search_run_id, updated_at = now()`,
          [workspaceId, company.rows[0].id, record.accountTier, record.supplyModel, record.brandInvolvement,
            record.opportunityStage, record.priority, record.owner, record.nextAction, plan.countryCode, run.id],
        );
        await client.query(`update lead_search_result set accepted = true where run_id = $1 and domain = $2`, [run.id, candidate.domain]);
      }
      await client.query(
        `update lead_search_run set status = 'completed', query_count = $2, raw_result_count = $3,
         unique_candidate_count = $4, accepted_count = $5, credits_used = $6, finished_at = now() where id = $1`,
        [run.id, queries.length, rawResults, new Set(candidates.map((item) => item.domain)).size, selected.length, creditsUsed],
      );
    });
    return { runId: run.id, countryCode: plan.countryCode, countryName: plan.countryName,
      accepted: selected.length, requested: plan.targetCount, creditsUsed };
  } catch (error) {
    await query(`update lead_search_run set status = 'failed', query_count = $2, raw_result_count = $3,
      unique_candidate_count = $4, credits_used = $5, error_message = $6, finished_at = now() where id = $1`,
    [run.id, queries.length, rawResults, new Set(candidates.map((item) => item.domain)).size, creditsUsed,
      error instanceof Error ? error.message : "Unknown global search error"]);
    throw error;
  }
}
