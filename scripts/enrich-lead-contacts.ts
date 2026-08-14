import nextEnv from "@next/env";
import { extractDomainEmails, guessPersonalEmail, personNameFromPersonalEmail, personalizedEmailPattern } from "../src/lib/leads/contact-extraction";
import { getPool, query, transaction } from "../src/lib/rag/db";
import { SnovProvider, type SnovDomainEmail } from "../src/providers/snov";
import { TavilySearchProvider, type TavilySearchResult } from "../src/providers/tavily";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const workspaceId = "00000000-0000-4000-8000-000000000100";
const preferredDomains = [
  "astratelecom.com.mx",
  "bexadata.com.mx",
  "ethergroup.mx",
  "mcs.com.mx",
  "quattrocom.mx",
  "regiosis.com.mx",
  "sily.mx",
  "tecnopatch.com.mx",
  "netflow.mx",
  "cintegra.mx",
];
const requestedDomains = process.argv.find((value) => value.startsWith("--domains="))?.slice("--domains=".length).split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
const targetDomains = requestedDomains?.length ? requestedDomains.slice(0, 10) : preferredDomains;
const useSnov = !process.argv.includes("--no-snov");
const replaceExisting = process.argv.includes("--replace");
const tavily = new TavilySearchProvider();
const snov = new SnovProvider();

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

function snovFindings(items: SnovDomainEmail[]): { contacts: ContactFinding[]; emails: EmailFinding[] } {
  const contacts: ContactFinding[] = [];
  const emails: EmailFinding[] = [];
  for (const item of items) {
    const fullName = cleanPersonName(`${item.firstName ?? ""} ${item.lastName ?? ""}`);
    if (fullName) contacts.push({
      fullName,
      jobTitle: item.position,
      sourceUrl: item.sourceUrl ?? "https://app.snov.io/",
      provider: "snov",
      status: item.status === "Verified" ? "Verified" : "Inferred",
      confidence: item.status === "Verified" ? 90 : 65,
    });
    emails.push({
      email: item.email,
      status: item.status,
      sourceUrl: item.sourceUrl,
      provider: "snov",
      derivation: "Returned by Snov.io domain email search.",
      confidence: item.status === "Verified" ? 92 : item.status === "Invalid" ? 95 : 55,
      contactName: fullName ?? undefined,
    });
  }
  return { contacts, emails };
}

const companies = await query<CompanyRow>(
  `select c.id, c.canonical_name, lower(c.domain) as domain
   from workspace_company wc join sales_company c on c.id = wc.company_id
   where wc.workspace_id = $1 and c.source_kind = 'tavily-live' and lower(c.domain) = any($2::text[])
   order by array_position($2::text[], lower(c.domain))`,
  [workspaceId, targetDomains],
);
if (companies.length !== targetDomains.length) {
  const found = new Set(companies.map((company) => company.domain));
  throw new Error(`Missing active live leads: ${targetDomains.filter((domain) => !found.has(domain)).join(", ")}`);
}

const providerMix = ["tavily-search", "tavily-extract", ...(useSnov && snov.isConfigured() ? ["snov"] : [])];
const [run] = await query<{ id: string }>(
  `insert into company_enrichment_run (workspace_id, provider_mix, target_count, metadata)
   values ($1, $2, $3, $4) returning id`,
  [workspaceId, providerMix, companies.length, JSON.stringify({ domains: targetDomains, snovConfigured: snov.isConfigured(), noAutomaticSending: true })],
);

let searchCredits = 0;
let extractCredits = 0;
let processed = 0;

