import { createHash } from "node:crypto";
import nextEnv from "@next/env";
import type { ChannelRole, CompanyRecord } from "../src/lib/domain";
import { mexicoSearchPlan, type MexicoSearchQuery } from "../src/lib/leads/mexico-search-plan";
import { getPool, query, transaction } from "../src/lib/rag/db";
import { TavilySearchProvider, type TavilySearchResult } from "../src/providers/tavily";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const target = Math.max(1, Math.min(Number(process.argv.find((value) => value.startsWith("--target="))?.split("=")[1] ?? 50), 100));
const workspaceId = "00000000-0000-4000-8000-000000000100";
const provider = new TavilySearchProvider();

const blockedDomains = [
  "linkedin.com", "facebook.com", "instagram.com", "youtube.com", "youtu.be", "tiktok.com", "x.com", "twitter.com",
  "wikipedia.org", "reddit.com", "pinterest.com", "medium.com", "google.com", "bing.com", "yahoo.com", "gob.mx",
  "clutch.co", "sortlist.com", "goodfirms.co", "ensun.io", "seccionamarilla.com.mx", "tripadvisor.com",
  "unitips.mx", "dirind.com", "scribd.com", "inmuebles24.com", "compareinternet.com",
  "glassdoor.com.mx", "adzuna.com.mx", "scielo.org.mx", "indeed.com", "computrabajo.com.mx", "jooble.org",
  "occ.com.mx", "redalyc.org", "researchgate.net", "academia.edu",
  "ift.org.mx", "eleconomista.com.mx", "eluniversal.com.mx", "milenio.com", "forbes.com.mx", "expansion.mx",
  "xataka.com.mx", "elfinanciero.com.mx", "reforma.com", "proceso.com.mx",
  "cisco.com", "huawei.com", "tp-link.com", "fortinet.com", "ui.com", "ubiquiti.com", "dell.com", "hp.com",
];

const relevancePattern = /\b(red(?:es)?|network(?:ing)?|wifi|wi-fi|router|switch|telecom|internet|fibra|cableado|integrador|tecnolog(?:í|i)a|conectividad|infraestructura|digital|campus|hotel|retail|log(?:í|i)stica|industrial)\b/i;
const directoryTitlePattern = /\b(top\s*\d+|mejores empresas|lista de empresas|directorio|ranking)\b/i;
const strategicContentPathPattern = /\/(blog|noticias?|news|articulos?|guia|recursos?)\//i;
const nonCompanyPagePattern = /(\.pdf(?:$|\?)|\/download(?:\/|$)|\/bitstreams?\/|\/tesis(?:\/|$)|\/blogs?(?:\/|$)|\/articulos?(?:\/|$)|\/guia(?:\/|$))/i;
const contentSubdomainPattern = /^(blog|tesis|rinacional|mkt|revista)\./i;
const mexicoSignalPattern = /\b(m[eé]xico|mexico|mexicana?|cdmx|ciudad de m[eé]xico|monterrey|nuevo le[oó]n|guadalajara|jalisco|puebla|quer[eé]taro|tijuana|baja california|yucat[aá]n|m[eé]rida|guanajuato|chihuahua|oaxaca|chiapas)\b/i;

interface Candidate {
  spec: MexicoSearchQuery;
  result: TavilySearchResult;
  queryId: string;
  domain: string;
  displayName: string;
}

function domainFromUrl(value: string): string | null {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
}

function blocked(domain: string): boolean {
  return blockedDomains.some((item) => domain === item || domain.endsWith(`.${item}`));
}

function displayNameFromTitle(title: string, domain: string): string {
  const first = title.split(/\s+[|–—]\s+|\s+-\s+/)[0]?.trim();
  const fallback = domain.split(".")[0].replace(/[-_]+/g, " ");
  const generic = /^(inicio|home|m[eé]xico|cableado|redes|networking|routers?|internet|instalaci[oó]n|venta|servicios?|soluciones?|distribuidor|empresa|proveedor|equipos?|landing|sobre nosotros|tp-link|cisco en)/i;
  const value = first && first.length >= 2 && first.length <= 100 && !generic.test(first) ? first : fallback;
  return value.replace(/^inicio\s*[|:-]?\s*/i, "").trim() || fallback;
}

