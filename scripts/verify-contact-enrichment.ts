import nextEnv from "@next/env";
import { getPool, query } from "../src/lib/rag/db";
import { resolveTargetWorkspace } from "./resolve-target-workspace";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const workspaceId = (await resolveTargetWorkspace()).id;
const [run] = await query<{
  id: string; status: string; target_count: number; processed_count: number; search_credits_used: number;
  extract_credits_used: number; provider_mix: string[]; started_at: string;
}>(`select id, status, target_count, processed_count, search_credits_used, extract_credits_used, provider_mix, started_at
    from company_enrichment_run where workspace_id = $1 order by started_at desc limit 1`, [workspaceId]);
if (!run) throw new Error("No contact enrichment run found.");

const companies = await query<{
  name: string; domain: string; evidence_count: string; named_contacts: string; public_emails: string;
  verified_emails: string; guessed_emails: string; emails: Array<{ email: string; status: string; confidence: number }>;
  contacts: Array<{ name: string; title: string | null; status: string; confidence: number; source: string }>;
}>(
  `select c.canonical_name as name, c.domain,
     count(distinct e.id)::text as evidence_count,
     count(distinct ct.id)::text as named_contacts,
     count(distinct em.id) filter (where em.status = 'Public')::text as public_emails,
     count(distinct em.id) filter (where em.status = 'Verified')::text as verified_emails,
     count(distinct em.id) filter (where em.status = 'Pattern-guessed')::text as guessed_emails,
     coalesce(jsonb_agg(distinct jsonb_build_object('email', em.email, 'status', em.status, 'confidence', em.confidence))
       filter (where em.id is not null), '[]'::jsonb) as emails,
     coalesce(jsonb_agg(distinct jsonb_build_object('name', ct.full_name, 'title', ct.job_title, 'status', ct.status,
       'confidence', ct.confidence, 'source', ct.source_url)) filter (where ct.id is not null), '[]'::jsonb) as contacts
   from company_web_evidence e
   join sales_company c on c.id = e.company_id
   left join company_contact ct on ct.company_id = c.id
   left join company_email_candidate em on em.company_id = c.id
   where e.run_id = $1
   group by c.id, c.canonical_name, c.domain
   order by c.canonical_name`,
  [run.id],
);

const totals = companies.reduce((sum, company) => ({
  evidence: sum.evidence + Number(company.evidence_count),
  contacts: sum.contacts + Number(company.named_contacts),
  publicEmails: sum.publicEmails + Number(company.public_emails),
  verifiedEmails: sum.verifiedEmails + Number(company.verified_emails),
  guessedEmails: sum.guessedEmails + Number(company.guessed_emails),
}), { evidence: 0, contacts: 0, publicEmails: 0, verifiedEmails: 0, guessedEmails: 0 });

console.log(JSON.stringify({ run, totals, companies }, null, 2));
if (run.status !== "completed" || run.processed_count !== run.target_count || companies.length !== run.target_count) {
  throw new Error("Latest contact enrichment run is incomplete.");
}
if (companies.some((company) => Number(company.evidence_count) === 0)) throw new Error("At least one company has no web evidence.");
await getPool().end();
