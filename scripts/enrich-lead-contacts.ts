import nextEnv from "@next/env";
import { extractDomainEmails, guessPersonalEmail, personNameFromPersonalEmail, personalizedEmailPattern } from "../src/lib/leads/contact-extraction";
import { getPool, query, transaction } from "../src/lib/rag/db";
import { TavilySearchProvider, type TavilySearchResult } from "../src/providers/tavily";
import { resolveTargetWorkspace } from "./resolve-target-workspace";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const workspaceId = (await resolveTargetWorkspace()).id;
const requestedDomains = process.argv.find((value) => value.startsWith("--domains="))?.slice("--domains=".length).split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
const requestedLimit = Number(process.argv.find((value) => value.startsWith("--limit="))?.slice("--limit=".length) ?? 100);
const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 100, 100));
const requestedConcurrency = Number(process.argv.find((value) => value.startsWith("--concurrency="))?.slice("--concurrency=".length) ?? 4);
const concurrency = Math.max(1, Math.min(Number.isFinite(requestedConcurrency) ? Math.floor(requestedConcurrency) : 4, 6));
const tavilyTimeoutMs = Math.max(5_000, Math.min(Number(process.env.TAVILY_REQUEST_TIMEOUT_MS ?? 30_000), 120_000));
const targetDomains = requestedDomains?.length ? requestedDomains.slice(0, 100) : null;
const replaceExisting = process.argv.includes("--replace");
const tavily = new TavilySearchProvider();

interface CompanyRow {
  id: string;
  canonical_name: string;
  domain: string;
}

interface ContactFinding {
  fullName: string;
  jobTitle?: string;
  profileUrl?: string;
  sourceUrl: string;
  provider: string;
  status: "Public" | "Verified" | "Inferred";
  confidence: number;
}

interface EmailFinding {
  email: string;
  status: "Public" | "Verified" | "Pattern-guessed" | "Unknown" | "Invalid";
  sourceUrl?: string;
  provider: string;
  derivation?: string;
  confidence: number;
  contactName?: string;
}