function uniqueId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function candidateRecord(candidate: Candidate, runId: string): CompanyRecord {
  const score = Math.max(0, Math.min(candidate.result.score, 1));
  const fit = Math.round(55 + score * 33);
  const confidence = Math.round(45 + score * 35);
  const channelRole: ChannelRole = candidate.spec.role;
  const snippet = candidate.result.content.replace(/\s+/g, " ").trim().slice(0, 700);
  return {
    id: `tavily-${uniqueId(candidate.domain)}`,
    legalName: candidate.displayName,
    displayName: candidate.displayName,
    domain: candidate.domain,
    city: candidate.spec.region,
    country: "Mexico",
    layer: channelRole === "Distributor" || channelRole === "VAD" ? "Tier-1 Distributor" : "Downstream Channel",
    roles: [channelRole],
    accountTier: "Standard",
    supplyModel: "TBD",
    brandInvolvement: candidate.spec.leadType === "strategic-customer" ? "Deep" : "Standard",
    fitScore: fit,
    accountValue: 50,
    reachability: 50,
    evidenceConfidence: confidence,
    summary: snippet || `Tavily returned ${candidate.displayName} as a possible Mexico sales lead.`,
    opportunityStage: "Discovered",
    priority: score >= 0.72 ? "High" : score >= 0.48 ? "Medium" : "Low",
    owner: "Workspace Owner",
    nextAction: "Review the source page, confirm the official company identity, and validate the inferred role.",
    risks: ["Live-search candidate has not completed human identity and role review."],
    unknowns: ["Legal entity", "Purchasing authority", "Cudy product fit", "Public business contact"],
    evidence: [{
      id: `ev-live-${uniqueId(candidate.result.url)}`,
      sourceUrl: candidate.result.url,
      title: candidate.result.title,
      sourceType: "Company website",
      capturedAt: new Date().toISOString().slice(0, 10),
      claim: `Live Tavily search returned this page for: ${candidate.spec.query}`,
      summary: snippet || candidate.result.title,
      status: "Inferred",
      confidence,
    }],
    leadType: candidate.spec.leadType === "strategic-customer" ? "Strategic Customer" : "Channel",
    searchRunId: runId,
  };
}

const [run] = await query<{ id: string }>(
  `insert into lead_search_run (workspace_id, provider, target_count, metadata) values ($1, 'tavily', $2, $3) returning id`,
  [workspaceId, target, JSON.stringify({ country: "mexico", source: "live-api", planVersion: "mx-v1" })],
);

const candidates: Candidate[] = [];
let rawResultCount = 0;
let creditsUsed = 0;

