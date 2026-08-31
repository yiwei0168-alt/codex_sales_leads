create schema if not exists public_evidence;

create table if not exists public_evidence.company_entity (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  canonical_domain text not null,
  headquarters_country_code char(2),
  aliases text[] not null default '{}',
  legal_entities jsonb not null default '[]',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canonical_domain)
);

create table if not exists public_evidence.source (
  id uuid primary key default gen_random_uuid(),
  canonical_url text not null unique,
  source_domain text not null,
  source_type text not null check (source_type in ('official-website', 'independent-public')),
  language text,
  country_codes char(2)[] not null default '{}',
  sharing_status text not null default 'quarantined'
    check (sharing_status in ('quarantined', 'public', 'withdrawn')),
  retention_mode text not null default 'full-content'
    check (retention_mode in ('full-content', 'excerpt-only', 'metadata-only')),
  rights_metadata jsonb not null default '{}',
  created_by uuid references app_user(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public_evidence.document_version (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public_evidence.source(id) on delete cascade,
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  media_type text not null default 'text/html',
  title text not null default '',
  full_content text,
  published_at timestamptz,
  retrieved_at timestamptz not null,
  last_verified_at timestamptz not null,
  freshness_status text not null
    check (freshness_status in ('current', 'revalidated', 'stale', 'superseded', 'conflicting', 'invalid')),
  extraction_method text not null,
  extraction_version text not null,
  previous_version_id uuid references public_evidence.document_version(id) on delete set null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (source_id, content_sha256)
);

create table if not exists public_evidence.document_entity (
  document_version_id uuid not null references public_evidence.document_version(id) on delete cascade,
  company_entity_id uuid not null references public_evidence.company_entity(id) on delete cascade,
  market_country_code char(2),
  business_unit text,
  relation text not null default 'about' check (relation in ('about', 'owned-by', 'partner-of', 'mentions')),
  primary key (document_version_id, company_entity_id, relation)
);

create table if not exists public_evidence.chunk (
  id uuid primary key default gen_random_uuid(),
  document_version_id uuid not null references public_evidence.document_version(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  locator jsonb not null default '{}',
  heading_path text[] not null default '{}',
  content text not null,
  token_estimate integer not null check (token_estimate >= 0),
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  search_vector tsvector generated always as (to_tsvector('simple', content)) stored,
  embedding vector(1536),
  embedding_model text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (document_version_id, chunk_index)
);

create table if not exists public_evidence.atomic_fact (
  id uuid primary key default gen_random_uuid(),
  company_entity_id uuid not null references public_evidence.company_entity(id) on delete cascade,
  fact_kind text not null,
  statement text not null,
  claim_status text not null check (claim_status in ('supported', 'unknown', 'conflicting', 'invalid')),
  market_country_codes char(2)[] not null default '{}',
  business_unit text,
  applicable_roles text[] not null default '{}',
  extraction_model text not null,
  prompt_version text not null,
  first_observed_at timestamptz not null,
  last_verified_at timestamptz not null,
  superseded_by uuid references public_evidence.atomic_fact(id) on delete set null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public_evidence.fact_chunk (
  fact_id uuid not null references public_evidence.atomic_fact(id) on delete cascade,
  chunk_id uuid not null references public_evidence.chunk(id) on delete cascade,
  relation text not null check (relation in ('supports', 'conflicts')),
  quote_start integer,
  quote_end integer,
  primary key (fact_id, chunk_id, relation)
);

create table if not exists public_evidence.usage_event (
  id uuid primary key default gen_random_uuid(),
  company_entity_id uuid references public_evidence.company_entity(id) on delete set null,
  source_id uuid references public_evidence.source(id) on delete set null,
  document_version_id uuid references public_evidence.document_version(id) on delete set null,
  chunk_id uuid references public_evidence.chunk(id) on delete set null,
  fact_id uuid references public_evidence.atomic_fact(id) on delete set null,
  run_id uuid references lead_search_run(id) on delete set null,
  workspace_id uuid references market_workspace(id) on delete set null,
  event_type text not null check (event_type in (
    'retrieved', 'cited', 'decision-used', 'displayed', 'selected', 'executed', 'revalidated', 'superseded'
  )),
  decision_impact jsonb not null default '{}',
  cost jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table lead_evidence_snapshot
  add column if not exists public_document_version_id uuid
    references public_evidence.document_version(id) on delete set null;
alter table lead_evidence_snapshot
  add column if not exists public_chunk_ids uuid[] not null default '{}';

create index if not exists public_evidence_entity_country_idx
  on public_evidence.company_entity(headquarters_country_code, canonical_name);
create index if not exists public_evidence_source_domain_idx
  on public_evidence.source(source_domain, source_type, sharing_status);
create index if not exists public_evidence_document_freshness_idx
  on public_evidence.document_version(source_id, freshness_status, last_verified_at desc);
create index if not exists public_evidence_document_entity_market_idx
  on public_evidence.document_entity(company_entity_id, market_country_code);
create index if not exists public_evidence_chunk_search_idx
  on public_evidence.chunk using gin(search_vector);
create index if not exists public_evidence_chunk_embedding_idx
  on public_evidence.chunk using hnsw (embedding vector_cosine_ops);
create index if not exists public_evidence_fact_company_idx
  on public_evidence.atomic_fact(company_entity_id, fact_kind, claim_status, last_verified_at desc);
create index if not exists public_evidence_usage_run_idx
  on public_evidence.usage_event(run_id, event_type, created_at);

grant usage on schema public_evidence to network_copilot_app;
grant select, insert, update, delete on all tables in schema public_evidence to network_copilot_app;
alter default privileges in schema public_evidence
  grant select, insert, update, delete on tables to network_copilot_app;

comment on schema public_evidence is
  'Cross-user public web evidence only. User-confirmed claims, private CRM data, path edits and email memory are prohibited.';
comment on column public_evidence.source.sharing_status is
  'Only public rows are eligible for cross-user retrieval; quarantined rows require source validation.';
comment on column public_evidence.document_version.freshness_status is
  'Stale is a user-visible freshness warning and is not equivalent to invalid.';
