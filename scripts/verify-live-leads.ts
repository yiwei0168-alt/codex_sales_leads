import nextEnv from "@next/env";
import { getPool, query } from "../src/lib/rag/db";
import type { CompanyRecord } from "../src/lib/domain";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

try {
  const [run] = await query<{
    id: string; status: string; target_count: number; query_count: number; raw_result_count: number;
    unique_candidate_count: number; accepted_count: number; credits_used: number;
  }>(`select id, status, target_count, query_count, raw_result_count, unique_candidate_count, accepted_count, credits_used
      from lead_search_run order by started_at desc limit 1`);
  const [counts] = await query<{ live: number; snapshot: number; workspace: number }>(
    `select count(*) filter (where c.source_kind = 'tavily-live')::int as live,
            count(*) filter (where c.source_kind = 'public-snapshot')::int as snapshot,
            count(*)::int as workspace
     from workspace_company wc join sales_company c on c.id = wc.company_id
     join market_workspace w on w.id = wc.workspace_id where w.slug = 'mexico-pilot'`,
  );
  const leads = await query<{ canonical_name: string; domain: string; record: CompanyRecord }>(
    `select c.canonical_name, c.domain, c.record from workspace_company wc
     join sales_company c on c.id = wc.company_id join market_workspace w on w.id = wc.workspace_id
     where w.slug = 'mexico-pilot' order by c.canonical_name`,
  );
  const invalidEvidence = leads.filter((lead) => !lead.record.evidence[0]?.sourceUrl?.startsWith("http"));
  const result = {
    run,
    counts,
    quality: {
      uniqueDomains: new Set(leads.map((lead) => lead.domain)).size,
      invalidEvidenceUrls: invalidEvidence.length,
      leadTypes: leads.reduce<Record<string, number>>((acc, lead) => {
        const type = lead.record.leadType ?? "Unknown"; acc[type] = (acc[type] ?? 0) + 1; return acc;
      }, {}),
    },
    leads: leads.map((lead) => ({ name: lead.canonical_name, domain: lead.domain, type: lead.record.leadType, role: lead.record.roles[0],
      score: lead.record.fitScore, source: lead.record.evidence[0]?.sourceUrl })),
  };
  console.log(JSON.stringify(result, null, 2));
  const expected = run?.target_count ?? 0;
  if (run?.status !== "completed" || run.accepted_count !== expected || counts.live !== expected || counts.snapshot !== 0 ||
      counts.workspace !== expected || result.quality.uniqueDomains !== expected || invalidEvidence.length > 0) process.exitCode = 1;
} finally {
  await getPool().end();
}