try {
  for (const spec of mexicoSearchPlan) {
    const response = await provider.search({ query: spec.query, country: "mexico", searchDepth: "basic", maxResults: 20 });
    creditsUsed += response.creditsUsed;
    rawResultCount += response.results.length;
    const [searchQuery] = await query<{ id: string }>(
      `insert into lead_search_query (run_id, query_text, role_hint, lead_type, language, region, result_count, credits_used)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [run.id, spec.query, spec.role, spec.leadType, spec.language, spec.region, response.results.length, response.creditsUsed],
    );
    for (const result of response.results) {
      const domain = domainFromUrl(result.url);
      let rejectionReason: string | null = null;
      if (!domain || blocked(domain)) rejectionReason = "blocked-domain";
      else if (!domain.endsWith(".mx") && !mexicoSignalPattern.test(`${result.title} ${result.content}`)) rejectionReason = "missing-mexico-signal";
      else if (contentSubdomainPattern.test(domain) || nonCompanyPagePattern.test(result.url)) rejectionReason = "non-company-content-page";
      else if (directoryTitlePattern.test(result.title)) rejectionReason = "directory-or-list-page";
      else if (spec.leadType === "channel" && !relevancePattern.test(`${result.title} ${result.content}`)) rejectionReason = "insufficient-networking-relevance";
      else if (spec.leadType === "strategic-customer" && strategicContentPathPattern.test(new URL(result.url).pathname)) rejectionReason = "strategic-customer-content-page";
      else if (spec.requiredTerms?.length && !spec.requiredTerms.some((term) => `${result.title} ${result.content}`.toLocaleLowerCase("es").includes(term))) rejectionReason = "missing-strategic-sector-signal";
      const inserted = await query<{ id: string }>(
        `insert into lead_search_result (run_id, query_id, url, domain, title, snippet, provider_score, rejection_reason)
         values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (run_id, url) do nothing returning id`,
        [run.id, searchQuery.id, result.url, domain ?? "invalid", result.title, result.content, result.score, rejectionReason],
      );
      if (!rejectionReason && inserted[0]) candidates.push({ spec, result, queryId: searchQuery.id, domain: domain!, displayName: displayNameFromTitle(result.title, domain!) });
    }
    process.stdout.write(`Searched ${spec.role}/${spec.leadType}: ${response.results.length} results\n`);
  }

  const byType = new Map<string, Candidate[]>();
  for (const candidate of candidates.sort((a, b) => b.result.score - a.result.score)) {
    const key = `${candidate.spec.leadType}:${candidate.spec.role}`;
    byType.set(key, [...(byType.get(key) ?? []), candidate]);
  }
  const selected: Candidate[] = [];
  const selectedDomains = new Set<string>();
  const groups = [...byType.values()];
  while (selected.length < target && groups.some((group) => group.length > 0)) {
    for (const group of groups) {
      while (group.length > 0) {
        const candidate = group.shift()!;
        if (selectedDomains.has(candidate.domain)) continue;
        selected.push(candidate); selectedDomains.add(candidate.domain); break;
      }
      if (selected.length >= target) break;
    }
  }
  if (selected.length < target) throw new Error(`Only ${selected.length} unique candidates passed filters; target is ${target}.`);

  await transaction(async (client) => {
    if (process.argv.includes("--replace")) {
      await client.query(`delete from workspace_company wc using sales_company c where wc.company_id = c.id and wc.workspace_id = $1 and c.source_kind = 'tavily-live'`, [workspaceId]);
      await client.query(`update sales_company set source_kind = 'tavily-superseded', updated_at = now() where source_kind = 'tavily-live'`);
    }
    for (const candidate of selected) {
      const record = candidateRecord(candidate, run.id);
      const company = await client.query<{ id: string }>(
        `insert into sales_company (external_id, canonical_name, domain, country_code, city, source_kind, record)
         values ($1, $2, $3, 'MX', $4, 'tavily-live', $5)
         on conflict (external_id) do update set canonical_name = excluded.canonical_name, source_kind = excluded.source_kind,
           record = excluded.record, updated_at = now() returning id`,
        [record.id, record.displayName, record.domain, record.city, JSON.stringify(record)],
      );
      await client.query(
        `insert into workspace_company (workspace_id, company_id, account_tier, supply_model, brand_involvement,
           opportunity_stage, priority, owner_name, next_action, manually_edited)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)
         on conflict (workspace_id, company_id) do update set updated_at = now()`,
        [workspaceId, company.rows[0].id, record.accountTier, record.supplyModel, record.brandInvolvement,
          record.opportunityStage, record.priority, record.owner, record.nextAction],
      );
      await client.query("update lead_search_result set accepted = true where run_id = $1 and url = $2", [run.id, candidate.result.url]);
    }
    await client.query(
      `update lead_search_run set status = 'completed', query_count = $2, raw_result_count = $3,
         unique_candidate_count = $4, accepted_count = $5, credits_used = $6, finished_at = now() where id = $1`,
      [run.id, mexicoSearchPlan.length, rawResultCount, new Set(candidates.map((item) => item.domain)).size, selected.length, creditsUsed],
    );
  });
  console.log(JSON.stringify({ runId: run.id, provider: provider.id, queries: mexicoSearchPlan.length, rawResults: rawResultCount,
    uniquePassingDomains: new Set(candidates.map((item) => item.domain)).size, accepted: selected.length, creditsUsed,
    leadTypes: selected.reduce<Record<string, number>>((counts, item) => { counts[item.spec.leadType] = (counts[item.spec.leadType] ?? 0) + 1; return counts; }, {}) }, null, 2));
} catch (error) {
  await query(
    `update lead_search_run set status = 'failed', query_count = $2, raw_result_count = $3, unique_candidate_count = $4,
       credits_used = $5, error_message = $6, finished_at = now() where id = $1`,
    [run.id, mexicoSearchPlan.length, rawResultCount, new Set(candidates.map((item) => item.domain)).size, creditsUsed,
      error instanceof Error ? error.message : "Unknown discovery error"],
  );
  throw error;
} finally {
  await getPool().end();
}