function hostname(value: string): string {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

function sameDomain(url: string, domain: string): boolean {
  const host = hostname(url);
  return host === domain || host.endsWith(`.${domain}`);
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cleanPersonName(value: string): string | null {
  const name = value.replace(/\s+/g, " ").replace(/\s*\|.*$/, "").trim();
  if (name.length < 5 || name.length > 80) return null;
  const parts = name.split(" ");
  if (parts.length < 2 || parts.length > 6) return null;
  if (!parts.every((part) => /^[\p{L}.'’-]+$/u.test(part))) return null;
  return name;
}

function jobTitleFromText(text: string): string | undefined {
  const match = text.match(/\b(CEO|CTO|CIO|COO|Founder|Co-Founder|Director(?:a)?(?: [^.,;|]{0,45})?|Gerente(?: [^.,;|]{0,45})?|Jefe(?: [^.,;|]{0,45})?|Responsable(?: [^.,;|]{0,45})?|Sales Manager|Account Manager)\b/i);
  return match ? normalizeText(match[0]).slice(0, 80) : undefined;
}

function contactsFromSearch(company: CompanyRow, result: TavilySearchResult): ContactFinding[] {
  if (!/linkedin\.com\/in\//i.test(result.url)) return [];
  const first = result.title.split(/\s+-\s+|\s+\|\s+/)[0] ?? "";
  const fullName = cleanPersonName(first);
  if (!fullName) return [];
  const companyToken = company.canonical_name.split(/\s+/)[0]?.toLowerCase();
  const haystack = `${result.title} ${result.content}`.toLowerCase();
  if (companyToken && !haystack.includes(companyToken.toLowerCase()) && !haystack.includes(company.domain.split(".")[0])) return [];
  return [{
    fullName,
    jobTitle: jobTitleFromText(haystack),
    profileUrl: result.url,
    sourceUrl: result.url,
    provider: "tavily-web-search",
    status: "Public",
    confidence: 72,
  }];
}

function contactFromPersonalEmail(email: string, sourceUrl: string, sourceProvider: string): ContactFinding | null {
  const fullName = personNameFromPersonalEmail(email);
  if (!fullName) return null;
  return { fullName, sourceUrl, provider: sourceProvider, status: "Inferred", confidence: 55 };
}

function guessedEmails(company: CompanyRow, contacts: ContactFinding[], publicEmails: EmailFinding[]): EmailFinding[] {
  const patternSource = publicEmails.find((item) => personalizedEmailPattern(item.email));
  if (!patternSource) return [];
  const pattern = personalizedEmailPattern(patternSource.email)!;
  return contacts.flatMap((contact) => {
    const email = guessPersonalEmail(contact.fullName, company.domain, pattern);
    if (!email) return [];
    if (publicEmails.some((item) => item.email === email)) return [];
    return [{
      email,
      status: "Pattern-guessed" as const,
      sourceUrl: contact.sourceUrl,
      provider: "deterministic-pattern",
      derivation: `${pattern} inferred from public same-domain email ${patternSource.email}; contact name from ${contact.sourceUrl}`,
      confidence: 45,
      contactName: contact.fullName,
    }];
  });
}

const companies = await query<CompanyRow>(
  `select c.id, c.canonical_name, lower(c.domain) as domain
   from workspace_company wc join sales_company c on c.id = wc.company_id
   where wc.workspace_id = $1 and c.source_kind = 'tavily-live'
     and ($2::text[] is null or lower(c.domain) = any($2::text[]))
   order by case when $2::text[] is null then null else array_position($2::text[], lower(c.domain)) end,
     c.canonical_name
   limit $3`,
  [workspaceId, targetDomains, targetDomains?.length ?? limit],
);
const expectedCompanyCount = targetDomains?.length ?? limit;
if (companies.length !== expectedCompanyCount) {
  const found = new Set(companies.map((company) => company.domain));
  const missing = targetDomains?.filter((domain) => !found.has(domain));
  throw new Error(missing?.length ? `Missing active live leads: ${missing.join(", ")}`
    : `Only ${companies.length} active live leads are available; requested ${expectedCompanyCount}.`);
}

const providerMix = ["tavily-search", "tavily-extract"];
const [run] = await query<{ id: string }>(
  `insert into company_enrichment_run (workspace_id, provider_mix, target_count, metadata)
   values ($1, $2, $3, $4) returning id`,
  [workspaceId, providerMix, companies.length, JSON.stringify({ domains: companies.map((company) => company.domain), enrichmentMode: "public-web-only",
    concurrency, tavilyTimeoutMs, noAutomaticSending: true })],
);

await query(
  `insert into company_enrichment_run_item (run_id, company_id)
   select $1, unnest($2::uuid[])
   on conflict (run_id, company_id) do nothing`,
  [run.id, companies.map((company) => company.id)],
);

let searchCredits = 0;
let extractCredits = 0;
let processed = 0;
const failures: Array<{ domain: string; error: string }> = [];

async function markPhase(companyId: string, workerId: string, phase: string): Promise<void> {
  await query(
    `update company_enrichment_run_item
     set status = 'running', phase = $4, worker_id = $3,
       attempts = case when status = 'pending' then attempts + 1 else attempts end,
       started_at = coalesce(started_at, now()), updated_at = now(), error_message = null
     where run_id = $1 and company_id = $2`,
    [run.id, companyId, workerId, phase],
  );
}

async function enrichCompany(company: CompanyRow, workerId: string): Promise<void> {
    await markPhase(company.id, workerId, "official-search");
    const official = await tavily.search({
      query: `site:${company.domain} contacto ventas equipo nosotros correo email telefono`,
      country: "mexico",
      searchDepth: "basic",
      maxResults: 5,
      includeRawContent: true,
      includeDomains: [company.domain],
    }, AbortSignal.timeout(tavilyTimeoutMs));
    await markPhase(company.id, workerId, "contact-search");
    const publicWeb = await tavily.search({
      query: `"${company.canonical_name}" "${company.domain}" director gerente ventas compras founder LinkedIn email`,
      country: "mexico",
      searchDepth: "advanced",
      maxResults: 8,
      includeRawContent: true,
    }, AbortSignal.timeout(tavilyTimeoutMs));
    await markPhase(company.id, workerId, "email-search");
    const domainEmails = await tavily.search({
      query: `site:${company.domain} "@${company.domain}"`,
      country: "mexico",
      searchDepth: "basic",
      maxResults: 8,
      includeRawContent: true,
      includeDomains: [company.domain],
    }, AbortSignal.timeout(tavilyTimeoutMs));
    const companySearchCredits = official.creditsUsed + publicWeb.creditsUsed + domainEmails.creditsUsed;

    const resultMap = new Map<string, { result: TavilySearchResult; kind: "official-website" | "web-search" }>();
    for (const result of official.results) resultMap.set(result.url, { result, kind: "official-website" });
    for (const result of publicWeb.results) if (!resultMap.has(result.url)) resultMap.set(result.url, { result, kind: sameDomain(result.url, company.domain) ? "official-website" : "web-search" });
    for (const result of domainEmails.results) if (!resultMap.has(result.url)) resultMap.set(result.url, { result, kind: "official-website" });
    const combined = [...resultMap.values()];
    const officialUrls = combined.filter((item) => item.kind === "official-website").slice(0, 5).map((item) => item.result.url);
    await markPhase(company.id, workerId, "extract");
    const extracted = await tavily.extract(officialUrls, AbortSignal.timeout(tavilyTimeoutMs));
    const companyExtractCredits = extracted.creditsUsed;
    const extractedByUrl = new Map(extracted.results.map((item) => [item.url, item.rawContent]));

    const contacts = combined.flatMap((item) => contactsFromSearch(company, item.result));
    const emailFindings: EmailFinding[] = [];
    for (const item of combined) {
      const text = [item.result.content, item.result.rawContent ?? "", extractedByUrl.get(item.result.url) ?? ""].join("\n");
      for (const email of extractDomainEmails(text, company.domain)) {
        const sourceProvider = item.kind === "official-website" ? "official-website" : "tavily-web-search";
        const emailContact = contactFromPersonalEmail(email, item.result.url, sourceProvider);
        if (emailContact) contacts.push(emailContact);
        emailFindings.push({ email, status: "Public", sourceUrl: item.result.url, provider: sourceProvider,
          confidence: item.kind === "official-website" ? 90 : 75, contactName: emailContact?.fullName });
      }
    }

    emailFindings.push(...guessedEmails(company, contacts, emailFindings));

    await markPhase(company.id, workerId, "persist");
    const uniqueEmailCount = new Set(emailFindings.map((item) => item.email)).size;

    await transaction(async (client) => {
      if (replaceExisting) {
        await client.query(`delete from company_email_candidate where workspace_id = $1 and company_id = $2`, [workspaceId, company.id]);
        await client.query(`delete from company_contact where workspace_id = $1 and company_id = $2`, [workspaceId, company.id]);
      }
      for (const item of combined) {
        const content = extractedByUrl.get(item.result.url) ?? item.result.rawContent ?? item.result.content;
        await client.query(
          `insert into company_web_evidence (workspace_id, run_id, company_id, provider, source_kind, url, title, excerpt, provider_score)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict (run_id, company_id, url) do nothing`,
          [workspaceId, run.id, company.id, item.kind === "official-website" ? "tavily-extract" : "tavily-search", item.kind,
            item.result.url, item.result.title, normalizeText(content).slice(0, 2_000), item.result.score],
        );
      }
      const contactIds = new Map<string, string>();
      for (const contact of contacts) {
        const inserted = await client.query<{ id: string }>(
          `insert into company_contact (workspace_id, company_id, full_name, job_title, public_profile_url, source_url, source_provider, status, confidence)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           on conflict (workspace_id, company_id, full_name, source_url) do update set job_title = coalesce(excluded.job_title, company_contact.job_title),
             status = excluded.status, confidence = excluded.confidence, last_seen_at = now() returning id`,
          [workspaceId, company.id, contact.fullName, contact.jobTitle ?? null, contact.profileUrl ?? null, contact.sourceUrl, contact.provider, contact.status, contact.confidence],
        );
        contactIds.set(contact.fullName.toLocaleLowerCase("es"), inserted.rows[0].id);
      }
      const bestByEmail = new Map<string, EmailFinding>();
      const rank = { Verified: 5, Public: 4, "Pattern-guessed": 3, Unknown: 2, Invalid: 1 };
      for (const item of emailFindings) {
        const current = bestByEmail.get(item.email);
        if (!current || rank[item.status] > rank[current.status] || item.confidence > current.confidence) bestByEmail.set(item.email, item);
      }
      for (const item of bestByEmail.values()) {
        await client.query(
          `insert into company_email_candidate (workspace_id, company_id, contact_id, email, status, source_status, source_url, source_provider, derivation, confidence)
           values ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9)
           on conflict (workspace_id, company_id, email) do update set contact_id = coalesce(excluded.contact_id, company_email_candidate.contact_id),
             source_status = excluded.source_status,
             status = case when company_email_candidate.verification_decision_id is null then excluded.status else company_email_candidate.status end,
             source_url = coalesce(excluded.source_url, company_email_candidate.source_url),
             source_provider = excluded.source_provider, derivation = excluded.derivation, confidence = excluded.confidence, last_seen_at = now()`,
          [workspaceId, company.id, item.contactName ? contactIds.get(item.contactName.toLocaleLowerCase("es")) ?? null : null,
            item.email, item.status, item.sourceUrl ?? null, item.provider, item.derivation ?? null, item.confidence],
        );
      }
      await client.query(`update company_enrichment_run set processed_count = processed_count + 1,
        search_credits_used = search_credits_used + $2, extract_credits_used = extract_credits_used + $3 where id = $1`,
      [run.id, companySearchCredits, companyExtractCredits]);
      await client.query(
        `update company_enrichment_run_item set status = 'completed', phase = 'completed',
         named_contact_count = $3, email_count = $4, search_credits_used = $5,
         extract_credits_used = $6, finished_at = now(), updated_at = now()
         where run_id = $1 and company_id = $2`,
        [run.id, company.id, contacts.length, uniqueEmailCount, companySearchCredits, companyExtractCredits],
      );
    });
    searchCredits += companySearchCredits;
    extractCredits += companyExtractCredits;
    processed += 1;
    process.stdout.write(`${processed}/${companies.length} ${company.canonical_name}: ${contacts.length} named contacts, ${uniqueEmailCount} emails\n`);
}

try {
  let nextIndex = 0;
  async function worker(workerNumber: number): Promise<void> {
    const workerId = `worker-${workerNumber}`;
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= companies.length) return;
      const company = companies[index];
      try {
        await enrichCompany(company, workerId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown company enrichment error";
        failures.push({ domain: company.domain, error: message });
        await query(
          `update company_enrichment_run_item set status = 'failed', phase = 'failed', error_message = $3,
           finished_at = now(), updated_at = now() where run_id = $1 and company_id = $2`,
          [run.id, company.id, message],
        );
        process.stderr.write(`FAILED ${company.canonical_name} (${company.domain}): ${message}\n`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, companies.length) }, (_, index) => worker(index + 1)));
  if (failures.length > 0) throw new Error(`${failures.length} companies failed enrichment: ${failures.map((item) => item.domain).join(", ")}`);

  await query(
    `update company_enrichment_run r set status = 'completed',
     processed_count = totals.processed_count, search_credits_used = totals.search_credits,
     extract_credits_used = totals.extract_credits, finished_at = now()
     from (select count(*) filter (where status = 'completed')::int as processed_count,
       coalesce(sum(search_credits_used), 0)::int as search_credits,
       coalesce(sum(extract_credits_used), 0)::int as extract_credits
       from company_enrichment_run_item where run_id = $1) totals where r.id = $1`,
    [run.id],
  );
  console.log(JSON.stringify({ runId: run.id, companies: processed, providerMix, concurrency, searchCredits, extractCredits,
    enrichmentMode: "public-web-only" }, null, 2));
} catch (error) {
  await query(
    `update company_enrichment_run r set status = 'failed',
     processed_count = totals.processed_count, search_credits_used = totals.search_credits,
     extract_credits_used = totals.extract_credits, error_message = $2, finished_at = now()
     from (select count(*) filter (where status = 'completed')::int as processed_count,
       coalesce(sum(search_credits_used), 0)::int as search_credits,
       coalesce(sum(extract_credits_used), 0)::int as extract_credits
       from company_enrichment_run_item where run_id = $1) totals where r.id = $1`,
    [run.id, JSON.stringify({ message: error instanceof Error ? error.message : "Unknown enrichment error", failures })],
  );
  throw error;
} finally {
  await getPool().end();
}