try {
  for (const company of companies) {
    const official = await tavily.search({
      query: `site:${company.domain} contacto ventas equipo nosotros correo email telefono`,
      country: "mexico",
      searchDepth: "basic",
      maxResults: 5,
      includeRawContent: true,
      includeDomains: [company.domain],
    });
    const publicWeb = await tavily.search({
      query: `"${company.canonical_name}" "${company.domain}" director gerente ventas compras founder LinkedIn email`,
      country: "mexico",
      searchDepth: "advanced",
      maxResults: 8,
      includeRawContent: true,
    });
    const domainEmails = await tavily.search({
      query: `site:${company.domain} "@${company.domain}"`,
      country: "mexico",
      searchDepth: "basic",
      maxResults: 8,
      includeRawContent: true,
      includeDomains: [company.domain],
    });
    searchCredits += official.creditsUsed + publicWeb.creditsUsed + domainEmails.creditsUsed;

    const resultMap = new Map<string, { result: TavilySearchResult; kind: "official-website" | "web-search" }>();
    for (const result of official.results) resultMap.set(result.url, { result, kind: "official-website" });
    for (const result of publicWeb.results) if (!resultMap.has(result.url)) resultMap.set(result.url, { result, kind: sameDomain(result.url, company.domain) ? "official-website" : "web-search" });
    for (const result of domainEmails.results) if (!resultMap.has(result.url)) resultMap.set(result.url, { result, kind: "official-website" });
    const combined = [...resultMap.values()];
    const officialUrls = combined.filter((item) => item.kind === "official-website").slice(0, 5).map((item) => item.result.url);
    const extracted = await tavily.extract(officialUrls);
    extractCredits += extracted.creditsUsed;
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

    if (useSnov && snov.isConfigured()) {
      const findings = snovFindings(await snov.domainEmails(company.domain));
      contacts.push(...findings.contacts);
      emailFindings.push(...findings.emails);
    }
    emailFindings.push(...guessedEmails(company, contacts, emailFindings));

    await transaction(async (client) => {
      if (replaceExisting) {
        await client.query(`delete from company_email_candidate where company_id = $1`, [company.id]);
        await client.query(`delete from company_contact where company_id = $1`, [company.id]);
      }
      for (const item of combined) {
        const content = extractedByUrl.get(item.result.url) ?? item.result.rawContent ?? item.result.content;
        await client.query(
          `insert into company_web_evidence (run_id, company_id, provider, source_kind, url, title, excerpt, provider_score)
           values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (run_id, company_id, url) do nothing`,
          [run.id, company.id, item.kind === "official-website" ? "tavily-extract" : "tavily-search", item.kind,
            item.result.url, item.result.title, normalizeText(content).slice(0, 2_000), item.result.score],
        );
      }
      const contactIds = new Map<string, string>();
      for (const contact of contacts) {
        const inserted = await client.query<{ id: string }>(
          `insert into company_contact (company_id, full_name, job_title, public_profile_url, source_url, source_provider, status, confidence)
           values ($1, $2, $3, $4, $5, $6, $7, $8)
           on conflict (company_id, full_name, source_url) do update set job_title = coalesce(excluded.job_title, company_contact.job_title),
             status = excluded.status, confidence = excluded.confidence, last_seen_at = now() returning id`,
          [company.id, contact.fullName, contact.jobTitle ?? null, contact.profileUrl ?? null, contact.sourceUrl, contact.provider, contact.status, contact.confidence],
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
          `insert into company_email_candidate (company_id, contact_id, email, status, source_url, source_provider, derivation, confidence)
           values ($1, $2, $3, $4, $5, $6, $7, $8)
           on conflict (company_id, email) do update set contact_id = coalesce(excluded.contact_id, company_email_candidate.contact_id),
             status = excluded.status, source_url = coalesce(excluded.source_url, company_email_candidate.source_url),
             source_provider = excluded.source_provider, derivation = excluded.derivation, confidence = excluded.confidence, last_seen_at = now()`,
          [company.id, item.contactName ? contactIds.get(item.contactName.toLocaleLowerCase("es")) ?? null : null,
            item.email, item.status, item.sourceUrl ?? null, item.provider, item.derivation ?? null, item.confidence],
        );
      }
      await client.query(`update company_enrichment_run set processed_count = processed_count + 1,
        search_credits_used = $2, extract_credits_used = $3 where id = $1`, [run.id, searchCredits, extractCredits]);
    });
    processed += 1;
    process.stdout.write(`${processed}/${companies.length} ${company.canonical_name}: ${contacts.length} named contacts, ${new Set(emailFindings.map((item) => item.email)).size} emails\n`);
  }

  await query(
    `update company_enrichment_run set status = 'completed', processed_count = $2, search_credits_used = $3,
     extract_credits_used = $4, finished_at = now() where id = $1`,
    [run.id, processed, searchCredits, extractCredits],
  );
  console.log(JSON.stringify({ runId: run.id, companies: processed, providerMix, searchCredits, extractCredits, snovConfigured: snov.isConfigured() }, null, 2));
} catch (error) {
  await query(
    `update company_enrichment_run set status = 'failed', processed_count = $2, search_credits_used = $3,
     extract_credits_used = $4, error_message = $5, finished_at = now() where id = $1`,
    [run.id, processed, searchCredits, extractCredits, error instanceof Error ? error.message : "Unknown enrichment error"],
  );
  throw error;
} finally {
  await getPool().end();
}
