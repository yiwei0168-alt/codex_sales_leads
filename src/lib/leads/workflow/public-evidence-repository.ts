import { transaction } from "@/lib/rag/db";
import { leadEvidenceContentHash } from "@/lib/leads/evidence-snapshot";

import type { LeadEvidenceItem } from "./types";

interface ReusableEvidenceRow {
  chunk_id: string;
  document_version_id: string;
  canonical_url: string;
  source_type: "official-website" | "independent-public";
  title: string;
  content: string;
  content_sha256: string;
  freshness_status: "current" | "revalidated" | "stale";
  last_verified_at: Date | string;
}

function canonicalUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) url.port = "";
  return url.toString();
}

export async function findReusablePublicEvidence(input: {
  domain: string;
  countryCode: string;
  evidenceRunId: string;
  includeStale?: boolean;
  maximumChunks?: number;
}): Promise<{ evidence: LeadEvidenceItem[]; stale: boolean }> {
  const rows = await transaction(async (client) => (await client.query<ReusableEvidenceRow>(
    `select c.id as chunk_id, d.id as document_version_id, s.canonical_url, s.source_type,
            d.title, c.content, c.content_sha256, d.freshness_status, d.last_verified_at
       from public_evidence.company_entity e
       join public_evidence.document_entity de on de.company_entity_id=e.id
       join public_evidence.document_version d on d.id=de.document_version_id
       join public_evidence.source s on s.id=d.source_id
       join public_evidence.chunk c on c.document_version_id=d.id
      where lower(e.canonical_domain)=lower($1)
        and s.sharing_status='public'
        and d.freshness_status = any($2::text[])
        and (de.market_country_code is null or de.market_country_code=$3)
        and not exists (
          select 1 from public_evidence.document_version newer
           where newer.previous_version_id=d.id and newer.freshness_status <> 'invalid'
        )
      order by case d.freshness_status when 'current' then 0 when 'revalidated' then 1 else 2 end,
               d.last_verified_at desc, c.chunk_index
      limit $4`,
    [input.domain, input.includeStale === false ? ["current", "revalidated"] : ["current", "revalidated", "stale"],
      input.countryCode, Math.max(1, Math.min(20, input.maximumChunks ?? 8))],
  )).rows);
  return {
    evidence: rows.map((row) => ({
      id: `public-chunk-${row.chunk_id}`,
      url: row.canonical_url,
      title: row.title,
      excerpt: row.content,
      sourceType: row.source_type,
      provider: "public-evidence-library",
      capturedAt: new Date(row.last_verified_at).toISOString(),
      evidenceRunId: input.evidenceRunId,
      contentHash: leadEvidenceContentHash(row.content),
      freshnessStatus: row.freshness_status === "stale" ? "stale" : "revalidated",
      publicDocumentVersionId: row.document_version_id,
      publicChunkId: row.chunk_id,
    })),
    stale: rows.some((row) => row.freshness_status === "stale"),
  };
}

export async function persistPublicEvidence(input: {
  companyName: string;
  domain: string;
  countryCode: string;
  evidence: LeadEvidenceItem[];
}): Promise<void> {
  const shareable = input.evidence.filter((item) => item.sourceType === "official-website"
    || item.sourceType === "independent-public");
  if (shareable.length === 0) return;
  await transaction(async (client) => {
    const entity = await client.query<{ id: string }>(
      `insert into public_evidence.company_entity (canonical_name, canonical_domain, headquarters_country_code)
       values ($1,$2,$3)
       on conflict (canonical_domain) do update set canonical_name=excluded.canonical_name,
         headquarters_country_code=coalesce(public_evidence.company_entity.headquarters_country_code,
           excluded.headquarters_country_code), updated_at=now()
       returning id`, [input.companyName, input.domain, input.countryCode],
    );
    const entityId = entity.rows[0].id;
    for (const item of shareable) {
      const url = canonicalUrl(item.url);
      const sourceDomain = new URL(url).hostname;
      const source = await client.query<{ id: string }>(
        `insert into public_evidence.source (
           canonical_url, source_domain, source_type, country_codes, sharing_status, retention_mode, rights_metadata
         ) values ($1,$2,$3,$4,'public','excerpt-only',$5)
         on conflict (canonical_url) do update set updated_at=now(),
           country_codes=(select array_agg(distinct value) from unnest(
             public_evidence.source.country_codes || excluded.country_codes) value)
         returning id`,
        [url, sourceDomain, item.sourceType, [input.countryCode],
          JSON.stringify({ storedContent: "evidence-excerpt", acquisitionProvider: item.provider })],
      );
      const contentHash = item.contentHash ?? leadEvidenceContentHash(item.excerpt);
      const freshness = item.freshnessStatus === "fresh" ? "current"
        : item.freshnessStatus === "revalidated" ? "revalidated" : "stale";
      const document = await client.query<{ id: string }>(
        `insert into public_evidence.document_version (
           source_id, content_sha256, title, retrieved_at, last_verified_at, freshness_status,
           extraction_method, extraction_version, metadata
         ) values ($1,$2,$3,$4,$4,$5,$6,'public-evidence-v1',$7)
         on conflict (source_id, content_sha256) do update set
           last_verified_at=greatest(public_evidence.document_version.last_verified_at, excluded.last_verified_at),
           freshness_status=case when public_evidence.document_version.freshness_status='invalid'
             then 'invalid' else excluded.freshness_status end
         returning id`,
        [source.rows[0].id, contentHash, item.title, item.capturedAt, freshness, item.provider,
          JSON.stringify({ evidenceRunId: item.evidenceRunId ?? null })],
      );
      await client.query(
        `insert into public_evidence.document_entity (
           document_version_id, company_entity_id, market_country_code, relation
         ) values ($1,$2,$3,'about') on conflict do nothing`,
        [document.rows[0].id, entityId, input.countryCode],
      );
      await client.query(
        `insert into public_evidence.chunk (
           document_version_id, chunk_index, locator, content, token_estimate, content_sha256, metadata
         ) values ($1,0,$2,$3,$4,$5,$6)
         on conflict (document_version_id, chunk_index) do update set
           content=excluded.content, token_estimate=excluded.token_estimate,
           content_sha256=excluded.content_sha256, metadata=excluded.metadata`,
        [document.rows[0].id, JSON.stringify({ url }), item.excerpt,
          Math.ceil(item.excerpt.length / 4), leadEvidenceContentHash(item.excerpt),
          JSON.stringify({ sourceEvidenceId: item.id })],
      );
    }
  });
}
